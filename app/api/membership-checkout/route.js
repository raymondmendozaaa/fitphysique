import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// 🔹 Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🔹 Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  try {
    console.log("✅ API route hit!");

    // ✅ Extract data
    const body = await req.json();
    let { user_id, price_id, plan, contract_length } = body;
    console.log("🔍 Received API request:", { user_id, price_id, plan, contract_length });

    contract_length = contract_length || "None";

    // ✅ Validate request data
    if (!user_id || !price_id || !plan) {
      console.error("❌ Missing required fields:", { user_id, price_id, plan, contract_length });
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 🔍 Fetch plan_duration_id for the selected plan/duration combo
    const { data: durationData, error: durationError } = await supabase
      .from("plan_durations")
      .select("id")
      .eq("plan_name", plan)
      .eq("duration_label", contract_length)
      .single();

    if (durationError || !durationData) {
      console.error("❌ plan_duration_id lookup failed:", durationError);
      return NextResponse.json({ error: "Invalid plan/duration combo" }, { status: 400 });
    }

    const plan_duration_id = durationData.id;

    // 🔹 Load the site URL, fallback to localhost if missing
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    if (!siteUrl.startsWith("http")) {
      console.error("❌ Invalid NEXT_PUBLIC_SITE_URL:", siteUrl);
      return NextResponse.json({ error: "Invalid site URL" }, { status: 500 });
    }

    console.log("✅ Creating Stripe session for:", { user_id, price_id, plan, contract_length, plan_duration_id });

    // ✅ Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: price_id, quantity: 1 }],
      metadata: {
        user_id,
        plan_name: plan,
        contract_length,
        plan_duration_id,
        is_promotional: "false"
      },
      success_url: `${siteUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/membership/change`,
    });

    console.log("✅ Stripe session created:", session.id);
    return NextResponse.json({ sessionId: session.id });

  } catch (error) {
    console.error("❌ Stripe API Error:", error);
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 });
  }
}