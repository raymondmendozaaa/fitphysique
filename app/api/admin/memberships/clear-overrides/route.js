// app/api/admin/memberships/clear-overrides/route.js
import { createServerClient } from "@supabase/ssr";
import { cookies as nextCookies } from "next/headers";
import { fetchMembershipById, updateMembershipById } from "@/lib/db/memberships";

export async function POST(req) {
  if (process.env.VERCEL_ENV === "preview") {
    return new Response("Admin API disabled in Preview", { status: 403 });
  }

  try {
    const body = await req.json();
    const membershipId = body?.membershipId;

    if (!membershipId) {
      return new Response(
        JSON.stringify({ ok: false, error: "No membershipId provided." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          async get(name) { return (await nextCookies()).get(name)?.value; },
          async set() {},
          async remove() {}
        }
      }
    );

    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();
    
    if (authError || !authUser) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    
    const { data: adminProfile, error: roleError } = await supabase
      .from("users")
      .select("role")
      .eq("id", authUser.id)
      .single();
    
    if (roleError || adminProfile?.role !== "admin") {
      return new Response(
        JSON.stringify({ ok: false, error: "Forbidden." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify the membership actually exists before trying to clear anything
    let existingMembership = null;

    try {
      existingMembership = await fetchMembershipById(supabase, membershipId);
    } catch (findErr) {
      console.error("❌ Failed to fetch membership:", findErr);
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to load membership." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!existingMembership) {
      return new Response(
        JSON.stringify({ ok: false, error: "Membership not found." }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Inspect schema to figure out which override columns exist
    const { data: cols, error: colsErr } = await supabase
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", "memberships");

    if (colsErr) {
      console.error(colsErr);
      return new Response("Failed to inspect schema", { status: 500 });
    }

    const existingCols = new Set((cols || []).map(c => c.column_name));

    // Candidates for reset
    const candidatesToNull = [
      "billing_day_override",
      "next_renewal_override",
      "price_override_cents",
      "price_override_currency",
      "proration_override_cents",
      "status_override",
      "pause_until",
      "pause_reason",
      "cancellation_scheduled_for",
      "cancellation_reason",
      "reactivate_on",
      "renewal_error",
      "renewed_at",
      "needs_contract",
      "location_override_id",
    ];

    const updateObj = {};

    for (const col of candidatesToNull) {
      if (existingCols.has(col)) updateObj[col] = null;
    }

    if (existingCols.has("renewal_pending")) updateObj["renewal_pending"] = false;
    if (existingCols.has("renew_at_discounted_rate")) updateObj["renew_at_discounted_rate"] = null;
    if (existingCols.has("auto_renewal_enabled_override")) updateObj["auto_renewal_enabled_override"] = null;

    if (Object.keys(updateObj).length === 0) {
      return new Response(
        JSON.stringify({ ok: true, updated: 0, note: "No override columns to clear." }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      await updateMembershipById(supabase, membershipId, updateObj);
    } catch (updErr) {
      console.error(updErr);
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to clear overrides." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, updated: 1 }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ ok: false, error: "Unexpected error." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}