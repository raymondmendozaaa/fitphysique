import Stripe from "stripe";
import { getPlanInfoByIdServer } from "@/lib/helpers/planUtils";
import { getStripePriceKey } from "@/lib/helpers/stripeUtils";
import { buildStripeMetadata } from "@/lib/helpers/buildStripeMetadata";
import { createServerClient } from "@supabase/ssr";
import { cookies as nextCookies } from "next/headers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function makeSupabase() {
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

async function resolveStripePriceIdDB({
  supabase,
  user_id,
  plan_duration_id,
  pricing_tier_override,
}) {
  const nowIso = new Date().toISOString();
  const allowedTiers = new Set(["standard", "legacy", "staff", "family"]);

  // Helper: validate tier strings defensively
  const sanitizeTier = (t) => (t && allowedTiers.has(t) ? t : null);

  // 0) admin override (validated)
  const overrideTier = sanitizeTier(pricing_tier_override);
  if (overrideTier) {
    const { data: row, error } = await supabase
      .from("plan_duration_prices")
      .select("stripe_price_id, is_active")
      .eq("plan_duration_id", plan_duration_id)
      .eq("tier", overrideTier)
      .eq("is_active", true)
      .maybeSingle();

    if (error) console.warn("plan_duration_prices override lookup error:", error?.message);
    if (row?.stripe_price_id) {
      return {
        priceId: row.stripe_price_id,
        source: `tier_override:${overrideTier}`,
        tierUsed: overrideTier,
      };
    }
  }

  // 1) user-specific override (time-windowed)
  const { data: override, error: ovErr } = await supabase
    .from("user_price_overrides")
    .select("stripe_price_id_override, starts_at, ends_at")
    .eq("user_id", user_id)
    .eq("plan_duration_id", plan_duration_id)
    .lte("starts_at", nowIso)
    .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
    .limit(1)
    .maybeSingle();

  if (ovErr) console.warn("user_price_overrides lookup error:", ovErr?.message);
  if (override?.stripe_price_id_override) {
    // Note: override sets priceId directly; tierUsed is unknown, but keep it meaningful
    return { priceId: override.stripe_price_id_override, source: "override", tierUsed: "override" };
  }

  // 2) derive tier: user tier if set & not expired
  const { data: userRow, error: uErr } = await supabase
    .from("users")
    .select("pricing_tier, pricing_tier_until")
    .eq("id", user_id)
    .single();

  if (uErr) console.warn("users tier lookup error:", uErr?.message);

  let tier = "standard";
  const userTier = sanitizeTier(userRow?.pricing_tier);
  if (userTier) {
    const until = userRow?.pricing_tier_until ?? null;
    const tierActive = !until || until >= nowIso;
    if (tierActive) tier = userTier;
  }

  // 2b) OPTION-1 DEFAULT RULE: if still standard, but user is in an active household => family
  // If later you choose Option 2, this becomes conditional on a household flag (recommended).
  if (tier === "standard") {
    const { data: hm, error: hmErr } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", user_id)
      .is("ended_at", null)
      .limit(1)
      .maybeSingle();

    if (hmErr) console.warn("household_members lookup error:", hmErr?.message);
    if (hm?.household_id) {
      tier = "family";
    }
  }

  // 3) tier mapping in plan_duration_prices
  const { data: tierRow, error: tErr } = await supabase
    .from("plan_duration_prices")
    .select("stripe_price_id, is_active")
    .eq("plan_duration_id", plan_duration_id)
    .eq("tier", tier)
    .eq("is_active", true)
    .maybeSingle();

  if (tErr) console.warn("plan_duration_prices tier lookup error:", tErr?.message);
  if (tierRow?.stripe_price_id) {
    return { priceId: tierRow.stripe_price_id, source: `tier:${tier}`, tierUsed: tier };
  }

  // 4) fallback to 'standard' mapping (must exist if using DB path)
  const { data: stdRow, error: sErr } = await supabase
    .from("plan_duration_prices")
    .select("stripe_price_id, is_active")
    .eq("plan_duration_id", plan_duration_id)
    .eq("tier", "standard")
    .eq("is_active", true)
    .single();

  if (sErr) console.warn("plan_duration_prices standard lookup error:", sErr?.message);
  if (stdRow?.stripe_price_id) {
    return { priceId: stdRow.stripe_price_id, source: "tier:standard", tierUsed: "standard" };
  }

  return { priceId: null, source: "none", tierUsed: tier };
}

