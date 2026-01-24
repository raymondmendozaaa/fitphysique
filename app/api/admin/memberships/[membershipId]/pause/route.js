// app/api/admin/memberships/[membershipId]/pause/route.js
import { createServerClient } from "@supabase/ssr";
import { cookies as nextCookies } from "next/headers";
import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" }) : null;

export async function POST(req, { params }) {
  const membershipId = params?.membershipId;

  // auth + supabase
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.split(" ")[1] || "";
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });

  // body
  let body = {};
  try { body = await req.json(); } catch {}
  const isClear = !!body?.clear;
  const untilStr = (body?.until ?? "") || null;
  const pauseBilling = !!body?.pause_billing;
  const notes = body?.notes ?? null;

  // membership
  const { data: membership, error: mErr } = await supabase
    .from("memberships")
    .select("id, user_id, stripe_subscription_id")
    .eq("id", membershipId)
    .maybeSingle();
  if (mErr || !membership) return Response.json({ error: "Membership not found." }, { status: 404 });

  const now = new Date().toISOString();

  // compute pauseUntilISO
  let pauseUntilISO = null;
  if (!isClear && untilStr) {
    const d = new Date(untilStr);
    if (Number.isNaN(d.getTime())) {
      return Response.json({ error: "Invalid 'until' date." }, { status: 400 });
    }
    pauseUntilISO = d.toISOString();
  }

  // upsert override locally (null clears)
  const { error: upErr } = await supabase
    .from("membership_overrides")
    .upsert({
      membership_id: membership.id,
      user_id: membership.user_id,
      pause_until: isClear ? null : pauseUntilISO,
      notes,
      updated_by: user.id,
      updated_at: now,
    }, { onConflict: "membership_id" });
  if (upErr) return Response.json({ error: "Failed to save override." }, { status: 500 });

  // Mirror billing pause/unpause in Stripe only when requested AND we know a sub id
  if (stripe && membership.stripe_subscription_id) {
    try {
      if (isClear || !pauseBilling) {
        await stripe.subscriptions.update(membership.stripe_subscription_id, {
          pause_collection: null,
        });
      } else if (pauseBilling) {
        await stripe.subscriptions.update(membership.stripe_subscription_id, {
          pause_collection: { behavior: "mark_uncollectible" },
        });
      }
    } catch (e) {
      console.error("Stripe pause/unpause failed:", e);
      // don't fail the request
    }
  }

  // audit
  try {
    await supabase.from("admin_audit_logs").insert({
      action: isClear ? "membership_clear_pause" : "membership_pause",
      admin_user_id: user.id,
      target_membership_id: membership.id,
      target_user_id: membership.user_id,
      details: { pause_until: isClear ? null : pauseUntilISO, pause_billing: pauseBilling, notes },
      created_at: now,
    });
  } catch {}

  return Response.json({
    ok: true,
    membership_id: membership.id,
    pause_until: isClear ? null : pauseUntilISO,
    pause_billing: pauseBilling && !isClear,
  });
}