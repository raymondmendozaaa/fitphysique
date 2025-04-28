import Stripe from "stripe";
import { NextResponse } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const subscriptionId = searchParams.get("subscription_id");

  if (!subscriptionId) {
    return NextResponse.json({ error: "Missing subscription_id" }, { status: 400 });
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return NextResponse.json({ subscription });
  } catch (error) {
    console.error("Stripe subscription fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch subscription" }, { status: 500 });
  }
} 