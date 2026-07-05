// app/api/trigger-renewal/route.js
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendFailedPaymentEmail } from "@/lib/email/sendFailedPaymentEmail";
import { fetchPastDueAutoRenewMemberships } from "@/lib/db/memberships";
import { fetchUserBasicIdentityById } from "@/lib/db/users";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.INTERNAL_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1) Find members who need recovery (not charging)
  let memberships = [];

  try {
    memberships = await fetchPastDueAutoRenewMemberships(supabaseAdmin);
  } catch (error) {
    console.error("❌ Failed to fetch memberships:", error.message);
    return Response.json({ error: "Fetch failed" }, { status: 500 });
  }

  const baseUrl =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "http://localhost:3000";

  for (const m of memberships) {
    try {
      // 2) Get Stripe customer id from subscription
      const sub = await stripe.subscriptions.retrieve(m.stripe_subscription_id);
      const customerId = sub.customer;

      // 3) Create Customer Portal session so they can update payment method
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${baseUrl}/member`,
      });

      // 4) Email user the portal link (your existing email util)
      let userRow = null;

      try {
        userRow = await fetchUserBasicIdentityById(supabaseAdmin, m.user_id);
      } catch (userErr) {
        console.error("❌ Failed to fetch user for renewal email:", m.user_id, userErr);
      }

      if (!userRow?.email) {
        console.warn("⚠️ No email found for recovery flow:", m.user_id);
        continue;
      }
      
      await sendFailedPaymentEmail({
        to: userRow.email,
        fullName: userRow.full_name || "Member",
        portalUrl: portal.url,
      });

      console.log("✅ Sent recovery flow:", m.user_id, portal.url);
    } catch (e) {
      console.error("❌ Recovery loop error:", m.user_id, e?.message || e);
    }
  }

  return Response.json({ 
    message: "Recovery processed",
    processed: memberships.length,
  });
}