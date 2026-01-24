import { supabase } from "@/lib/supabaseClient";
import { logMembershipEvent } from "@/lib/helpers/logMembershipEvent";
import { logGuestPassEvent } from "@/lib/helpers/logGuestPassEvent";
import { logPayment } from "@/lib/helpers/logPayment";
import { insertRenewalLog } from "@/lib/helpers/insertRenewalLog";
import { sendFailedPaymentEmail } from "@/lib/email/sendFailedPaymentEmail";
import { computeMembershipExpiry } from "@/lib/time/expiry";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ✅ Convert Date to Local Time (Central Time, Texas)
function toLocalISOString(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString();
}

function asISO(d) {
  return d ? toLocalISOString(d instanceof Date ? d : new Date(d)) : null;
}

function debugTag(mode, source) {
  const parts = [];
  if (mode) parts.push(`mode=${mode}`);
  if (source) parts.push(`price_source=${source}`);
  return parts.length ? ` [${parts.join("; ")}]` : "";
}

function extractMetaFromEvent(event) {
  const obj = event?.data?.object || {};
  // Try to gather metadata from the object and known nested places
  const base = { ...(obj.metadata || {}) };

  // Some event payloads include ids we can fetch with Stripe if needed
  // but we prefer what’s already present on the object to keep it fast.
  if (obj.payment_intent && obj.payment_intent.metadata) {
    Object.assign(base, obj.payment_intent.metadata);
  }
  if (obj.subscription && obj.subscription.metadata) {
    Object.assign(base, obj.subscription.metadata);
  }
  if (obj.invoice && obj.invoice.metadata) {
    Object.assign(base, obj.invoice.metadata);
  }

  // Special cases by event type:
  switch (event.type) {
    case "checkout.session.completed": {
      // Checkout Session is the object; some fields we care about:
      // - session.metadata (always)
      // - we can also backfill by fetching PI/sub later if missing
      break;
    }
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      // The object is an invoice. It already has invoice.metadata.
      // If needed, callers can still fetch the subscription later (you already do).
      break;
    }
    default:
      break;
  }

  return base;
}

