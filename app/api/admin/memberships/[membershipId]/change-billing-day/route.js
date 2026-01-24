// app/api/admin/memberships/[membershipId]/change-billing-day/route.js
import { createServerClient } from "@supabase/ssr";
import { cookies as nextCookies } from "next/headers";

export async function POST(req, { params }) {
  const membershipId = params?.membershipId;

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.split(" ")[1] || null;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      cookies: {
        async get(name) { return (await nextCookies()).get(name)?.value; },
        async set(name, value, options) { (await nextCookies()).set(name, value, options); },
        async remove(name, options) { (await nextCookies()).delete(name, options); },
      },
    }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  // body
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
        desired_billing_day: null,
        updated_by: user.id ?? null,
        updated_at: now,
      }, { onConflict: "membership_id" });
    if (upErr) return Response.json({ error: "Failed to clear override." }, { status: 500 });

    try {
      await supabase.from("admin_audit_logs").insert({
        action: "membership_clear_billing_day_override",
        admin_user_id: user.id,
        target_membership_id: membership.id,
        target_user_id: membership.user_id,
        details: {},
        created_at: now,
      });
    } catch {}
    return Response.json({ ok: true, membership_id: membership.id, desired_billing_day: null }, { status: 200 });
  }

  // normal set
  const raw = body?.new_day ?? body?.day ?? body?.billing_day;
  const newDay = Number.parseInt(raw, 10);
  const notes = body?.notes ?? null;
  if (!Number.isFinite(newDay) || newDay < 1 || newDay > 28) {
    return Response.json({ error: "new_day must be an integer between 1 and 28." }, { status: 400 });
  }

  const patch = {
    membership_id: membership.id,
    user_id: membership.user_id,
    desired_billing_day: newDay,
    notes,
    updated_by: user.id ?? null,
    updated_at: now,
  };

  const { error: upErr } = await supabase
    .from("membership_overrides")
    .upsert(patch, { onConflict: "membership_id" });
  if (upErr) return Response.json({ error: "Failed to save override." }, { status: 500 });

  try {
    await supabase.from("admin_audit_logs").insert({
      action: "membership_change_billing_day",
      admin_user_id: user.id,
      target_membership_id: membership.id,
      target_user_id: membership.user_id,
      details: { new_day: newDay, notes },
      created_at: now,
    });
  } catch {}

  return Response.json({ ok: true, membership_id: membership.id, desired_billing_day: newDay }, { status: 200 });
}