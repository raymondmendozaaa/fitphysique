import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { handleStripeEvent } from '@/lib/utils/stripeWebhookHandler';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  try {
    const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    const result = await handleStripeEvent(event);

    if (result.status === 200) {
      return NextResponse.json({ received: true });
    } else {
      return NextResponse.json({ error: result.message }, { status: result.status || 500 });
    }
    
  } catch (err) {
    console.error('❌ Webhook exception:', err); // <-- log full object, not just message
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }  
}