export async function handleStripeEvent(event) {
  const receivedAt = asISO(new Date());

  // Persist and dedupe
  try {
    const { error } = await supabase
      .from("stripe_events")
      .insert({
        event_id: event.id,
        type: event.type,
        payload: event,
        received_at: receivedAt,
      });
    if (error) throw error;
  } catch (e) {
      if ((e?.message || "").includes("duplicate key") || e?.code === "23505") {
        console.log("🛑 Duplicate Stripe event (already handled):", event.id, event.type);
        return { status: 200, message: "Duplicate event" };
      }
      console.error("❌ Failed to persist stripe_event:", e);
      return { status: 500, message: "stripe_events insert failed" };
  }

  console.log(`📥 Incoming Stripe event: ${event.type}`);

  // One metadata view to rule them all
  const extractedMeta = extractMetaFromEvent(event);
  const extractedUserId = extractedMeta.user_id || null;
  const extractedPlanDurationId = extractedMeta.plan_duration_id || null;
  const extractedPriceSource = extractedMeta.price_source || null;   // e.g. "override", "tier:legacy", "env:STRIPE_..."
  const extractedStripeMode = extractedMeta.stripe_mode || null;     // "payment" | "subscription"
  const extractedLocationId = extractedMeta.location_id || null;
  const dbg = debugTag(extractedStripeMode, extractedPriceSource);

  // Production safety: ignore Stripe test events in prod.
  if (process.env.NODE_ENV === "production" && !event.livemode) {
    console.warn("⚠️ Skipping test webhook event in live handler.")
    return { status: 200, message: "Ignored test event in production" };
  }

  // Extract common bits (safe)
  const session = event?.data?.object ?? {};
  const userId = session?.metadata?.user_id;
  const fallbackUserId = userId || extractedUserId || null;
  let paymentIntentId = session?.payment_intent;

  if (!paymentIntentId && session?.mode === 'subscription' && session?.invoice) {
    try {
      const invoice = await stripe.invoices.retrieve(session.invoice);
      paymentIntentId = invoice?.payment_intent ?? null;
    } catch (err) {
      console.warn("⚠️ Could not fetch invoice for payment_intent fallback:", err);
    }
  }
    
  // Timing helper + wrap the whole event tree
  const t0 = Date.now();
  const ok = (message = "OK") => {
    console.log(`✅ Event ${event.id} (${event.type}) done in ${Date.now() - t0}ms - ${message}`);
    return { status: 200, message };
  };
  const fail = (err, message = "Internal server error") => {
    console.error (`❌ Event ${event.id} (${event.type}) failed in ${Date.now() - t0}ms`, err);
    return { status: 500, message };
  };

  try {
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
      let { user_id, plan_duration_id } = invoice.metadata || {};
      let paid_in_full = null;
      let auto_renewal_enabled = null;
      let renew_at_discounted_rate = null;

      // Fallback to extracted meta first (cheap) before fetching sub:
      if (!user_id) user_id = extractedUserId;
      if (!plan_duration_id) plan_duration_id = extractedPlanDurationId;

      if (!user_id || !plan_duration_id) {
        const subscriptionId = invoice.subscription;
        console.warn("⚠️ Invoice metadata missing. Attempting to fetch subscription:", subscriptionId);
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          paid_in_full = subscription.metadata?.paid_in_full === "true";
          auto_renewal_enabled = subscription.metadata?.auto_renewal_enabled === "true";
          renew_at_discounted_rate = subscription.metadata?.renew_at_discounted_rate === "true";
        
          if (!user_id) user_id = subscription.metadata?.user_id;
          if (!plan_duration_id) plan_duration_id = subscription.metadata?.plan_duration_id;
        } catch (err) {
          console.error("❌ Failed to fetch subscription metadata:", err.message);
          return { status: 500 };
        }
      }
    
      if (!user_id || !plan_duration_id) {
        console.error("❌ Still missing metadata after fallback.");
        return { status: 400 };
      }
    
      const stripe_payment_intent = invoice.payment_intent;
      const stripe_subscription_id = invoice.subscription;
      const amount = (invoice.amount_paid ?? 0) / 100;
      const payment_date = asISO(invoice.created ? new Date(invoice.created * 1000) : new Date());
    
      console.log("📥 Handling recurring invoice payment:", {
        user_id,
        plan_duration_id,
        stripe_payment_intent,
        stripe_subscription_id,
      });

      // ----- behavior / desired start (mirrors checkout.session.completed) -----
      const md = invoice.metadata || {};
      let behavior = md.checkout_behavior || "bill_today_start_today"; 
      let mdStartDate = md.start_date ? new Date(`${md.start_date}T00:00:00`) : null;

      // If we didn’t have metadata on the invoice, we may have loaded the subscription above.
      if ((!behavior || !mdStartDate) && stripe_subscription_id) {
        try {
          const sub = await stripe.subscriptions.retrieve(stripe_subscription_id);
          if (!behavior) behavior = sub?.metadata?.checkout_behavior || behavior;
          if (!mdStartDate && sub?.metadata?.start_date) {
            mdStartDate = new Date(`${sub.metadata.start_date}T00:00:00`);
          }
        } catch (e) {
          // non-fatal
        }
      }

      // If no explicit start was set, anchor to invoice create time
      const createdAt = invoice.created ? new Date(invoice.created * 1000) : new Date();
      const desiredStart = mdStartDate && mdStartDate > createdAt ? mdStartDate : mdStartDate || createdAt;
    
      // 🔁 Update existing payment with missing payment intent
      const { error: updateError } = await supabase
        .from("payments")
        .update({ stripe_payment_intent })
        .eq("user_id", user_id)
        .eq("stripe_subscription_id", stripe_subscription_id)
        .is("stripe_payment_intent", null);
    
      if (updateError) {
        console.error("❌ Failed to update payment with payment intent:", updateError.message);
      } else {
        console.log(`✅ Updated payment intent: ${stripe_payment_intent}`);
      }
      const { data: membershipRow } = await supabase
        .from("memberships")
        .select("id, status, start_date, location_id")
        .eq("user_id", user_id)
        .eq("plan_duration_id", plan_duration_id)
        .order("start_date", { ascending: false })
        .limit(1)
        .single();

      const membership_id = membershipRow?.id || null;
      const locationId = membershipRow?.location_id || extractedLocationId || null;
    
      // 🧾 Log recurring payment
      const paymentId = await logPayment({
        user_id,
        amount,
        method: "stripe",
        status: "succeeded",
        payment_date,
        stripe_payment_intent,
        stripe_session_id: null,
        stripe_subscription_id,
        membership_id,
        guest_pass_id: null,
        notes: `Invoice paid${dbg}`,
        locationId,
      });
      // 🧾 renewals_log: idempotent upsert keyed by (invoice, attempt)
      const attemptNumber = invoice.attempt_count ?? 1;

      await insertRenewalLog({
        user_id,
        membership_id,
        stripe_subscription_id,
        stripe_invoice_id: invoice.id || null,
        stripe_payment_intent,
        attempt_result: "succeeded",
        amount,
        attempt_number: attemptNumber,
        payment_date,
        notes: `Auto-renewal succeeded${dbg}`,
      });
      // (No dedupe read required — helper upserts)
    
      // ----- Activate a delayed-start membership on first paid invoice -----
      // If the admin chose "bill_at_start_date" or "bill_today_start_later", the
      // membership might have been created as status='scheduled' at checkout.
      // This invoice means the first charge was just paid, so flip it to active and set dates.
      if (membershipRow?.id && membershipRow?.status === "scheduled") {
        // We need duration info to compute end/expiry/next payment
        const { data: pd } = await supabase
          .from("plan_durations")
          .select("plan_name, duration_label, duration_in_months, duration_in_days")
          .eq("id", plan_duration_id)
          .single();
      
        const durationLabel = pd?.duration_label || "Unknown";
        const months = pd?.duration_in_months || null;
        const days = pd?.duration_in_days || null;
      
        // Compute contract_end_date / expires_at / next_payment_date
        let contractEndDate = null;
        let expiresAt = null;
        let nextPaymentDate = null;
      
        if (months && months > 0) {
          // Month-based: end = start + N months; expires = end + 3-day grace
          const end = new Date(desiredStart);
          end.setMonth(end.getMonth() + months);
          contractEndDate = end;
        
          // use your shared util for expiry (end-of-day, local rules)
          expiresAt = computeMembershipExpiry({ startDate: desiredStart, durationLabel });
        
          if (!paid_in_full) {
            // recurring: next bill one month from start
            const np = new Date(desiredStart);
            np.setMonth(np.getMonth() + 1);
            nextPaymentDate = np;
          } else if (auto_renewal_enabled) {
            // paid-in-full + auto-renew: bill one month after contract end
            const np = new Date(end);
            np.setMonth(np.getMonth() + 1);
            nextPaymentDate = np;
          } else {
            nextPaymentDate = null;
          }
        } else if (days && days > 0) {
          // Day-based: expires at start + days (end-of-day)
          const last = new Date(desiredStart);
          last.setDate(last.getDate() + days - 1);
          // mimic endOfDayLocal by just setting end-of-day in UTC-localized flow
          last.setHours(23, 59, 59, 999);
          expiresAt = last;
        }
      
        const updates = {
          status: "active",
          start_date: asISO(desiredStart),
          contract_end_date: asISO(contractEndDate),
          next_payment_date: asISO(nextPaymentDate),
          expires_at: asISO(expiresAt),
          stripe_payment_intent,                 // tie the first invoice’s PI if helpful
          stripe_subscription_id,               // already present for subs
          payment_id: paymentId || null,        // connect first payment if not set
          renewal_pending: false,               // clear if it was set
        };
      
        const { error: actErr } = await supabase
          .from("memberships")
          .update(updates)
          .eq("id", membershipRow.id);
      
        if (actErr) {
          console.error("❌ Failed to activate scheduled membership:", actErr.message);
        } else {
          console.log("✅ Activated scheduled membership on first paid invoice");
        
          // Log an event for activation
          await logMembershipEvent({
            userId: user_id,
            eventType: "activated",
            plan: pd?.plan_name || "Unknown",
            durationLabel,
            contractEndDate: asISO(contractEndDate),
            nextPaymentDate: asISO(nextPaymentDate),
            expiresAt: asISO(expiresAt),
            expiredOn: null,
            notes: `Activated on first paid invoice${dbg}`,
            contract_signature_id: null,
            paid_in_full,
            stripe_subscription_id,
            stripe_payment_intent,
            payment_id: paymentId,
            pass_source: "stripe",
            description: "Initial charge succeeded; membership activated",
            auto_renewal_enabled,
            renew_at_discounted_rate,
            renewal_pending: false,
            renewal_attempt_count: invoice.attempt_count ?? 1,
            last_renewal_attempt: payment_date,
            locationId,
          });
        }
      }

      // 🧼 Clear renewal_pending flag
      const { error: resetError } = await supabase
        .from("memberships")
        .update({ renewal_pending: false })
        .eq("user_id", user_id)
        .eq("plan_duration_id", plan_duration_id)
        .eq("stripe_subscription_id", stripe_subscription_id);
    
      if (resetError) {
        console.warn("⚠️ Failed to clear renewal_pending flag:", resetError.message);
      } else {
        console.log("✅ Cleared renewal_pending flag.");
      }
      const { data: durationRow } = await supabase
        .from("plan_durations")
        .select("plan_name, duration_label")
        .eq("id", plan_duration_id)
        .single();
      const plan = durationRow?.plan_name || "Unknown";
      const durationLabel = durationRow?.duration_label || "Unknown";
    
      // 🪵 Log membership event
      if (membershipRow?.status !== "scheduled") {
        await logMembershipEvent({
          userId: user_id,
          eventType: "renewed",
          plan,
          durationLabel,
          contractEndDate: null,
          nextPaymentDate: null,
          expiresAt: null,
          expiredOn: null,
          notes: `Recurring payment via Stripe invoice${dbg}`,
          contract_signature_id: null,
          paid_in_full,
          stripe_subscription_id,
          stripe_payment_intent,
          payment_id: paymentId,
          pass_source: "stripe",
          description: "Auto-renewal payment received",
          auto_renewal_enabled,
          renew_at_discounted_rate,
          renewal_pending: false,
          renewal_attempt_count: invoice.attempt_count ?? 1,
          last_renewal_attempt: payment_date,
          locationId,
        });
      }
    
      console.log("✅ Stripe event handled: invoice.payment_succeeded");
      return ok("Handled invoice.payment_succeeded");
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      let userId = invoice.metadata?.user_id || extractedUserId || null;
      let planDurationId = invoice.metadata?.plan_duration_id || extractedPlanDurationId || null;
      const subscriptionId = invoice.subscription;

      console.warn("❌ Payment failed for subscription:", subscriptionId);

      // Fallback: fetch subscription metadata if needed
      let paid_in_full = null;
      let auto_renewal_enabled = null;
      let renew_at_discounted_rate = null;

      if (!userId || !planDurationId || invoice.metadata == null) {
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          if (!userId) userId = subscription.metadata?.user_id || userId;
          if (!planDurationId) planDurationId = subscription.metadata?.plan_duration_id || planDurationId;
          paid_in_full = subscription.metadata?.paid_in_full === "true";
          auto_renewal_enabled = subscription.metadata?.auto_renewal_enabled === "true";
          renew_at_discounted_rate = subscription.metadata?.renew_at_discounted_rate === "true";
        } catch (err) {
          console.error("❌ Failed to fetch subscription metadata:", err);
          return { status: 500, message: "Failed to fetch subscription metadata" };
        }
      }
    
      if (!userId) {
        console.warn("⚠️ invoice.payment_failed: Missing user_id — skipping membership update.");
        console.log("✅ Stripe event handled: invoice.payment_failed");
        return { status: 200, message: "No user_id" };
      }
    
      // (Optional) plan/duration strings for logging
      let plan = "N/A";
      let durationLabel = "N/A";
      if (planDurationId) {
        const { data: durationRow } = await supabase
          .from("plan_durations")
          .select("plan_name, duration_label")
          .eq("id", planDurationId)
          .single();
        if (durationRow) {
          plan = durationRow.plan_name || plan;
          durationLabel = durationRow.duration_label || durationLabel;
        }
      }
    
      const now = new Date();
      const nowLocal = asISO(now);
      const attemptNumber = invoice.attempt_count ?? 1;
    
      // ----- behavior / desired start -----
      const md = invoice.metadata || {};
      let behavior = md.checkout_behavior || "bill_today_start_today";
      let mdStartDate = md.start_date ? new Date(`${md.start_date}T00:00:00`) : null;
    
      // Fallback to subscription metadata if needed
      if ((!behavior || !mdStartDate) && subscriptionId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          if (!behavior) behavior = sub?.metadata?.checkout_behavior || behavior;
          if (!mdStartDate && sub?.metadata?.start_date) {
            mdStartDate = new Date(`${sub.metadata.start_date}T00:00:00`);
          }
        } catch (e) {
          console.warn("invoice.payment_failed: could not fetch sub metadata", subscriptionId, e?.message);
        }
      } // <-- ✅ THIS was the missing brace
    
      // If no explicit start, anchor to invoice creation time
      const createdAt = invoice.created ? new Date(invoice.created * 1000) : new Date();
      const desiredStart = mdStartDate && mdStartDate > createdAt ? mdStartDate : (mdStartDate || createdAt);
    
      // 🔍 Fetch latest membership row BEFORE using it
      const { data: membershipRow } = await supabase
        .from("memberships")
        .select("id, status, start_date, location_id")
        .eq("user_id", userId)
        .eq("stripe_subscription_id", subscriptionId)
        .order("start_date", { ascending: false })
        .limit(1)
        .single();

      const membershipId = membershipRow?.id || null;
      const locationId = membershipRow?.location_id || extractedLocationId || null;
    
      // If the membership hasn't gone live yet (scheduled start) and first charge failed:
      // keep it scheduled; record failed activation attempt; DO NOT mark past_due yet.
      if (membershipRow?.status === "scheduled") {
        const { error: schedErr } = await supabase
          .from("memberships")
          .update({
            // keep status as 'scheduled'
            renewal_pending: true,                  // still trying to activate
            last_renewal_attempt: nowLocal,
            renewal_attempt_count: invoice.attempt_count ?? null,
          })
          .eq("id", membershipId);
        
        if (schedErr) {
          console.error("❌ Failed to update scheduled membership after failed activation charge:", schedErr.message);
        } else {
          console.log("⚠️ Activation charge failed; membership remains 'scheduled'.");
        }
      } else {
        // Normal renewals for already-active members → mark as past_due
        const { error: updateError } = await supabase
          .from("memberships")
          .update({
            status: "past_due",
            renewal_pending: false,
            last_renewal_attempt: nowLocal,
            renewal_attempt_count: invoice.attempt_count ?? null,
          })
          .eq("user_id", userId)
          .eq("stripe_subscription_id", subscriptionId);
        
        if (updateError) {
          console.error("❌ Failed to mark membership as past_due:", updateError.message);
        } else {
          console.log(`⚠️ Membership marked as past_due for user ${userId}`);
        }
      }
    
      // Email + name (don’t shadow variables; fetch once)
      const { data: userRow } = await supabase
        .from("users")
        .select("full_name, email")
        .eq("id", userId)
        .single();
      const fullName = userRow?.full_name || "Member";
      const email = invoice.customer_email || userRow?.email || null;
    
      // 📧 Personalized failed-payment email
      try {
        if (email) {
          await sendFailedPaymentEmail({ to: email, fullName });
          console.log(`📧 Sent failed payment email to: ${email}`);
        } else {
          console.warn("⚠️ No email on invoice to send failed payment alert.");
        }
      } catch (err) {
        console.error("❌ Failed during failed-payment email step:", err);
      }
    
      // 💳 Log failed payment
      await logPayment({
        user_id: userId,
        amount: 0,
        method: "stripe",
        status: "failed",
        payment_date: nowLocal,
        stripe_payment_intent: invoice.payment_intent || null,
        stripe_session_id: null,
        stripe_subscription_id: subscriptionId,
        membership_id: membershipId,
        guest_pass_id: null,
        notes: `Invoice payment failed${dbg}`,
        locationId,
      });
    
      // 🧾 renewals_log: idempotent upsert keyed by (invoice, attempt)
      await insertRenewalLog({
        user_id: userId,
        membership_id: membershipId,
        stripe_subscription_id: subscriptionId,
        stripe_invoice_id: invoice.id || null,
        stripe_payment_intent: invoice.payment_intent || null,
        attempt_result: "failed",
        amount: (invoice.amount_due ?? 0) / 100,
        attempt_number: attemptNumber,
        payment_date: nowLocal,
        notes: (invoice.last_payment_error?.message || "Invoice payment failed") + dbg,
      });
      // (No dedupe read required — helper upserts)
    
      const activationFailure = membershipRow?.status === "scheduled";
      const eventType = activationFailure ? "activation_payment_failed" : "payment_failed";
    
      await logMembershipEvent({
        userId,
        eventType,
        plan,
        durationLabel,
        contractEndDate: null,
        nextPaymentDate: null,
        expiresAt: null,
        expiredOn: null,
        notes: activationFailure
          ? `Failed to collect first charge before start (${behavior}); will retry${dbg}`
          : `Stripe failed to collect recurring subscription payment${dbg}`,
        contract_signature_id: null,
        paid_in_full: Boolean(paid_in_full),
        stripe_subscription_id: subscriptionId,
        stripe_payment_intent: invoice.payment_intent || null,
        payment_id: null,
        pass_source: "stripe",
        description: activationFailure ? "Activation charge failed" : "Recurring payment failure",
        auto_renewal_enabled: auto_renewal_enabled ?? null,
        renew_at_discounted_rate: renew_at_discounted_rate ?? null,
        renewal_pending: activationFailure ? true : false,
        renewal_attempt_count: attemptNumber,
        last_renewal_attempt: nowLocal,
        locationId,
      });
    
      console.log("✅ Stripe event handled: invoice.payment_failed");
      return ok("Handled invoice.payment_failed");
    }

    if (event.type === "charge.succeeded") {
      const charge = event.data.object;
      const paymentIntentId = charge.payment_intent;
      const subscriptionId = charge.subscription;
      const userId = charge.metadata?.user_id || null;
      if (!paymentIntentId || !subscriptionId) {
        console.warn("⚠️ charge.succeeded missing paymentIntent or subscriptionId");
        return { status: 200, message: "No update performed" };
      }
    
      console.log("🔍 charge.succeeded → PaymentIntent:", paymentIntentId);
    
      const { data: existingPayment, error: fetchError } = await supabase
        .from("payments")
        .select("id, stripe_payment_intent, membership_id")
        .eq("stripe_subscription_id", subscriptionId)
        .order("payment_date", { ascending: false })
        .limit(1)
        .single();
    
      if (fetchError || !existingPayment) {
        console.warn("⚠️ No existing payment found to patch via charge.succeeded");
        return { status: 200, message: "No patch needed" };
      }
    
      // Patch missing stripe_payment_intent if needed
      if (!existingPayment.stripe_payment_intent) {
        const { error: patchError } = await supabase
          .from("payments")
          .update({ stripe_payment_intent: paymentIntentId })
          .eq("id", existingPayment.id);
      
        if (patchError) {
          console.error("❌ Failed to patch payment intent via charge.succeeded:", patchError.message);
        } else {
          console.log(`✅ Patched missing stripe_payment_intent for payment ID: ${existingPayment.id}`);
        }
      } else {
        console.log("🟡 Payment already had intent — no patch needed.");
      }
    
      // 🔁 Optionally backfill membership_id
      if (!existingPayment.membership_id && userId) {
        const { data: membership, error: membershipError } = await supabase
          .from("memberships")
          .select("id")
          .eq("stripe_subscription_id", subscriptionId)
          .eq("user_id", userId)
          .order("start_date", { ascending: false })
          .limit(1)
          .single();
      
        if (membership) {
          const { error: backfillError } = await supabase
            .from("payments")
            .update({ membership_id: membership.id })
            .eq("id", existingPayment.id);
        
          if (backfillError) {
            console.error("❌ Failed to backfill membership_id via charge.succeeded:", backfillError.message);
          } else {
            console.log(`✅ Backfilled membership_id (${membership.id}) for payment ID: ${existingPayment.id}`);
          }
        } else if (membershipError) {
          console.warn("⚠️ Membership backfill error:", membershipError.message);
        } else {
          console.warn("⚠️ No matching membership found to backfill.");
        }
      }
    
      console.log("✅ Stripe event handled: charge.succeeded");
      return ok("Handled charge.succeeded");
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const userId = subscription.metadata?.user_id;
      if (!userId) {
        console.warn("⚠️ Subscription deleted but user_id is missing in metadata.");
        console.log("✅ Stripe event handled: customer.subscription.deleted");
        return { status: 200 };
      }
    
      // 👀 Gather context from the Stripe payload
      const reason = subscription.cancellation_details?.reason || "unknown";
      const nowLocal = asISO(new Date());
      // 🔎 (Optional) fetch membership id for better logging
      const { data: membershipRow } = await supabase
        .from("memberships")
        .select("id, status, location_id")
        .eq("user_id", userId)
        .eq("stripe_subscription_id", subscription.id)
        .order("start_date", { ascending: false })
        .limit(1)
        .single();

      const membershipId = membershipRow?.id || null;
      const locationId = membershipRow?.location_id || extractedLocationId || null;

      // 🛑 Mark membership cancelled and clear renewal-related fields
      const { error: cancelErr } = await supabase
        .from("memberships")
        .update({
          status: "cancelled",
          expired_on: nowLocal,
          expires_at: nowLocal,
          next_payment_date: null,
          renewal_pending: false,
          last_renewal_attempt: nowLocal,
        })
        .eq("user_id", userId)
        .eq("stripe_subscription_id", subscription.id);
      if (cancelErr) {
        console.error("❌ Failed to mark membership cancelled:", cancelErr.message);
      } else {
        console.log("🗑️ Subscription deleted. Membership marked cancelled.")
      }
      // 🪵 Log membership event (helps your audit trail)
      await logMembershipEvent({
        userId,
        eventType: "cancelled",
        plan: null,
        durationLabel: null,
        contractEndDate: null,
        nextPaymentDate: null,
        expiresAt: nowLocal,
        expiredOn: nowLocal,
        notes: `Subscription ended via Stripe. Reason: ${reason}${dbg}`,
        contract_signature_id: null,
        paid_in_full: null,
        stripe_subscription_id: subscription.id,
        stripe_payment_intent: null,
        payment_id: null,
        pass_source: "stripe",
        description: "Subscription deleted (Stripe webhook)",
        auto_renewal_enabled: null,
        renew_at_discounted_rate: null,
        renewal_pending: false,
        renewal_attempt_count: null,
        last_renewal_attempt: nowLocal,
        membership_id: membershipId ?? undefined,
        locationId,
      })
    
      console.log("✅ Stripe event handled: customer.subscription.deleted");
      return ok("Handled customer.subscription.deleted");
    }

    if (event.type === "checkout.session.completed") {
      console.log("✅ Handling checkout.session.completed");
      const planDurationId = session.metadata?.plan_duration_id || extractedPlanDurationId;
      const userId = session.metadata?.user_id || extractedUserId;
          
      const locationId =
        session.metadata?.location_id ||
        extractedLocationId ||
        null;

      if (!userId || !planDurationId) {
        console.error("❌ Missing user_id or plan_duration_id in metadata");
        return { status: 400, message: "Missing metadata" };
      }
      const now = new Date();
      const nowLocal = asISO(now); // ✅ Reusable timestamp
      // ----- Admin-delayed start controls -----
      const md = session.metadata || {};
      const behavior = md.checkout_behavior || "bill_today_start_today"; // 'bill_today_start_today' | 'bill_today_start_later' | 'bill_at_start_date'
      const mdStartDate = md.start_date ? new Date(`${md.start_date}T00:00:00`) : null;

      // Anchor all date math to the desired start when present & in future
      const desiredStart = mdStartDate && mdStartDate > now ? mdStartDate : now;

      // Only log a payment now if Stripe actually charged now.
      // For 'bill_at_start_date' we expect the charge at the start date (invoice.payment_succeeded).
      let paymentId = null;
      const hasBeenChargedNow = session.payment_status === "paid" || !!session.amount_total;
      const shouldLogPaymentNow = hasBeenChargedNow && behavior !== "bill_at_start_date";

      if (shouldLogPaymentNow) {
        paymentId = await logPayment({
          user_id: userId,
          amount: session.amount_total ? session.amount_total / 100 : 0,
          method: "stripe",
          status: "succeeded",
          payment_date: nowLocal,
          stripe_session_id: session.id,
          stripe_payment_intent: paymentIntentId || null,
          notes: `Checkout session paid${dbg}`,
          locationId,
        });
      }

      const { data: durationData, error: durationError } = await supabase
        .from("plan_durations")
        .select("duration_in_days, duration_in_months, plan_name, duration_label, is_promotional")
        .eq("id", planDurationId)
        .single();
        if (durationError || !durationData) {
        console.error("❌ Invalid plan_duration_id:", durationError?.message);
        return { status: 400, message: "Invalid plan_duration_id" };
      }
      const isGuestPass = durationData.plan_name === "Guest-Pass";
      const isPaidInFull = session.metadata.paid_in_full === "true";
      const autoRenewalEnabled = session.metadata.auto_renewal_enabled === "true";
      const renewAtDiscountedRate = session.metadata.renew_at_discounted_rate === "true";
      const isRenewal = session.metadata?.isRenewal === "true";
        // 🟡 Handle Paid-in-Full Auto-Renewal
      if (isRenewal && isPaidInFull) {
        const { data: existingMembership, error: existingError } = await supabase
          .from("memberships")
          .select("contract_end_date")
          .eq("user_id", userId)
          .eq("plan_duration_id", planDurationId)
          .eq("status", "active")
          .single();
      
        if (existingError || !existingMembership?.contract_end_date) {
          console.error("❌ Could not fetch existing membership for renewal");
          return { status: 500, message: "Failed to fetch active membership" };
        }
      
        const previousContractEnd = new Date(existingMembership.contract_end_date);
        const newContractEndDate = new Date(previousContractEnd);
        newContractEndDate.setMonth(newContractEndDate.getMonth() + durationData.duration_in_months);
      
        const newExpiresAt = new Date(newContractEndDate);
        newExpiresAt.setDate(newExpiresAt.getDate() + 3); // grace period
      
        const newNextPaymentDate = new Date(newContractEndDate);
        newNextPaymentDate.setMonth(newNextPaymentDate.getMonth() + 1); // charged month after
      
        const updateResult = await supabase
          .from("memberships")
          .update({
            contract_end_date: asISO(newContractEndDate),
            expires_at: asISO(newExpiresAt),
            next_payment_date: asISO(newNextPaymentDate),
            renewal_attempt_count: 0,
            last_renewal_attempt: nowLocal,
            renewal_pending: false,
            stripe_session_id: session.id,
            stripe_payment_intent: paymentIntentId || null,
            payment_id: paymentId,
          })
          .eq("user_id", userId)
          .eq("plan_duration_id", planDurationId)
          .eq("status", "active");
        
        if (updateResult.error) {
          console.error("❌ Failed to update paid-in-full renewal:", updateResult.error.message);
          return { status: 500, message: "Failed to update paid-in-full renewal" };
        }
      
        // ✅ Log event and return early
        await logMembershipEvent({
          userId,
          eventType: "renewed",
          plan: durationData.plan_name,
          durationLabel: durationData.duration_label,
          contractEndDate: asISO(newContractEndDate),
          nextPaymentDate: asISO(newNextPaymentDate),
          expiresAt: asISO(newExpiresAt),
          expiredOn: null,
          notes: `Auto-renewed paid-in-full membership${dbg}`,
          paid_in_full: true,
          stripe_payment_intent: paymentIntentId || null,
          payment_id: paymentId,
          pass_source: "stripe",
          auto_renewal_enabled: autoRenewalEnabled,
          renew_at_discounted_rate: renewAtDiscountedRate,
          renewal_pending: false,
          renewal_attempt_count: 0,
          last_renewal_attempt: nowLocal,
          locationId,
        });
      
        console.log("✅ Stripe event handled:", event.type);
        return { status: 200, message: "Paid-in-full membership renewed." };
      }
      // ✅ Guest Pass Logic (Separate)
      if (isGuestPass) {
        const expiresAt = new Date(now);
        expiresAt.setDate(expiresAt.getDate() + durationData.duration_in_days);
        expiresAt.setHours(23, 59, 59, 999);

        const { data: existingPass } = await supabase
          .from("guest_passes")
          .select("id")
          .eq("user_id", userId)
          .gte("expires_at", asISO(new Date())) // only count unexpired passes
          .maybeSingle();

        let guestPassId;
        if (existingPass) {
          const { data } = await supabase
            .from("guest_passes")
            .update({
              start_date: asISO(now),
              expires_at: asISO(expiresAt),
              pass_source: "stripe",
              stripe_session_id: session.id,
              stripe_payment_intent: paymentIntentId || null,
              location_id: locationId,
            })
            .eq("id", existingPass.id)
            .select("id")
            .single();
          guestPassId = data?.id;
        } else {
          const { data } = await supabase
            .from("guest_passes")
            .insert({
              user_id: userId,
              start_date: asISO(now),
              expires_at: asISO(expiresAt),
              pass_source: "stripe",
              stripe_session_id: session.id,
              stripe_payment_intent: paymentIntentId || null,
              location_id: locationId,
            })
            .select("id")
            .single();
          guestPassId = data?.id;
        }
        const guestPassPaymentId = await logPayment({
          user_id: userId,
          amount: session.amount_total ? session.amount_total / 100 : 0,
          method: "stripe",
          status: "succeeded",
          payment_date: nowLocal,
          stripe_session_id: session.id,
          stripe_payment_intent: paymentIntentId || null,
          guest_pass_id: guestPassId,
          notes: `Guest pass checkout paid${dbg}`,
          locationId,
        });

        await supabase
          .from("guest_passes")
          .update({ payment_id: guestPassPaymentId })
          .eq("id", guestPassId);

        await supabase
          .from("payments")
          .update({ guest_pass_id: guestPassId })
          .eq("id", guestPassPaymentId);

        await logGuestPassEvent({
          userId,
          guest_pass_id: guestPassId,
          eventType: existingPass ? "updated" : "created",
          expiresAt: asISO(expiresAt),
          notes: `User purchased ${durationData.duration_label} Guest Pass via Stripe${dbg}`,
          description: `Stripe Guest Pass: ${durationData.duration_label}`,
          pass_source: "stripe",
          payment_id: guestPassPaymentId,
          locationId,
        });
          console.log("✅ Stripe event handled:", event.type);
        return { status: 200, message: "Guest pass created and logged." };
      }
      // ✅ Membership Logic (With Auto-Renewal and Discounted Renewal)
      // Use desiredStart (either start_date from metadata if future, else now)
      let expiresAt = new Date(desiredStart);
      let contractEndDate = null;
      let nextPaymentDate = null;

      if (durationData.duration_in_months) {
        // Month-based memberships
        contractEndDate = new Date(desiredStart);
        contractEndDate.setMonth(contractEndDate.getMonth() + durationData.duration_in_months);
      
        if (!isPaidInFull) {
          // Recurring monthly → next payment one month after desired start
          nextPaymentDate = new Date(desiredStart);
          nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
        } else if (autoRenewalEnabled) {
          // Paid in full + auto-renew → charge the month AFTER contract end
          nextPaymentDate = new Date(contractEndDate);
          nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
        } else {
          nextPaymentDate = null;
        }
      } else if (durationData.duration_in_days) {
        // Day-based (guest pass or day bundles)
        expiresAt = new Date(desiredStart);
        expiresAt.setDate(expiresAt.getDate() + durationData.duration_in_days);
      }

      // ⏳ Add 3-day grace after contract end (only month-based)
      if (contractEndDate) {
        expiresAt = new Date(contractEndDate);
        expiresAt.setDate(expiresAt.getDate() + 3);
      }

      let contractSignatureId = null;
      // Insert contract signature only if this plan requires one
      const planRequiresContract = !!durationData.duration_in_months;
      console.log("📄 Contract Metadata:", {
        requiresContract: planRequiresContract,
        signature: session.metadata?.signature,
        agreed: session.metadata?.agreed,
      });
      if (planRequiresContract && session.metadata?.signature && session.metadata?.agreed === "true") {
        const { data: existingSignature } = await supabase
          .from("contract_signatures")
          .select("id")
          .eq("user_id", userId)
          .eq("plan_duration_id", planDurationId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!existingSignature) {
          const { data: insertedSig, error: sigError } = await supabase
            .from("contract_signatures")
            .insert({
              user_id: userId,
              plan_duration_id: planDurationId,
              contract_id: session.metadata?.contract_id || null,
              version: session.metadata?.contract_version || null,
              ip_address: session.metadata?.ip_address || null,
              location_id: session.metadata?.location_id || null,
              gps_accuracy: session.metadata?.gps_accuracy || null,
              signature: session.metadata.signature,
              agreed: true,
              created_at: asISO(new Date()),
            })
            .select("id")
            .single();
          
          if (sigError) {
            console.error("❌ Failed to insert contract signature:", sigError.message);
          } else {
            contractSignatureId = insertedSig.id;
          }
        } else {
          contractSignatureId = existingSignature.id;
          console.log("🟡 Skipping duplicate contract signature insert.");
        }
      }
      if (session.subscription) {
        try {
          await stripe.subscriptions.update(session.subscription, {
            cancel_at_period_end: !autoRenewalEnabled,
            metadata: {
              user_id: userId,
              plan_duration_id: planDurationId,
              paid_in_full: isPaidInFull ? "true" : "false",
              auto_renewal_enabled: autoRenewalEnabled ? "true" : "false",
              renew_at_discounted_rate: renewAtDiscountedRate ? "true" : "false",
            },
          });
          console.log("🔄 Stripe subscription updated: auto-renewal + metadata");
        } catch (stripeErr) {
          console.error("❌ Failed to update Stripe subscription:", stripeErr.message);
        }
      }
      // Decide membership status:
      // - bill_today_start_today → active now
      // - bill_today_start_later → already charged, but starts later → scheduled
      // - bill_at_start_date     → not charged yet, starts later → scheduled; will activate on invoice.payment_succeeded
      let statusForMembership = "active";

      if (behavior === "bill_today_start_later" && mdStartDate && mdStartDate > now) {
        statusForMembership = "scheduled";
      }
      if (behavior === "bill_at_start_date") {
        statusForMembership = "scheduled";
      }

      // Build the payload once
      const membershipPayload = {
        user_id: userId,
        plan_duration_id: planDurationId,
        status: statusForMembership,              // use the computed status
        start_date: asISO(desiredStart),             // use the computed start date
        contract_end_date: asISO(contractEndDate),
        next_payment_date: asISO(nextPaymentDate),
        expires_at: asISO(expiresAt),
        expired_on: null,
        paid_in_full: isPaidInFull,
        contract_signature_id: contractSignatureId,
        stripe_session_id: session.id,
        stripe_subscription_id: session.subscription || null,
        stripe_payment_intent: paymentIntentId || null,
        payment_id: paymentId,
        pass_source: "stripe",
        auto_renewal_enabled: autoRenewalEnabled,
        renew_at_discounted_rate: renewAtDiscountedRate,
        renewal_attempt_count: 0,
        last_renewal_attempt: nowLocal,
        location_id: locationId,
      };

      // Log exactly what you’ll write
      console.log("📥 Membership UPSERT payload:", membershipPayload);

      // Write it
      const { error: upsertError } = await supabase
        .from("memberships")
        .upsert(membershipPayload, { onConflict: "user_id" });

      if (upsertError) {
        console.error("❌ Failed to upsert membership:", upsertError.message);
        return { status: 500, message: "Membership upsert failed" };
      }
      const { data: membershipData, error: membershipError } = await supabase
        .from("memberships")
        .select("id")
        .eq("user_id", userId)
        .eq("plan_duration_id", planDurationId)
        .eq("status", "active") // ✅ ensure you're grabbing the live one
        .order("start_date", { ascending: false })
        .limit(1)
        .single();
      if (membershipError) {
        console.error("❌ Failed to fetch latest membership:", membershipError.message);
      }
      if (membershipData && paymentId) {
        await supabase
          .from("payments")
          .update({ 
            membership_id: membershipData.id,
            stripe_subscription_id: session.subscription || null,
            stripe_payment_intent: paymentIntentId || null,
           })
          .eq("id", paymentId);
      }
      let notes;
      if (isPaidInFull) {
        if (autoRenewalEnabled && renewAtDiscountedRate) {
          notes = "Paid in full - auto-renew at discounted rate";
        } else if (autoRenewalEnabled) {
          notes = "Paid in full - auto-renew";
        } else {
          notes = "Paid in full - no renewal";
        }
      } else {
        notes = "Recurring subscription";
      }
      // ✅ Log Membership Event
      await logMembershipEvent({
        userId,
        eventType: "created",
        plan: durationData.plan_name,
        durationLabel: durationData.duration_label,
        contractEndDate: asISO(contractEndDate),
        nextPaymentDate: asISO(nextPaymentDate),
        expiresAt: asISO(expiresAt),
        expiredOn: null,
        notes: `${notes}${dbg}`,
        contract_signature_id: contractSignatureId,
        paid_in_full: isPaidInFull,
        stripe_subscription_id: session.subscription || null,
        stripe_payment_intent: paymentIntentId || null,
        payment_id: paymentId,
        pass_source: "stripe",
        description: `${durationData.plan_name} ${durationData.duration_label} membership via Stripe`,
        auto_renewal_enabled: autoRenewalEnabled,
        renew_at_discounted_rate: renewAtDiscountedRate,
        renewal_pending: false,
        renewal_attempt_count: 0,
        last_renewal_attempt: nowLocal,
        locationId,
      });
      console.log("✅ Stripe event handled:", event.type);
      return ok("Membership/guest pass created");
    } 
    // ---- Final fallback (only runs if no handler above returned) ----
    if (fallbackUserId) {
      await supabase
        .from("memberships")
        .update({ renewal_pending: false })
        .eq("user_id", fallbackUserId);
    }
      
    console.log(`⚠️ Unhandled Stripe event type: ${event.type}`);
    return ok("Unhandled event type");
  } catch (error) {
    // Log once and bubble an error response for the route to return 500
    console.error("❌ stripeWebhookHandler error:", error);
    return fail(error);
  }
}