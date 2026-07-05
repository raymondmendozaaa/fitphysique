// app/api/admin/users/invite/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// --- Helpers -------------------------------------------------

function getBearer(req) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || null;
}

function siteUrl(path = '/') {
  // Prefer env you already use on the client. Fallback to Vercel URL pattern.
  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'http://localhost:3000';
  return base.replace(/\/$/, '') + path;
}

function isStaff(role) {
  // Customize to your roles. If you only have 'admin', just check that.
  return role === 'admin' || role === 'staff';
}

// --- Route: POST --------------------------------------------
// Body: { userId, redirectTo? }
export async function POST(req) {
  if (process.env.VERCEL_ENV === "preview") {
    return new Response("Admin API disabled in Preview", { status: 403 });
  }

  try {
    const { userId, redirectTo = '/onboarding' } = await req.json();
    if (!userId) {
      return NextResponse.json({ message: 'userId is required' }, { status: 400 });
    }

    // 1) Authn the caller (admin/staff) using their bearer token
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

    // Check caller is admin/staff in your users table
    const { data: meProfile, error: meProfileErr } = await supabaseUserClient
      .from('users')
      .select('id, role')
      .eq('id', adminId)
      .single();

    if (meProfileErr || !meProfile || !isStaff(meProfile.role)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // 2) Fetch the target user's email
    const { data: target, error: targetErr } = await supabaseUserClient
      .from('users')
      .select('id, email')
      .eq('id', userId)
      .single();

    if (targetErr || !target?.email) {
      return NextResponse.json({ message: 'Target user not found or missing email' }, { status: 404 });
    }

    // 3) Use a *service-role* client to call admin APIs
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Official invite email (Supabase sends it). It can include a redirectTo.
    const { data: inviteRes, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
      target.email,
      { redirectTo: siteUrl(redirectTo) }
    );

    if (inviteErr) {
      console.error('inviteUserByEmail error:', inviteErr);
      return NextResponse.json({ message: inviteErr.message || 'Invite failed' }, { status: 500 });
    }

    // 4) Trace log
    const { error: logErr } = await adminClient
      .from('user_invites')
      .insert({
        user_id: userId,
        email: target.email,
        channel: 'email',
        magic_link: inviteRes?.action_link || null, // optional; can store it
        sent_by: adminId,
        sent_via: '/api/admin/users/invite',
        metadata: { redirectTo }
      });

    if (logErr) {
      // Non-fatal; keep response 200
      console.warn('user_invites insert failed:', logErr.message);
    }

    return NextResponse.json({
      email: target.email,
      actionLink: inviteRes?.action_link || null
    });
  } catch (err) {
    console.error('Invite route error:', err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}