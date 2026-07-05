import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchUserByEmail } from "@/lib/db/users";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  try {
    const { email, location_id, quantity } = await req.json();

    if (!email || !location_id || !quantity) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const quantityNum = Number(quantity);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    if (!Number.isInteger(quantityNum) || quantityNum < 1 || quantityNum > 10) {
      return NextResponse.json({ error: "Quantity must be an integer between 1 and 10." }, { status: 400 });
    }

    const { data: location, error: locationError } = await supabaseAdmin
      .from("locations")
      .select("id, name")
      .eq("id", location_id)
      .maybeSingle();

    if (locationError) {
      console.error("Error checking location:", locationError);
      return NextResponse.json({ error: "Error checking location" }, { status: 500 });
    }

    if (!location) {
      return NextResponse.json({ error: "Invalid gym location." }, { status: 400 });
    }

    // Validate that the email exists in Supabase
    let user;

    try {
      user = await fetchUserByEmail(supabaseAdmin, email, "id");
    } catch (userError) {
      console.error("Error checking user:", userError);
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
          price: process.env.STRIPE_GUEST_PASS,
          quantity: quantityNum,
        },
      ],
      metadata: {
        user_id: user.id,
        location_id: location.id,
        quantity: String(quantityNum),
        pass_source: "stripe",
      },
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/guest-pass/success`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/guest-pass/cancel`,
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    console.error("Error creating guest pass checkout:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}