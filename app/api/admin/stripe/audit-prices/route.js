// app/api/admin/stripe/audit-prices/route.js
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies as nextCookies } from "next/headers";
import { fetchUserRoleById } from "@/lib/db/users";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function makeSupabaseAuth() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) { return nextCookies().get(name)?.value; },
        async set() {},
        async remove() {},
      },
    }
  );
}

async function requireAdmin(req) {
  const supabaseAuth = makeSupabaseAuth();

  // Prefer Bearer token (works from fetch calls); fallback to cookies (works from browser session)
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;

  const { data: userData, error: userErr } = token
    ? await supabaseAuth.auth.getUser(token)
    : await supabaseAuth.auth.getUser();

  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const userId = userData.user.id;

  // Role check must be done with service role (or anon+RLS if you have it), so use supabaseAdmin here.
  const u = await fetchUserRoleById(supabaseAdmin, userId);

  if (!u) return { ok: false, status: 401, error: "Unauthorized" };
  if ((u?.role || "").toLowerCase() !== "admin") {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, userId };
}

export async function POST(req) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }
    // 1) Load active price mappings
    const { data: rows, error: prErr } = await supabaseAdmin
      .from("plan_duration_prices")
      .select("plan_duration_id, tier, stripe_price_id, is_active")
      .eq("is_active", true);

    if (prErr) throw prErr;

    const priceIds = Array.from(
      new Set((rows || []).map(r => r.stripe_price_id).filter(Boolean))
    );

    // 2) Pull Stripe prices
    const results = await Promise.all(
      priceIds.map(async (pid) => {
        try {
          const p = await stripe.prices.retrieve(pid);
          return { id: pid, ok: true, active: !!p.active, currency: p.currency, unit_amount: p.unit_amount, type: p.type, recurring: !!p.recurring };
        } catch (e) {
          return { id: pid, ok: false, error: e?.message || "Stripe retrieve failed" };
        }
      })
    );

    const stripeMap = new Map(results.map(r => [r.id, r]));

    // 3) Report missing/invalid
    const invalid = [];
    for (const r of rows || []) {
      const pid = r.stripe_price_id;
      const info = stripeMap.get(pid);

      if (!pid || !String(pid).startsWith("price_")) {
        invalid.push({ ...r, issue: "invalid_price_id_format" });
        continue;
      }
      if (!info?.ok) {
        invalid.push({ ...r, issue: "not_found_in_stripe", stripe_error: info?.error });
        continue;
      }
      if (!info.active) {
        invalid.push({ ...r, issue: "stripe_price_inactive" });
      }
    }

    return NextResponse.json({
      ok: true,
      totals: {
        mappings: rows?.length || 0,
        unique_price_ids: priceIds.length,
        invalid: invalid.length,
      },
      invalid,
      sample: results.slice(0, 20),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "Audit failed" }, { status: 500 });
  }
}