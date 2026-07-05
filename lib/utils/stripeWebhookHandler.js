import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { logMembershipEvent } from "@/lib/helpers/logMembershipEvent";
import { logGuestPassEvent } from "@/lib/helpers/logGuestPassEvent";
import { logPayment } from "@/lib/helpers/logPayment";
import { insertRenewalLog } from "@/lib/helpers/insertRenewalLog";
import { sendFailedPaymentEmail } from "@/lib/email/sendFailedPaymentEmail";
import { computeMembershipExpiry, computeGuestPassExpiry } from "@/lib/time/expiry";
import { fetchPlanDurationById } from "@/lib/db/planDurations";
import { upsertGuestPassForUser, attachPaymentToGuestPass } from "@/lib/db/guestPasses";
import { fetchUserBasicIdentityById } from "@/lib/db/users";
import { 
  attachGuestPassToPayment, 
  attachMembershipToPayment, 
  updatePaymentStripeIntent,
  fetchLatestPaymentBySubscription,
  patchMissingPaymentIntentBySubscription,
} from "@/lib/db/payments";
import { 
  MEMBERSHIP_GRACE_DAYS,
  fetchMembershipByUserAndSubscription, 
  fetchActiveMembershipByPlanDuration,
  fetchLatestMembershipByUserAndPlanDuration,
  updateMembershipById,
  updateMembershipByUserAndSubscription,
  updateMembershipByUserAndPlanDuration,
  upsertMembershipForUser,
} from "@/lib/db/memberships";
import {
  APP_TIMEZONE,
  getNowUtcIso,
  toUtcIso,
  toValidDate,
  getStartOfDayUtcIso,
  addDaysToUtcIso,
} from "@/lib/utils/dateTime";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function asISO(value) {
  return toUtcIso(value);
}

function nowIso() {
  return getNowUtcIso();
}

function fromStripeUnix(seconds) {
  if (!seconds) return null;
  return toValidDate(Number(seconds) * 1000);
}

function getGraceEndsAtIso(expiresAt) {
  return addDaysToUtcIso(expiresAt, MEMBERSHIP_GRACE_DAYS);
}

