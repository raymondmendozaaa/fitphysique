// app/api/memberships/admin-activate/route.js
import { createServerClient } from "@supabase/ssr";
import { cookies as nextCookies } from "next/headers";

function addMonthsISO(iso, months) {
  const d = new Date(iso);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // End-of-month rollover (Jan 31 + 1 month → Feb 28/29)
  if (d.getDate() < day) d.setDate(0);
  return d.toISOString();
}

function addDaysISO(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export async function POST(req) {
  try {
    const {
      user_id,
      plan_duration_id,
      auto_renewal_enabled,
      renew_at_discounted_rate,
      source,
      // Optional payment object from the admin modal:
      // { amount_cents, currency?, method?, provider?, description? }
      payment,
    } = await req.json();

    if (!user_id || !plan_duration_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "user_id and plan_duration_id are required." }),
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
          async remove() {},
        },
      }
    );

    // Load plan info
    const { data: pd, error: pdErr } = await supabase
      .from("plan_durations")
      .select("id, plan_name, duration_label, requires_contract, duration_in_months, duration_in_days")
      .eq("id", plan_duration_id)
      .single();

    if (pdErr || !pd) {
      return new Response(
        JSON.stringify({ ok: false, error: "Plan duration not found." }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Compute start/end
    const now = new Date().toISOString();
    let expires_at = null;
    if (pd.duration_in_months && pd.duration_in_months > 0) {
      expires_at = addMonthsISO(now, pd.duration_in_months);
    } else if (pd.duration_in_days && pd.duration_in_days > 0) {
      expires_at = addDaysISO(now, pd.duration_in_days);
    }

    // Single-row-per-user rule
    const { data: existingList, error: findErr } = await supabase
      .from("memberships")
      .select("id")
      .eq("user_id", user_id)
      .limit(1);

    if (findErr) {
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to check existing membership." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const upsertPayload = {
      user_id,
      status: "active",
      plan_name: pd.plan_name,
      duration_label: pd.duration_label,
      start_date: now,
      expires_at,
      requires_contract: !!pd.requires_contract,
      needs_contract: false, // manual flow: assume handled offline
      auto_renewal_enabled: !!auto_renewal_enabled,
      renew_at_discounted_rate: renew_at_discounted_rate ?? null,
      pass_source: source || "admin-manual",
    };

    let membership_id = null;
    if (existingList && existingList.length > 0) {
      membership_id = existingList[0].id;
      const { error: updErr } = await supabase
        .from("memberships")
        .update(upsertPayload)
        .eq("id", membership_id);
      if (updErr) {
        return new Response(
          JSON.stringify({ ok: false, error: "Failed to update membership." }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      const { data: ins, error: insErr } = await supabase
        .from("memberships")
        .insert(upsertPayload)
        .select("id")
        .single();
      if (insErr) {
        return new Response(
          JSON.stringify({ ok: false, error: "Failed to insert membership." }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
      membership_id = ins?.id || null;
    }

    // Optional: record manual payment
    let payment_recorded = false;
    if (payment && payment.amount_cents && membership_id) {
      const payRow = {
        user_id,
        membership_id,
        amount_cents: payment.amount_cents,
        currency: payment.currency || "USD",
        status: "succeeded",
        method: payment.method || "cash",
        provider: payment.provider || "manual",
        description: payment.description || "Manual activation payment",
        created_at: new Date().toISOString(),
      };
      const { error: payErr } = await supabase.from("payments").insert(payRow);
      if (payErr) {
        console.error("Payment insert failed:", payErr);
        // Don’t fail the activation—just signal payment issue.
        return new Response(
          JSON.stringify({
            ok: true,
            membership_id,
            mode: existingList?.length ? "updated" : "inserted",
            payment_recorded: false,
            payment_error: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      payment_recorded = true;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        membership_id,
        mode: existingList?.length ? "updated" : "inserted",
        payment_recorded,
      }),
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