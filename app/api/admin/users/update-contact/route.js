// app/api/admin/users/update-contact/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendAdminAlertEmail } from '@/lib/email/sendAdminAlertEmail';
import { getNowUtcIso, toValidDate } from "@/lib/utils/dateTime";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function clientWithToken(req) {
  const token = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: token } },
  });
}

function adminClient() {
  return supabaseAdmin;
}

function firstIpFromHeader(value) {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first || null;
}

function getUtcIsoMinutesAgo(minutes) {
  const now = toValidDate(getNowUtcIso());
  if (!now) return getNowUtcIso();

  return new Date(now.getTime() - minutes * 60 * 1000).toISOString();
}

// centralized audit helper
async function logAudit({ admin, callerId, userId, action, changed, result, emailChanged, req, error, reason }) {
  const xfwd = req.headers.get('x-forwarded-for');
  const ip = firstIpFromHeader(xfwd);
  const ua = req.headers.get('user-agent') || null;

  const details = {
    result,                                   // "success" | "no_change" | "failed"
    changed_fields: changed || {},            // diff
    auth_email_updated: !!emailChanged,
    reason: reason || null,
    error: error ? String(error) : null,
  };

  await admin.from('admin_audit_logs').insert({
    admin_id: callerId,
    target_user_id: userId,
    action,
    details,
    ip,
    user_agent: ua,
  });
}

// Proper count fetch (Supabase JS nuance)
async function getRecentCount({ admin, callerId }) {
  const { count } = await admin
    .from('admin_audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('admin_id', callerId)
    .gte('created_at', getUtcIsoMinutesAgo(1));
  return count || 0;
}

export async function POST(req) {
  if (process.env.VERCEL_ENV === "preview") {
    return new Response("Admin API disabled in Preview", { status: 403 });
  }

  const ACTION = 'update_contact';
  const admin = adminClient();

  let callerId = null;
  let userId = null;
  let payload = null;
  let targetUserRow = null;
  let emailChanged = false;
  let changed = {};

  try {
    payload = await req.json();
    const { userId: _userId, full_name, email, phone, sms_opt_in, reason } = payload || {};
    userId = _userId;

    if (!userId || !email) {
      return NextResponse.json({ message: 'userId and email are required.' }, { status: 400 });
    }

    // Auth caller
    const supabaseCaller = clientWithToken(req);
    const { data: callerAuth, error: callerErr } = await supabaseCaller.auth.getUser();
    if (callerErr || !callerAuth?.user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    callerId = callerAuth.user.id;

    // Ensure admin role
    const { data: callerRow, error: callerRowErr } = await supabaseCaller
      .from('users')
      .select('id, role, email, full_name')
      .eq('id', callerId)
      .single();

    if (callerRowErr || !callerRow || callerRow.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden: admin only' }, { status: 403 });
    }

    // Rate-limit: max 20 edits/min per admin
    const recentCount = await getRecentCount({ admin, callerId });
    if (recentCount >= 20) {
      await logAudit({
        admin, callerId, userId, action: ACTION, changed: {},
        result: 'failed', emailChanged: false, req,
        error: `rate_limited (${recentCount}/min)`, reason
      });
      return NextResponse.json({ message: 'Rate limit exceeded. Try again in a minute.' }, { status: 429 });
    }

    // Load target with compare fields
    const resTarget = await admin
      .from('users')
      .select('id, full_name, email, phone, sms_opt_in')
      .eq('id', userId)
      .single();
    targetUserRow = resTarget.data;
    if (resTarget.error || !targetUserRow) {
      await logAudit({
        admin, callerId, userId, action: ACTION, changed: {},
        result: 'failed', emailChanged: false, req,
        error: 'Target user not found', reason
      });
      return NextResponse.json({ message: 'Target user not found' }, { status: 404 });
    }

    // Require a reason if changing sensitive fields (email for now)
    const willChangeEmail =
      (targetUserRow.email || '').toLowerCase() !== (email || '').toLowerCase();
    if (willChangeEmail && !reason) {
      return NextResponse.json({ message: 'Reason is required when changing email.' }, { status: 400 });
    }

    // Update public.users
    const upd = await admin
      .from('users')
      .update({
        full_name: full_name ?? null,
        email,
        phone: phone ?? null,
        sms_opt_in: !!sms_opt_in,
      })
      .eq('id', userId);

    if (upd.error) {
      await logAudit({
        admin, callerId, userId, action: ACTION, changed: {},
        result: 'failed', emailChanged: false, req,
        error: upd.error.message, reason
      });
      return NextResponse.json(
        { message: 'Failed to update user profile', detail: upd.error.message },
        { status: 500 }
      );
    }

    // If email changed, update Auth
    emailChanged = willChangeEmail;
    if (emailChanged) {
      const authUpd = await admin.auth.admin.updateUserById(userId, { email });
      if (authUpd.error) {
        // revert profile email
        await admin.from('users').update({ email: targetUserRow.email }).eq('id', userId);
        await logAudit({
          admin, callerId, userId, action: ACTION, changed: {},
          result: 'failed', emailChanged: false, req,
          error: authUpd.error.message || 'auth update failed', reason
        });
        return NextResponse.json(
          { message: 'Failed to update auth email; reverted profile email.', detail: authUpd.error?.message },
          { status: 500 }
        );
      }
    }

    // compute diff
    const addChange = (k, a, b) => ((a ?? null) !== (b ?? null)) && (changed[k] = { old: a ?? null, new: b ?? null });
    addChange('full_name', targetUserRow.full_name, full_name ?? null);
    addChange('email',     targetUserRow.email,      email);
    addChange('phone',     targetUserRow.phone,      phone ?? null);
    addChange('sms_opt_in',targetUserRow.sms_opt_in, !!sms_opt_in);

    // audit success/no_change
    await logAudit({
      admin, callerId, userId, action: ACTION, changed,
      result: Object.keys(changed).length ? 'success' : 'no_change', emailChanged, req, reason
    });

    // alert on sensitive change
    if (emailChanged) {
      const adminName = callerRow.full_name || callerRow.email || callerId;
      const targetName = targetUserRow.full_name || targetUserRow.email || userId;
      await sendAdminAlertEmail({
        subject: '⚠️ Member email changed',
        text: `Admin ${adminName} changed ${targetName}'s email:
      ${targetUserRow.email} → ${email}
            
      Reason: ${reason || '(none)'}
      Time: ${getNowUtcIso()}
      `,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    // best-effort audit failure
    try {
      const admin = adminClient();
      if (callerId && userId) {
        await logAudit({
          admin, callerId, userId, action: 'update_contact', changed: {},
          result: 'failed', emailChanged: false, req,
          error: e?.message || String(e),
          reason: payload?.reason
        });
      }
    } catch {}
    console.error(e);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}