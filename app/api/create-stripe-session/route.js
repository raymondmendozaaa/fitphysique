import Stripe from "stripe";
import { getPlanInfoById } from "@/lib/helpers/planUtils";
import { getStripePriceKey } from "@/lib/helpers/stripeUtils";
import { buildStripeMetadata } from "@/lib/helpers/buildStripeMetadata";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  try {
    const {
      user_id,
      plan_duration_id,
      requires_contract,
      paid_in_full = false,
      auto_renewal_enabled = true,
      renew_at_discounted_rate = false,
      signature = "",  
      agreed = "false",
      contract_id,
    } = await req.json();


    console.log("🛠️ Stripe session payload:", {
      user_id,
      plan_duration_id,
      paid_in_full,
      auto_renewal_enabled,
      renew_at_discounted_rate,
    });

    // 1️⃣ Fetch plan info from Supabase
    const planInfo = await getPlanInfoById(plan_duration_id);

    if (!planInfo?.plan_name || !planInfo?.duration_label) {
      console.error("❌ Invalid plan info:", planInfo);
      return new Response(
        JSON.stringify({ error: "Invalid plan info" }),
        { status: 400 }
      );
    }

    // 2️⃣ Determine if it's a Guest Pass
    const isGuestPass =
      planInfo.plan_name === "Guest-Pass" ||
      planInfo.plan_name.startsWith("Guest Pass");

    // 3️⃣ Determine Paid in Full logic
    const usePaidInFull = paid_in_full || renew_at_discounted_rate;
    console.log("✅ Paid in Full:", usePaidInFull);

    const metadata = buildStripeMetadata({
      user_id,
      plan_duration_id,
      requires_contract,
      paid_in_full: usePaidInFull,
      auto_renewal_enabled,
      renew_at_discounted_rate,
      signature,
      agreed,
      contract_id,
    });

    // 4️⃣ Get Stripe Price Key using the helper (Paid in Full or Regular)
    const stripePriceKey = getStripePriceKey(planInfo.plan_name, planInfo.duration_label, paid_in_full);
    const stripePriceId = process.env[stripePriceKey];

    console.log("🔑 Stripe Price Key:", stripePriceKey);
    console.log("🔑 Stripe Price ID:", stripePriceId);

    if (!stripePriceId) {
      console.error("❌ Stripe Price ID not found for key:", stripePriceKey);
      return new Response(
        JSON.stringify({ error: `Stripe Price ID not found for ${stripePriceKey}` }),
        { status: 400 }
      );
    }

    console.log("🔁 Stripe mode selected:", isGuestPass ? "payment" : usePaidInFull ? "payment" : "subscription");

    // 5️⃣ Create Stripe Checkout Session
    const stripeMode = isGuestPass || usePaidInFull ? "payment" : "subscription";
      
    const sessionPayload = {
      payment_method_types: ["card"],
      mode: stripeMode,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/membership/change`,
      metadata,
    };
    
    if (stripeMode === "subscription") {
      sessionPayload.subscription_data = { metadata };
    }
    
    const session = await stripe.checkout.sessions.create(sessionPayload);

    if (!isGuestPass && !usePaidInFull && session.subscription) {
      await stripe.subscriptions.update(session.subscription, {
        metadata,
      });
    }

    console.log("✅ Stripe session created:", session.url);
    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
    });
  } catch (err) {
    console.error("❌ Stripe session creation failed:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
    });
  }
}