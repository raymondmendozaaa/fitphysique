// ✅ /api/create-stripe-session.js
import Stripe from "stripe";
import { getPlanInfoById } from "@/lib/helpers/planUtils";
import { getStripePriceKey } from "@/lib/helpers/stripeUtils";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  try {
    const {
      user_id,
      plan_duration_id,
      requires_contract,
    } = await req.json();

    console.log("🛠️ Stripe session payload:", { user_id, plan_duration_id });

    // 1️⃣ Fetch plan info from Supabase
    const planInfo = await getPlanInfoById(plan_duration_id);

    // 2️⃣ Normalize keys and determine if it's Guest Pass
    const normalizedPlanKey = planInfo.plan_name.toUpperCase().replace(/[\s\-]+/g, "_");
    const normalizedDurationKey = planInfo.duration_label.toUpperCase().replace(/[\s\-]+/g, "_");
    const isGuestPass = normalizedPlanKey === "GUEST_PASS";

    // 3️⃣ Build env key using helper (this handles Guest Pass logic internally)
    const envKey = getStripePriceKey(planInfo.plan_name, planInfo.duration_label);
    console.log("🔑 Final Stripe ENV key:", envKey);

    const stripePriceId = process.env[envKey];

    if (!stripePriceId) {
      console.error("❌ Stripe Price ID not found for key:", envKey);
      return new Response(
        JSON.stringify({ error: `Stripe Price ID not found for ${envKey}` }),
        { status: 400 }
      );
    }

    // 4️⃣ Create Stripe session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: isGuestPass ? "payment" : "subscription",
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/onboarding`,
      metadata: {
        user_id,
        plan_duration_id,
        requires_contract: requires_contract.toString(),
      },
    });

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