export async function POST(req) {
  const t0 = Date.now();
  try {
    const {
      user_id,
      plan_duration_id,
      requires_contract,
      paid_in_full = false,
      auto_renewal_enabled = true,
      renew_at_discounted_rate = false,
      is_renewal = false,          // incoming from client (snake), we’ll normalize
      signature = "",
      agreed = "false",
      contract_id,
      contract_version,            // optional but supported by buildStripeMetadata
      ip_address,
      location_id,
      gps_accuracy,
      start_date,
      checkout_behavior,
      source,
      pricing_tier_override,
    } = await req.json();

    // Normalize keys
    const isRenewal = Boolean(is_renewal);

    console.log("🛠️ Stripe session payload:", {
      user_id,
      plan_duration_id,
      paid_in_full,
      auto_renewal_enabled,
      renew_at_discounted_rate,
      isRenewal,
    });

    // 1) Plan info
    const supabase = makeSupabase();
    const planInfo = await getPlanInfoByIdServer(supabase, plan_duration_id);
    if (!planInfo?.plan_name || !planInfo?.duration_label) {
      console.error("❌ Invalid plan info:", planInfo);
      return new Response(JSON.stringify({ error: "Invalid plan info" }), { status: 400 });
    }

    // 2) Guest Pass?
    const pn = String(planInfo.plan_name || "");
    const isGuestPass = pn.toLowerCase().startsWith("guest");

    // 3) Paid-in-Full logic
    const usePaidInFull = Boolean(paid_in_full);
    const useDiscountedRate = Boolean(renew_at_discounted_rate);

    // 4) Metadata (all strings)
    const metadata = buildStripeMetadata({
      user_id,
      plan_duration_id,
      requires_contract,
      paid_in_full: usePaidInFull,
      auto_renewal_enabled,
      renew_at_discounted_rate,
      isRenewal,                    // ✅ camelCase
      signature,
      agreed,
      contract_id,
      contract_version,
      ip_address,
      location_id,
      gps_accuracy,
      start_date,
      checkout_behavior,
      source,
    });

    // 5) Resolve price id (DB-first ➜ env fallback)
    let priceId = null;
    let priceSource = "none";

    // Try DB mapping (override ➜ tier ➜ standard)
    try {
      const resolved = await resolveStripePriceIdDB({ 
        supabase, 
        user_id, 
        plan_duration_id, 
        pricing_tier_override,
      });

      priceId = resolved.priceId;
      priceSource = resolved.source;
      let effectiveTierUsed = resolved.tierUsed;
    } catch (e) {
      console.warn("DB price resolution failed, will try ENV fallback:", e?.message || e);
    }

    if (!priceId) {
      const stripePriceKey = getStripePriceKey(
        planInfo.plan_name,
        planInfo.duration_label,
        usePaidInFull,
        useDiscountedRate,
        isRenewal
      );
      priceId = process.env[stripePriceKey] || null;
      priceSource = `env:${stripePriceKey}`;
    }

    console.log("🔑 Resolved Stripe Price:", { priceId, priceSource });
    if (!priceId) {
      console.error("❌ No Stripe Price configured", {
        plan: planInfo.plan_name,
        duration: planInfo.duration_label,
        isRenewal,
        paid_in_full,
        renew_at_discounted_rate,
        triedSource: priceSource, // likely "none" here
      });
      return new Response(
        JSON.stringify({ error: "No Stripe Price configured for this selection." }),
        { status: 400 }
      );
    }

    // 6) Mode + URLs
    const stripeMode = isGuestPass ? "payment" : "subscription";
    console.log("🔁 Stripe mode selected:", stripeMode);
      
    const baseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
      console.error("❌ Missing APP_BASE_URL / NEXT_PUBLIC_BASE_URL");
      return new Response(JSON.stringify({ error: "Base URL not configured" }), { status: 500 });
    }

    const requiresContractBool =
      typeof requires_contract === "boolean"
        ? requires_contract
        : Boolean(planInfo?.requires_contract);
      
    const isAdminFlow =
      typeof source === "string" && source.toLowerCase().includes("admin");
      
    const cancel_url = requiresContractBool
      ? `${baseUrl}/contract?user_id=${encodeURIComponent(
          user_id
        )}&plan_duration_id=${encodeURIComponent(
          plan_duration_id
        )}&source=${encodeURIComponent(source || "")}`
      : isAdminFlow
      ? `${baseUrl}/admin/customers/${encodeURIComponent(
          user_id
        )}?tab=memberships`
      : `${baseUrl}/onboarding`;
      
    const success_url = isAdminFlow
      ? `${baseUrl}/admin/customers/${encodeURIComponent(
          user_id
        )}?tab=memberships&checkout=success`
      : `${baseUrl}/onboarding`;

    console.log("🧭 Checkout debug", {
      plan: planInfo.plan_name,
      duration: planInfo.duration_label,
      priceId,
      priceSource,
      stripeMode,
      isAdminFlow,
      requiresContractBool,
    });

    if (!effectiveTierUsed) effectiveTierUsed = pricing_tier_override || "standard";

    const meta = {
      ...metadata,
      effective_price_tier: String(pricing_tier_override || effectiveTierUsed || "standard"),
      price_source: String(priceSource),   // e.g., "tier:legacy" or "env:STRIPE_STANDARD_MONTHLY"
      stripe_mode: stripeMode,             // "payment" or "subscription"
    };
    
    // 7) Build session payload
    const sessionPayload = {
      mode: stripeMode,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url,
      cancel_url,
      metadata: meta,
      allow_promotion_codes: true,
      client_reference_id: isAdminFlow ? `${user_id}:admin` : user_id,
    };

    if(stripeMode === "payment") {
      sessionPayload.payment_intent_data = { metadata: meta };
    }
    
    // For subscriptions, also mirror metadata to subscription_data and handle delayed billing
    if (stripeMode === "subscription") {
      sessionPayload.subscription_data = { metadata: meta };
    
      if (checkout_behavior === "bill_at_start_date" && start_date) {
        // Stripe expects a Unix timestamp (seconds)
        const trialEnd = Math.floor(new Date(`${start_date}T00:00:00`).getTime() / 1000);
        const now = Math.floor(Date.now() / 1000);
        if (trialEnd > now) {
          // ✅ correct property name
          sessionPayload.subscription_data.trial_end = trialEnd;
        }
      }
    }

    const session = await stripe.checkout.sessions.create(sessionPayload);

    // Mirror metadata to the created sub if Stripe returns a sub id
    if (stripeMode === "subscription" && session.subscription && !usePaidInFull) {
      try {
        await stripe.subscriptions.update(session.subscription, { metadata: meta });
      } catch (e) {
        console.warn("⚠️ Could not mirror metadata to subscription:", e?.message || e);
      }
    }

    console.log(`✅ Stripe session created in ${Date.now() - t0}ms:`, session.id);
    return new Response(JSON.stringify({ url: session.url }), { status: 200 });
  } catch (err) {
    console.error("❌ create-stripe-session failed:", {
      message: err?.message,
      type: err?.type,
      code: err?.code,
      raw: err?.raw?.message,
      stack: err?.stack,
    });
    return new Response(JSON.stringify({ error: "Failed to create Stripe session." }), { status: 500 });
  }
}