import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { handleStripeEvent } from '@/lib/utils/stripeWebhookHandler'; // ✅ Adjust path if needed

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  let event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    console.log(`📥 Incoming Stripe event: ${event.type}`);

    const result = await handleStripeEvent(event);

    console.log(`✅ Stripe event handled: ${event.type}`);

    return NextResponse.json(result);
  } catch (err) {
    console.error("❌ Error in handleStripeEvent:", err.message);
    return new NextResponse(`Internal Server Error: ${err.message}`, { status: 500 });
  }
}