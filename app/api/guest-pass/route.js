import { NextResponse } from "next/server";
import Stripe from "stripe";
<<<<<<< HEAD
import { supabase } from "@/lib/supabaseClient";
=======
>>>>>>> a13871cbcb0587d21345b91f28863c3e4151a8e6

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  try {
<<<<<<< HEAD
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
=======
    const { user_id } = await req.json();

    if (!user_id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

>>>>>>> a13871cbcb0587d21345b91f28863c3e4151a8e6
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
<<<<<<< HEAD
          price: process.env.STRIPE_GUEST_PASS, // Stripe price ID
          quantity: quantity, // Allow multiple guest passes
=======
          price: process.env.STRIPE_GUEST_PASS, // Guest pass price ID
          quantity: 1,
>>>>>>> a13871cbcb0587d21345b91f28863c3e4151a8e6
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/guest-pass/success`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/guest-pass/cancel`,
    });

<<<<<<< HEAD
    return NextResponse.json({ sessionId: session.id });
=======
    return NextResponse.json({ url: session.url });
>>>>>>> a13871cbcb0587d21345b91f28863c3e4151a8e6
  } catch (error) {
    console.error("Error creating guest pass checkout:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}