function appMidnight(dateString) {
  return toValidDate(getStartOfDayUtcIso(dateString, APP_TIMEZONE));
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
  // Stripe often gives subscription/payment_intent as IDs (strings), not expanded objects.
  // So don't try to read obj.subscription.metadata or obj.payment_intent.metadata here.
  // Only trust metadata that is actually present on the object
  // (Checkout Session, Invoice, Subscription when expanded).

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
  const receivedAt = nowIso();

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
    console.warn("⚠️ Skipping test webhook event in live handler.");
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
  const t0 = performance.now();
  const ok = (message = "OK") => {
    console.log(`✅ Event ${event.id} (${event.type}) done in ${Math.round(performance.now() - t0)}ms - ${message}`);
    return { status: 200, message };
  };
  const fail = (err, message = "Internal server error") => {
    console.error (`❌ Event ${event.id} (${event.type}) failed in ${Math.round(performance.now() - t0)}ms`, err);
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

      // Always try to load subscription metadata so flags are consistent (even when invoice has user_id/plan_duration_id)
      const subscriptionId = invoice.subscription || null;

      if (subscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        
          // fill missing IDs if needed
          if (!user_id) user_id = subscription.metadata?.user_id || user_id;
          if (!plan_duration_id) plan_duration_id = subscription.metadata?.plan_duration_id || plan_duration_id;
        
          // always populate flags if not already set
          if (paid_in_full === null) {
            paid_in_full = subscription.metadata?.paid_in_full === "true";
          }
          if (auto_renewal_enabled === null) {
            auto_renewal_enabled = subscription.metadata?.auto_renewal_enabled === "true";
          }
          if (renew_at_discounted_rate === null) {
            renew_at_discounted_rate = subscription.metadata?.renew_at_discounted_rate === "true";
          }
        } catch (err) {
          console.warn("⚠️ Could not fetch subscription metadata in invoice.payment_succeeded:", err?.message || err);
          // non-fatal unless we still can't identify the user + plan
        }
      } else {
        console.warn("⚠️ invoice.payment_succeeded missing subscription id");
      }
    
      if (!user_id || !plan_duration_id) {
        console.error("❌ Still missing metadata after fallback.");
        return { status: 400 };
      }
    
      const stripe_payment_intent = invoice.payment_intent;
      const stripe_subscription_id = invoice.subscription;
      const amount = (invoice.amount_paid ?? 0) / 100;
      const payment_date = asISO(fromStripeUnix(invoice.created) || nowIso());
    
      console.log("📥 Handling recurring invoice payment:", {
        user_id,
        plan_duration_id,
        stripe_payment_intent,
        stripe_subscription_id,
      });

      // ✅ Source of truth for next billing date: Stripe subscription current_period_end
      let nextPaymentIso = null;
          
      try {
        const sub = await stripe.subscriptions.retrieve(stripe_subscription_id);
        if (sub?.current_period_end) {
          nextPaymentIso = asISO(fromStripeUnix(sub.current_period_end));
        }
      } catch (e) {
        console.warn("⚠️ Could not fetch subscription for next_payment_date:", e?.message || e);
      }
      
      if (nextPaymentIso) {
        try {
          await updateMembershipByUserAndSubscription(
            supabase,
            user_id,
            stripe_subscription_id,
            { next_payment_date: nextPaymentIso }
          );
          console.log("✅ next_payment_date set from Stripe current_period_end:", nextPaymentIso);
        } catch (npErr) {
          console.warn("⚠️ Failed to update next_payment_date:", npErr.message);
        }
      }

      // ----- behavior / desired start (mirrors checkout.session.completed) -----
      const md = invoice.metadata || {};
      let behavior = md.checkout_behavior || "bill_today_start_today"; 
      let mdStartDate = md.start_date ? appMidnight(md.start_date) : null;

      // If we didn’t have metadata on the invoice, we may have loaded the subscription above.
      if ((!behavior || !mdStartDate) && stripe_subscription_id) {
        try {
          const sub = await stripe.subscriptions.retrieve(stripe_subscription_id);
          if (!behavior) behavior = sub?.metadata?.checkout_behavior || behavior;
          if (!mdStartDate && sub?.metadata?.start_date) {
            mdStartDate = appMidnight(sub.metadata.start_date);
          }
        } catch (e) {
          // non-fatal
        }
      }

      // If no explicit start was set, anchor to invoice create time
      const createdAt = fromStripeUnix(invoice.created) || toValidDate(nowIso());
      const desiredStart = mdStartDate && mdStartDate > createdAt ? mdStartDate : mdStartDate || createdAt;
    
      // 🔁 Update existing payment with missing payment intent
      try {
        await patchMissingPaymentIntentBySubscription(supabase, {
          userId: user_id,
          stripeSubscriptionId: stripe_subscription_id,
          stripePaymentIntent: stripe_payment_intent,
        });
        console.log(`✅ Updated payment intent: ${stripe_payment_intent}`);
      } catch (updateError) {
        console.error(
          "❌ Failed to update payment with payment intent:",
          updateError?.message || updateError
        );
      }
      let membershipRow = null;

      try {
        membershipRow = await fetchMembershipByUserAndSubscription(
          supabase,
          user_id,
          stripe_subscription_id
        );
      } catch (membershipRowErr) {
        console.warn(
          "⚠️ invoice.payment_succeeded: membership lookup error:",
          membershipRowErr.message
        );
      }

      const membership_id = membershipRow?.id || null;
      const locationId = membershipRow?.location_id || extractedLocationId || null;
    
      // 🧾 Log recurring payment
      const paymentId = await logPayment(supabase, {
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

      if (membership_id && paymentId) {
        try {
          await updateMembershipById(supabase, membership_id, {
            payment_id: paymentId,
            stripe_payment_intent,
            stripe_subscription_id,
          });
          console.log("✅ Backfilled membership payment linkage after invoice success");
        } catch (linkPayErr) {
          console.warn("⚠️ Failed to backfill membership.payment_id after invoice success:", linkPayErr.message);
        }
      }

      // 🧾 renewals_log: idempotent upsert keyed by (invoice, attempt)
      const attemptNumber = invoice.attempt_count ?? 1;

      await insertRenewalLog(supabase, {
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
        const pd = await fetchPlanDurationById(supabase, plan_duration_id);

        if (!pd) {
          console.error("❌ Missing plan duration during scheduled membership activation:", plan_duration_id);
          return fail(new Error("Missing plan duration"), "Missing plan duration");
        }
      
        const durationLabel = pd?.duration_label || "Unknown";
        const months = pd?.duration_in_months || null;
      
        let contractEndDate = null;
        let expiresAt = null;
        let graceEndsAt = null;

        // ✅ Use Stripe current_period_end as the primary next payment source.
        // Works for monthly AND 3/6/12 month subscriptions.
        let nextPaymentDateIso = nextPaymentIso || null;

        if (months && months > 0) {
          expiresAt = computeMembershipExpiry({
            startDate: desiredStart,
            durationLabel,
            months,
          });
        
          if (!expiresAt) {
            console.error("❌ Failed to compute scheduled membership expiration");
            return fail(
              new Error("Failed to compute scheduled membership expiration"),
              "Failed to compute scheduled membership expiration"
            );
          }

          graceEndsAt = getGraceEndsAtIso(expiresAt);

          if (!graceEndsAt) {
            console.error("❌ Failed to compute scheduled membership grace end date");
            return fail(
              new Error("Failed to compute scheduled membership grace end date"),
              "Failed to compute scheduled membership grace end date"
            );
          }
        
          contractEndDate = pd?.requires_contract ? expiresAt : null;
        
          // Stripe current_period_end should be the source of truth.
          // If Stripe did not provide it, leave null instead of guessing.
          if (!nextPaymentDateIso) {
            nextPaymentDateIso = null;
          }
        } else {
          console.error(
            "❌ Scheduled membership activation failed: memberships must be month-based. Use guest pass flow for day-based plans.",
            plan_duration_id
          );
        
          return fail(
            new Error("Membership plans must be month-based"),
            "Membership plans must be month-based. Use guest pass flow for day-based plans."
          );
        }
      
        const updates = {
          status: "active",
          start_date: asISO(desiredStart),
          contract_end_date: asISO(contractEndDate),
          next_payment_date: nextPaymentDateIso,
          expires_at: asISO(expiresAt),
          grace_ends_at: graceEndsAt,
          stripe_payment_intent,                 // tie the first invoice’s PI if helpful
          stripe_subscription_id,               // already present for subs
          payment_id: paymentId || null,        // connect first payment if not set
          renewal_pending: false,               // clear if it was set
        };
      
        try {
          await updateMembershipById(supabase, membershipRow.id, updates);
          console.log("✅ Activated scheduled membership on first paid invoice");
        
          // Log an event for activation
          await logMembershipEvent({
            userId: user_id,
            eventType: "activated",
            plan: pd?.plan_name || "Unknown",
            durationLabel,
            contractEndDate: asISO(contractEndDate),
            nextPaymentDate: nextPaymentDateIso,
            expiresAt: asISO(expiresAt),
            graceEndsAt,
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
        } catch (actErr) {
          console.error("❌ Failed to activate scheduled membership:", actErr.message);
        }
      }

      // 🧼 Clear renewal_pending flag
      try {
        await updateMembershipByUserAndSubscription(
          supabase,
          user_id,
          stripe_subscription_id,
          { renewal_pending: false }
        );
        console.log("✅ Cleared renewal_pending flag.");
      } catch (resetError) {
        console.warn("⚠️ Failed to clear renewal_pending flag:", resetError.message);
      }
      let durationRow = null;

      try {
        durationRow = await fetchPlanDurationById(supabase, plan_duration_id);
      } catch (durationLookupError) {
        console.warn(
          "⚠️ Failed to fetch plan duration during invoice.payment_succeeded log step:",
          durationLookupError?.message || durationLookupError
        );
      }

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
        const durationRow = await fetchPlanDurationById(supabase, planDurationId);
        if (durationRow) {
          plan = durationRow.plan_name || plan;
          durationLabel = durationRow.duration_label || durationLabel;
        }
      }
    
      const nowLocal = nowIso();
      const attemptNumber = invoice.attempt_count ?? 1;
    
      // ----- behavior / desired start -----
      const md = invoice.metadata || {};
      let behavior = md.checkout_behavior || "bill_today_start_today";
      let mdStartDate = md.start_date ? appMidnight(md.start_date) : null;
    
      // Fallback to subscription metadata if needed
      if ((!behavior || !mdStartDate) && subscriptionId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          if (!behavior) behavior = sub?.metadata?.checkout_behavior || behavior;
          if (!mdStartDate && sub?.metadata?.start_date) {
            mdStartDate = appMidnight(sub.metadata.start_date);
          }
        } catch (e) {
          console.warn("invoice.payment_failed: could not fetch sub metadata", subscriptionId, e?.message);
        }
      }
    
      // 🔍 Fetch latest membership row BEFORE using it
      const membershipRow = await fetchMembershipByUserAndSubscription(
        supabase,
        userId,
        subscriptionId
      );

      const membershipId = membershipRow?.id || null;
      const locationId = membershipRow?.location_id || extractedLocationId || null;
    
      if (!membershipRow) {
        console.warn("⚠️ invoice.payment_failed: No membership row found for subscription. Skipping membership update.");
        // still log payment + renewal log + email, then return ok
      }

      const hasMembership = !!membershipRow;

      // If the membership hasn't gone live yet (scheduled start) and first charge failed:
      // keep it scheduled; record failed activation attempt; DO NOT mark past_due yet.
      if (hasMembership) {
        if (membershipRow?.status === "scheduled") {
          try {
            await updateMembershipById(supabase, membershipId, {
              renewal_pending: true,
              last_renewal_attempt: nowLocal,
              renewal_attempt_count: invoice.attempt_count ?? null,
            });
            console.log("⚠️ Activation charge failed; membership remains 'scheduled'.");
          } catch (schedErr) {
            console.error("❌ Failed to update scheduled membership after failed activation charge:", schedErr.message);
          }
        } else {
          // Normal renewals for already-active members → mark as past_due
          try {
            await updateMembershipByUserAndSubscription(
              supabase,
              userId,
              subscriptionId,
              {
                status: "past_due",
                renewal_pending: false,
                last_renewal_attempt: nowLocal,
                renewal_attempt_count: invoice.attempt_count ?? null,
              }
            );
            console.log(`⚠️ Membership marked as past_due for user ${userId}`);
          } catch (updateError) {
            console.error("❌ Failed to mark membership as past_due:", updateError.message);
          }
        }
      }
    
      // Email + name (don’t shadow variables; fetch once)
      let userRow = null;

      try {
        userRow = await fetchUserBasicIdentityById(supabase, userId);
      } catch (userLookupErr) {
        console.error("❌ Failed to fetch user during invoice.payment_failed:", userLookupErr);
      }

      const fullName = userRow?.full_name || "Member";
      const email = invoice.customer_email || userRow?.email || null;
    
      // 📧 Build a billing portal link and email it once
      let portalUrl = null;

      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const customerId = sub.customer;
      
        const baseUrl =
          process.env.APP_BASE_URL ||
          process.env.NEXT_PUBLIC_BASE_URL ||
          "http://localhost:3000";
      
        const portal = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${baseUrl}/member`,
        });
      
        portalUrl = portal.url;
      } catch (e) {
        console.warn("⚠️ Could not create billing portal session:", e?.message || e);
      }

      try {
        if (email) {
          await sendFailedPaymentEmail({ to: email, fullName, portalUrl });
          console.log(`📧 Sent failed payment email to: ${email}`);
        } else {
          console.warn("⚠️ No email available to send failed payment alert.");
        }
      } catch (err) {
        console.error("❌ Failed during failed-payment email step:", err);
      }
    
      // 💳 Log failed payment
      await logPayment(supabase, {
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
      await insertRenewalLog(supabase, {
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
    
      let existingPayment = null;

      try {
        existingPayment = await fetchLatestPaymentBySubscription(
          supabase,
          subscriptionId
        );
      } catch (fetchError) {
        console.warn(
          "⚠️ No existing payment found to patch via charge.succeeded:",
          fetchError?.message || fetchError
        );
        return { status: 200, message: "No patch needed" };
      }
      
      if (!existingPayment) {
        console.warn("⚠️ No existing payment found to patch via charge.succeeded");
        return { status: 200, message: "No patch needed" };
      }
    
      // Patch missing stripe_payment_intent if needed
      if (!existingPayment.stripe_payment_intent) {
        try {
          await updatePaymentStripeIntent(
            supabase,
            existingPayment.id,
            paymentIntentId
          );
          console.log(
            `✅ Patched missing stripe_payment_intent for payment ID: ${existingPayment.id}`
          );
        } catch (patchError) {
          console.error(
            "❌ Failed to patch payment intent via charge.succeeded:",
            patchError?.message || patchError
          );
        }
      } else {
        console.log("🟡 Payment already had intent — no patch needed.");
      }
    
      // 🔁 Optionally backfill membership_id
      if (!existingPayment.membership_id && userId) {
        let membership = null;
        let membershipError = null;
              
        try {
          membership = await fetchMembershipByUserAndSubscription(
            supabase,
            userId,
            subscriptionId
          );
        } catch (err) {
          membershipError = err;
        }
      
        if (membership?.id) {
          try {
            await attachMembershipToPayment(
              supabase,
              existingPayment.id,
              membership.id,
              {
                stripe_payment_intent: paymentIntentId,
              }
            );
            console.log(
              `✅ Backfilled membership_id (${membership.id}) for payment ID: ${existingPayment.id}`
            );
          } catch (backfillError) {
            console.error(
              "❌ Failed to backfill membership_id via charge.succeeded:",
              backfillError?.message || backfillError
            );
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
      const nowLocal = nowIso();
      // 🔎 (Optional) fetch membership id for better logging
      const membershipRow = await fetchMembershipByUserAndSubscription(
        supabase,
        userId,
        subscription.id
      );

      const membershipId = membershipRow?.id || null;
      const locationId = membershipRow?.location_id || extractedLocationId || null;

      // 🛑 Mark membership cancelled and clear renewal-related fields
      try {
        await updateMembershipByUserAndSubscription(
          supabase,
          userId,
          subscription.id,
          {
            status: "cancelled",
            expired_on: nowLocal,
            expires_at: nowLocal,
            grace_ends_at: nowLocal,
            next_payment_date: null,
            renewal_pending: false,
            last_renewal_attempt: nowLocal,
          }
        );
        console.log("🗑️ Subscription deleted. Membership marked cancelled.");
      } catch (cancelErr) {
        console.error("❌ Failed to mark membership cancelled:", cancelErr.message);
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
        graceEndsAt: nowLocal,
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
      const now = toValidDate(nowIso());
      const nowLocal = asISO(now);
      // ----- Admin-delayed start controls -----
      const md = session.metadata || {};
      const behavior = md.checkout_behavior || "bill_today_start_today"; // 'bill_today_start_today' | 'bill_today_start_later' | 'bill_at_start_date'
      const mdStartDate = md.start_date ? appMidnight(md.start_date) : null;

      // Anchor all date math to the desired start when present & in future
      const desiredStart = mdStartDate && mdStartDate > now ? mdStartDate : now;

      // Only log a payment now if Stripe actually charged now.
      // For 'bill_at_start_date' we expect the charge at the start date (invoice.payment_succeeded).
      let paymentId = null;
      const chargedNow = session.payment_status === "paid";
      const shouldLogPaymentNow = chargedNow && behavior !== "bill_at_start_date";

      if (shouldLogPaymentNow) {
        paymentId = await logPayment(supabase, {
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

      let durationData = null;

      try {
        durationData = await fetchPlanDurationById(supabase, planDurationId);
      } catch (durationError) {
        console.error("❌ Invalid plan_duration_id:", durationError?.message);
        return { status: 400, message: "Invalid plan_duration_id" };
      }

      if (!durationData) {
        console.error("❌ Invalid plan_duration_id: not found");
        return { status: 400, message: "Invalid plan_duration_id" };
      }
      const planNameNorm = String(durationData.plan_name || "").trim().toLowerCase();
      const isGuestPass = planNameNorm.startsWith("guest"); // catches "Guest Pass", "Guest-Pass", etc.
      const isPaidInFull = session.metadata.paid_in_full === "true";
      const autoRenewalEnabled = session.metadata.auto_renewal_enabled === "true";
      const renewAtDiscountedRate = session.metadata.renew_at_discounted_rate === "true";
      const isRenewal = session.metadata?.is_renewal === "true";
        // 🟡 Handle Paid-in-Full Auto-Renewal
      if (isRenewal && isPaidInFull) {
        let existingMembership = null;

        try {
          existingMembership = await fetchActiveMembershipByPlanDuration(
            supabase,
            userId,
            planDurationId
          );
        } catch (existingError) {
          console.error("❌ Could not fetch existing membership for renewal:", existingError.message);
          return { status: 500, message: "Failed to fetch active membership" };
        }

        if (!existingMembership?.contract_end_date) {
          console.error("❌ Active membership missing contract_end_date for renewal");
          return { status: 500, message: "Failed to fetch active membership" };
        }
      
        const previousContractEnd = toValidDate(existingMembership.contract_end_date);

        if (!previousContractEnd) {
          console.error("❌ Invalid contract_end_date for paid-in-full renewal");
          return { status: 500, message: "Invalid contract end date" };
        }

        const renewalStart = new Date(previousContractEnd.getTime() + 1);

        const newExpiresAt = computeMembershipExpiry({
          startDate: renewalStart,
          durationLabel: durationData.duration_label,
          months: durationData.duration_in_months,
        });

        if (!newExpiresAt) {
          console.error("❌ Failed to compute paid-in-full renewal expiration");
          return { status: 500, message: "Failed to compute renewal expiration" };
        }

        const newContractEndDate = durationData.requires_contract ? newExpiresAt : null;
      
        const newGraceEndsAt = getGraceEndsAtIso(newExpiresAt);

        if (!newGraceEndsAt) {
          console.error("❌ Failed to compute paid-in-full renewal grace end date");
          return { status: 500, message: "Failed to compute renewal grace end date" };
        }

        // ✅ Source of truth: Stripe subscription current_period_end (matches 3/6/12 month billing)
        let newNextPaymentDate = null;

        try {
          if (session.subscription) {
            const sub = await stripe.subscriptions.retrieve(session.subscription);
            if (sub?.current_period_end) {
              newNextPaymentDate = fromStripeUnix(sub.current_period_end);
            }
          }
        } catch (e) {
          console.warn("⚠️ Renewal: could not fetch subscription current_period_end:", e?.message || e);
        }
      
        try {
          await updateMembershipByUserAndPlanDuration(
            supabase,
            userId,
            planDurationId,
            {
              contract_end_date: asISO(newContractEndDate),
              expires_at: asISO(newExpiresAt),
              grace_ends_at: newGraceEndsAt,
              next_payment_date: asISO(newNextPaymentDate),
              renewal_attempt_count: 0,
              last_renewal_attempt: nowLocal,
              renewal_pending: false,
              stripe_session_id: session.id,
              stripe_payment_intent: paymentIntentId || null,
              payment_id: paymentId,
            }
          );
        } catch (updateError) {
          console.error("❌ Failed to update paid-in-full renewal:", updateError.message);
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
          graceEndsAt: newGraceEndsAt,
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
        const expiresAt = computeGuestPassExpiry({
          startDate: now,
          durationDays: durationData.duration_in_days,
        });

        let guestPassRow = null;

        try {
          guestPassRow = await upsertGuestPassForUser(supabase, {
            user_id: userId,
            start_date: asISO(now),
            expires_at: asISO(expiresAt),
            status: "active",
            pass_source: "stripe",
            stripe_session_id: session.id,
            stripe_payment_intent: paymentIntentId || null,
            location_id: locationId,
            payment_id: null,
          });
        } catch (guestPassError) {
          console.error("❌ Failed to upsert guest pass:", guestPassError?.message || guestPassError);
          return { status: 500, message: "Guest pass upsert failed" };
        }

        const guestPassId = guestPassRow?.id || null;

        if (!guestPassId) {
          console.error("❌ Guest pass upsert returned no id");
          return { status: 500, message: "Guest pass upsert failed" };
        }
        const guestPassPaymentId = await logPayment(supabase, {
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

        if (guestPassPaymentId) {
          try {
            await attachPaymentToGuestPass(supabase, guestPassId, guestPassPaymentId);
          } catch (attachError) {
            console.error(
              "❌ Failed to attach payment to guest pass:",
              attachError?.message || attachError
            );
          }
        }

        if (guestPassPaymentId) {
          try {
            await attachGuestPassToPayment(
              supabase,
              guestPassPaymentId,
              guestPassId
            );
          } catch (attachPaymentError) {
            console.error(
              "❌ Failed to attach guest pass to payment:",
              attachPaymentError?.message || attachPaymentError
            );
          }
        }

        await logGuestPassEvent({
          userId,
          guest_pass_id: guestPassId,
          eventType: "purchased",
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
      let expiresAt = null;
      let contractEndDate = null;
      let nextPaymentDate = null;

      // ✅ Stripe is source of truth for subscription next bill date
      let nextPaymentDateFromStripe = null;
      if (session.subscription) {
        try {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          if (sub?.current_period_end) {
            nextPaymentDateFromStripe = fromStripeUnix(sub.current_period_end);
          }
        } catch (e) {
          console.warn("⚠️ Could not fetch subscription current_period_end at checkout:", e?.message || e);
        }
      }

      if (durationData.duration_in_months) {
        expiresAt = computeMembershipExpiry({
          startDate: desiredStart,
          durationLabel: durationData.duration_label,
          months: durationData.duration_in_months,
        });
      
        if (!expiresAt) {
          console.error("❌ Failed to compute membership expiration date");
          return { status: 500, message: "Failed to compute membership expiration" };
        }
      
        contractEndDate = durationData.requires_contract ? expiresAt : null;
      
        nextPaymentDate =
          !isPaidInFull || autoRenewalEnabled
            ? nextPaymentDateFromStripe
            : null;
      } else {
        console.error(
          "❌ Non-guest-pass membership is missing duration_in_months:",
          planDurationId
        );
      
        return {
          status: 400,
          message: "Membership plans must be month-based. Use guest pass flow for day-based plans.",
        };
      }

      const graceEndsAt = getGraceEndsAtIso(expiresAt);

      if (!graceEndsAt) {
        console.error("❌ Failed to compute membership grace end date");
        return { status: 500, message: "Failed to compute membership grace end date" };
      }

      let contractSignatureId = null;
      // Insert contract signature only if this plan requires one
      const planRequiresContract = Boolean(durationData.requires_contract);
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
              created_at: nowIso(),
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
      const baseMembershipPayload = {
        user_id: userId,
        plan_duration_id: planDurationId,
        status: statusForMembership,
        start_date: asISO(desiredStart),
        contract_end_date: asISO(contractEndDate),
        next_payment_date: asISO(nextPaymentDate),
        expires_at: asISO(expiresAt),
        grace_ends_at: graceEndsAt,
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
        location_id: locationId,
      };
      
      const membershipPayload = shouldLogPaymentNow
        ? {
            ...baseMembershipPayload,
            renewal_attempt_count: 0,
            last_renewal_attempt: nowLocal,
            renewal_pending: false,
          }
        : {
            ...baseMembershipPayload,
            // scheduled start: don't imply renewal activity
            renewal_attempt_count: null,
            last_renewal_attempt: null,
            renewal_pending: true, // optional, but useful: "waiting for first charge"
          };

      // Log exactly what you’ll write
      console.log("📥 Membership UPSERT payload:", membershipPayload);

      // Write it
      let membershipData = null;

      try {
        await upsertMembershipForUser(supabase, membershipPayload);
        membershipData = await fetchLatestMembershipByUserAndPlanDuration(
          supabase,
          userId,
          planDurationId
        );
      } catch (membershipError) {
        console.error("❌ Failed to upsert/fetch membership:", membershipError.message);
        return { status: 500, message: "Membership upsert failed" };
      }
      if (membershipData?.id && paymentId) {
        try {
          await attachMembershipToPayment(
            supabase,
            paymentId,
            membershipData.id,
            {
              stripe_subscription_id: session.subscription || null,
              stripe_payment_intent: paymentIntentId || null,
            }
          );
        } catch (attachMembershipError) {
          console.error(
            "❌ Failed to attach membership to payment:",
            attachMembershipError?.message || attachMembershipError
          );
        }
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

      const eventType = statusForMembership === "scheduled" ? "scheduled" : "created";

      await logMembershipEvent({
        userId,
        eventType,
        plan: durationData.plan_name,
        durationLabel: durationData.duration_label,
        contractEndDate: asISO(contractEndDate),
        nextPaymentDate: asISO(nextPaymentDate),
        expiresAt: asISO(expiresAt),
        graceEndsAt,
        expiredOn: null,
        notes: `${notes}${dbg}`,
        contract_signature_id: contractSignatureId,
        paid_in_full: isPaidInFull,
        stripe_subscription_id: session.subscription || null,
        stripe_payment_intent: paymentIntentId || null,
        payment_id: paymentId,
        pass_source: "stripe",
        description:
          statusForMembership === "scheduled"
            ? `Membership scheduled (${behavior})`
            : `${durationData.plan_name} ${durationData.duration_label} membership via Stripe`,
        auto_renewal_enabled: autoRenewalEnabled,
        renew_at_discounted_rate: renewAtDiscountedRate,
      
        // ✅ reflect reality
        renewal_pending: !shouldLogPaymentNow,
        renewal_attempt_count: shouldLogPaymentNow ? 0 : null,
        last_renewal_attempt: shouldLogPaymentNow ? nowLocal : null,
      
        locationId,
      });
      console.log("✅ Stripe event handled:", event.type);
      return ok("Membership/guest pass created");
    } 
    // ---- Final fallback (only runs if no handler above returned) ----
    if (fallbackUserId) {
      try {
        await updateMembershipByUserAndPlanDuration(
          supabase,
          fallbackUserId,
          extractedPlanDurationId,
          { renewal_pending: false }
        );
      } catch (fallbackErr) {
        console.warn("⚠️ Could not clear fallback renewal_pending:", fallbackErr.message);
      }
    }
      
    console.log(`⚠️ Unhandled Stripe event type: ${event.type}`);
    return ok("Unhandled event type");
  } catch (error) {
    // Log once and bubble an error response for the route to return 500
    console.error("❌ stripeWebhookHandler error:", error);
    return fail(error);
  }
}