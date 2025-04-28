import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabaseClient";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  try {
    const { email, location_id, quantity } = await req.json();

    if (!email || !location_id || !quantity) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate that the email exists in Supabase
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (userError) {
      return NextResponse.json({ error: "Error checking user" }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json({ error: "No account found with this email" }, { status: 400 });
    }

    // Create a Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price: process.env.STRIPE_GUEST_PASS, // Stripe price ID
          quantity: quantity, // Allow multiple guest passes
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/guest-pass/success`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/guest-pass/cancel`,
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    console.error("Error creating guest pass checkout:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}