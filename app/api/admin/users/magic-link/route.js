// app/api/admin/users/magic-link/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/mailer';

// Reuse a single service-role client across requests (warm container)
// NOTE: service key must stay server-side only.
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --- Helpers -------------------------------------------------
function getBearer(req) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || null;
}

function siteUrl(path = '/') {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `http://localhost:${process.env.PORT || 3000}`;
  return base.replace(/\/$/, '') + path;
}

function isStaff(role) {
  return role === 'admin' || role === 'staff';
}

// --- Route: POST --------------------------------------------
// Body: { userId, channel?, override?, override_reason?, purpose?, next? }
export async function POST(req) {
  if (process.env.VERCEL_ENV === "preview") {
    return new Response("Admin API disabled in Preview", { status: 403 });
  }

  try {
    const {
      userId,
      channel = 'copy',         // 'copy' | 'sms' | 'qr' | 'email' | 'manual'
      override = false,
      override_reason,
      // NEW:
      purpose = 'login',        // 'login' | 'signup' | 'recovery'
      next = '/member',         // where /auth/finish should route after completion
    } = await req.json();

    if (!userId) {
      return NextResponse.json({ message: 'userId is required' }, { status: 400 });
    }

    // 1) Authn caller
    const bearer = getBearer(req);
    if (!bearer) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${bearer}` } } }
    );

    const { data: meData, error: meErr } = await supabaseUserClient.auth.getUser();
    if (meErr || !meData?.user) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }
    const adminId = meData.user.id;

    const { data: meProfile, error: meProfileErr } = await supabaseUserClient
      .from('users')
      .select('id, role')
      .eq('id', adminId)
      .single();

    if (meProfileErr || !meProfile || !isStaff(meProfile.role)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // 2) Fetch target
    const { data: target, error: targetErr } = await supabaseUserClient
      .from('users')
      .select('id, email, phone, sms_opt_in')
      .eq('id', userId)
      .single();

    if (targetErr || !target) {
      return NextResponse.json({ message: 'Target user not found' }, { status: 404 });
    }
    if (!target.email) {
      return NextResponse.json({ message: 'User is missing an email' }, { status: 400 });
    }

    // 3) Channel-specific enforcement
    if (channel === 'sms') {
      if (!target.phone) {
        return NextResponse.json({ message: 'User has no phone number on file' }, { status: 400 });
      }
      if (!target.sms_opt_in && !override) {
        return NextResponse.json({ message: 'User has not opted into SMS' }, { status: 403 });
      }
    }

    const mode = purpose === 'login' ? 'magiclink' : purpose; // for the /auth/finish UI
    const finishUrl = siteUrl(`/auth/finish?mode=${encodeURIComponent(mode)}&next=${encodeURIComponent(next)}`);

    let linkType = 'magiclink';
    if (purpose === 'signup') linkType = 'signup';
    else if (purpose === 'recovery') linkType = 'recovery';

    // primary attempt
    let { data: linkRes, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: linkType,
      email: target.email,
      options: { redirectTo: finishUrl },
    });

    // graceful fallback: if signing up an email that already exists, fall back to magiclink
    if (linkErr && purpose === 'signup' && linkErr.status === 422) {
      const { data: fb, error: fbErr } = await adminClient.auth.admin.generateLink({
        type: 'magiclink',
        email: target.email,
        options: { redirectTo: siteUrl(`/auth/finish?mode=magiclink&next=${encodeURIComponent(next)}`) },
      });
      if (fbErr) {
        console.error('generateLink fallback error:', fbErr);
        return NextResponse.json({ message: 'Failed to create magic link' }, { status: 500 });
      }
      linkRes = fb;
    } else if (linkErr) {
      console.error('generateLink error:', linkErr);
      return NextResponse.json({ message: 'Failed to create magic link' }, { status: 500 });
    }

    const magicLink = linkRes?.properties?.action_link;
    if (!magicLink) {
      return NextResponse.json({ message: 'Failed to create magic link' }, { status: 500 });
    }

    // ✉️ If channel === 'email', send it now
    if (channel === 'email') {
      const subject =
        purpose === 'signup'
          ? 'Finish setting up your account'
          : purpose === 'recovery'
          ? 'Reset your password'
          : 'Your secure sign-in link';
    
      const actionLabel =
        purpose === 'signup' ? 'Set up account' :
        purpose === 'recovery' ? 'Reset password' :
        'Sign in';
    
      const html = `
        <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#111">
          <h2 style="margin:0 0 16px">Hi there 👋</h2>
          <p style="margin:0 0 16px">
            Click the button below to ${purpose === 'signup'
              ? 'set your password and finish onboarding.'
              : purpose === 'recovery'
              ? 'reset your password.'
              : 'sign in securely.'}
          </p>
          <p style="margin:0 0 16px">
            <a href="${magicLink}"
               style="display:inline-block;padding:12px 16px;border-radius:8px;background:#facc15;color:#111;text-decoration:none;font-weight:600">
              ${actionLabel}
            </a>
          </p>
          <p style="margin:16px 0 0;font-size:12px;color:#555">
            If the button doesn’t work, copy and paste this link:<br/>
            <span style="word-break:break-all">${magicLink}</span>
          </p>
        </div>
      `;
            
      try {
        await sendEmail({ to: target.email, subject, html });
      } catch (e) {
        console.error('Email send failed:', e);
        return NextResponse.json({ message: 'Email failed to send' }, { status: 502 });
      }
    }

    // 4) Trace log (optional table; keeps your existing behavior)
    const consent_source =
      channel === 'sms'
        ? (target.sms_opt_in ? 'user_opt_in' : (override ? 'admin_override' : 'blocked'))
        : 'n/a';

    const { error: logErr } = await adminClient
      .from('user_invites')
      .insert({
        user_id: target.id,
        email: target.email,
        phone: target.phone || null,
        channel,                        // 'copy' | 'sms' | 'qr' | 'email' | 'manual'
        magic_link: magicLink,
        sent_by: adminId,
        sent_via: '/api/admin/users/magic-link',
        override_used: channel === 'sms' ? (!!override && !target.sms_opt_in) : false,
        override_reason: channel === 'sms' ? (override_reason || null) : null,
        consent_source,
        // NEW debug/context:
        metadata: { purpose, mode, next, finishUrl },
      });

    if (logErr) {
      console.warn('user_invites insert failed:', logErr.message);
    }

    return NextResponse.json({ email: target.email, magicLink, sent: channel === 'email' });
  } catch (err) {
    console.error('Magic-link route error:', err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}