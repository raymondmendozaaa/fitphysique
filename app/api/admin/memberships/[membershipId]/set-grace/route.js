// app/api/admin/memberships/[membershipId]/set-grace/route.js
import { createServerClient } from "@supabase/ssr";
import { cookies as nextCookies } from "next/headers";

export async function POST(req, ctx) {
  const { membershipId } = await ctx.params;

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.split(" ")[1] || "";
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: token ? `Bearer ${token}` : "" } },
      cookies: {
        async get(name) { return (await nextCookies()).get(name)?.value; },
        async set(name, value, options) { (await nextCookies()).set(name, value, options); },
        async remove(name, options) { (await nextCookies()).delete(name, options); },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  let body = {};
  try { body = await req.json(); } catch {}
  const isClear = !!body?.clear;

  // membership
  const { data: membership, error: mErr } = await supabase
    .from("memberships")
    .select("id, user_id")
    .eq("id", membershipId)
    .maybeSingle();
  if (mErr || !membership) return Response.json({ error: "Membership not found." }, { status: 404 });

  const now = new Date().toISOString();

  if (isClear) {
    const { error: upErr } = await supabase
      .from("membership_overrides")
      .upsert({
        membership_id: membership.id,
        user_id: membership.user_id,
        grace_start: null,
        grace_end: null,
        updated_by: user.id ?? null,
        updated_at: now,
      }, { onConflict: "membership_id" });
    if (upErr) return Response.json({ error: "Failed to clear grace." }, { status: 500 });

    try {
      await supabase.from("admin_audit_logs").insert({
        action: "membership_clear_grace",
        admin_user_id: user.id,
        target_membership_id: membership.id,
        target_user_id: membership.user_id,
        details: {},
        created_at: now,
      });
    } catch {}
    return Response.json({ ok: true, membership_id: membership.id, grace_start: null, grace_end: null }, { status: 200 });
  }

  // normal set
  const startStr = body?.start;
  const endStr = body?.end;
  const notes = body?.notes ?? null;

  if (!startStr || !endStr) {
    return Response.json({ error: "start and end are required (ISO dates)." }, { status: 400 });
  }

  const start = new Date(startStr);
  const end = new Date(endStr);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return Response.json({ error: "Invalid date range. end must be after start." }, { status: 400 });
  }

  const { error: upErr } = await supabase
    .from("membership_overrides")
    .upsert({
      membership_id: membership.id,
      user_id: membership.user_id,
      grace_start: start.toISOString(),
      grace_end: end.toISOString(),
      notes,
      updated_by: user?.id ?? null,
      updated_at: now,
    }, { onConflict: "membership_id" });
  if (upErr) return Response.json({ error: "Failed to save override." }, { status: 500 });

  try {
    await supabase.from("admin_audit_logs").insert({
      action: "membership_set_grace",
      admin_user_id: user?.id ?? null,
      target_membership_id: membership.id,
      target_user_id: membership.user_id,
      details: { start: startStr, end: endStr, notes },
      created_at: now,
    });
  } catch {}

  return Response.json({
    ok: true,
    membership_id: membership.id,
    grace_start: start.toISOString(),
    grace_end: end.toISOString(),
    updated_at: now,
  });
}