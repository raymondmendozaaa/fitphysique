import { supabase } from "@/lib/supabaseClient";
import { logMembershipEvent } from "@/lib/helpers/logMembershipEvent";
import { logGuestPassEvent } from "@/lib/helpers/logGuestPassEvent";
import { logPayment } from "@/lib/helpers/logPayment";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ✅ Convert Date to Local Time (Central Time, Texas)
function toLocalISOString(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString();
}

export async function handleStripeEvent(event) {
  console.log("🎯 Stripe event type:", event.type);
  try {
    const session = event.data.object;
    const userId = session.metadata?.user_id;
    let paymentIntentId = session.payment_intent;

    if (!paymentIntentId && session.mode === 'subscription') {
      // 🔍 fallback: fetch latest invoice to get payment_intent
      const invoice = await stripe.invoices.retrieve(session.invoice);
      paymentIntentId = invoice.payment_intent;
    }
    
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;

      let { user_id, plan_duration_id } = invoice.metadata || {};

      if (!user_id || !plan_duration_id) {
        const subscriptionId = invoice.subscription;
        console.warn("⚠️ Invoice metadata missing. Attempting to fetch subscription:", subscriptionId);
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          user_id = subscription.metadata?.user_id;
          plan_duration_id = subscription.metadata?.plan_duration_id;
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
      const amount = invoice.amount_paid / 100;
      const payment_date = invoice.created
        ? new Date(invoice.created * 1000).toISOString()
        : new Date().toISOString();

      if (!user_id || !plan_duration_id) {
        console.error("❌ Missing user_id or plan_duration_id in invoice metadata.");
        return { status: 400 };
      }
    
      // 🔁 Update payments table (fill in missing payment intent)
      const { error: updateError } = await supabase
        .from("payments")
        .update({ stripe_payment_intent })
        .eq("user_id", user_id)
        .eq("stripe_subscription_id", stripe_subscription_id);
    
      if (updateError) {
        console.error("❌ Failed to update payment with payment intent:", updateError.message);
      } else {
        console.log(`✅ Updated payment intent: ${stripe_payment_intent}`);
      }

      // Log recurring payments
        await logPayment({
          user_id,
          amount,
          method: "stripe",
          status: "completed",
          payment_date,
          stripe_payment_intent,
          stripe_session_id: null,
          membership_id: null,
        });
    
      return { status: 200 };
    }

    if (event.type === "charge.succeeded") {
      const charge = event.data.object;

      const paymentIntentId = charge.payment_intent;
      const subscriptionId = charge.subscription;

      if (!paymentIntentId || !subscriptionId) {
        console.warn("⚠️ charge.succeeded is missing paymentIntent or subscription ID");
        return { status: 200, message: "No update performed" };
      }

      console.log("✅ Resolved Payment Intent ID:", paymentIntentId);
    
      // Try to update the payment with missing intent
      const { error } = await supabase
        .from("payments")
        .update({ stripe_payment_intent: paymentIntentId })
        .eq("stripe_subscription_id", subscriptionId)
        .is("stripe_payment_intent", null);
    
      if (error) {
        console.error("❌ Failed to patch payment intent from charge.succeeded:", error.message);
      } else {
        console.log(`✅ Patched missing stripe_payment_intent via charge.succeeded for subscription ${subscriptionId}`);
      }
    
      return { status: 200, message: "Handled charge.succeeded" };
    }

    if (event.type !== "checkout.session.completed") {
      if (userId) {
        await supabase
          .from("memberships")
          .update({ renewal_pending: false })
          .eq("user_id", userId);
      }
    
      console.log(`⚠️ Unhandled Stripe event type: ${event.type}`);
      return { status: 200, message: "Unhandled event type" };
    }

    console.log("✅ Handling checkout.session.completed");

    const planDurationId = session.metadata?.plan_duration_id;

    if (!userId || !planDurationId) {
      console.error("❌ Missing user_id or plan_duration_id in metadata");
      return { status: 400, message: "Missing metadata" };
    }

    const now = new Date();
    const nowLocal = toLocalISOString(now); // ✅ Reusable timestamp

    const paymentId = await logPayment({
      user_id: userId,
      amount: session.amount_total ? session.amount_total / 100 : 0,
      method: "stripe",
      status: "completed",
      payment_date: nowLocal,
      stripe_session_id: session.id,
      stripe_payment_intent: paymentIntentId || null,
    });
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
          contract_end_date: toLocalISOString(newContractEndDate),
          expires_at: toLocalISOString(newExpiresAt),
          next_payment_date: toLocalISOString(newNextPaymentDate),
          renewal_attempt_count: 0,
          last_renewal_attempt: toLocalISOString(now),
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
        contractEndDate: toLocalISOString(newContractEndDate),
        nextPaymentDate: toLocalISOString(newNextPaymentDate),
        expiresAt: toLocalISOString(newExpiresAt),
        expiredOn: null,
        notes: "Auto-renewed paid-in-full membership",
        paid_in_full: true,
        stripe_payment_intent: paymentIntentId || null,
        payment_id: paymentId,
        pass_source: "stripe",
        auto_renewal_enabled: autoRenewalEnabled,
        renew_at_discounted_rate: renewAtDiscountedRate,
        renewal_pending: false,
        renewal_attempt_count: 0,
        last_renewal_attempt: new Date(),
      });
    
      await supabase.from("users").update({ onboarded: true }).eq("id", userId);
      return { status: 200, message: "Paid-in-full membership renewed." };
    }

    // ✅ Guest Pass Logic (Separate)
    if (isGuestPass) {
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + durationData.duration_in_days);

      const { data: existingPass } = await supabase
        .from("guest_passes")
        .select("id")
        .eq("user_id", userId)
        .single();

      let guestPassId;
      if (existingPass) {
        const { data } = await supabase
          .from("guest_passes")
          .update({
            expires_at: toLocalISOString(expiresAt),
            pass_source: "stripe",
            stripe_session_id: session.id,
            stripe_payment_intent: paymentIntentId || null,
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
            expires_at: toLocalISOString(expiresAt),
            pass_source: "stripe",
            stripe_session_id: session.id,
            stripe_payment_intent: paymentIntentId || null,
          })
          .select("id")
          .single();
        guestPassId = data?.id;
      }

      await logGuestPassEvent({
        userId,
        guest_pass_id: guestPassId,
        eventType: existingPass ? "updated" : "created",
        expiresAt: toLocalISOString(expiresAt),
        notes: `User purchased ${durationData.duration_label} Guest Pass via Stripe`,
        description: `Stripe Guest Pass: ${durationData.duration_label}`,
        pass_source: "stripe",
        payment_id: paymentIntentId || null,
      });

      return { status: 200, message: "Guest pass created and logged." };
    }

    // ✅ Membership Logic (With Auto-Renewal and Discounted Renewal)
    let expiresAt = new Date(now);
    let contractEndDate = null;
    let nextPaymentDate = null;

    if (durationData.duration_in_months) {
      contractEndDate = new Date(now);
      contractEndDate.setMonth(contractEndDate.getMonth() + durationData.duration_in_months);

      if (!isPaidInFull) {
        // Members paying monthly will have their next payment in 1 month
        nextPaymentDate = new Date(now);
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      } else if (autoRenewalEnabled) {
        // Paid-in-full members who opted for auto-renew get charged the month after contract ends
        nextPaymentDate = new Date(contractEndDate);
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      } else {
        // Paid-in-full without auto-renew: no upcoming payment
        nextPaymentDate = null;
      }
    } else if (durationData.duration_in_days) {
      // Guest passes and non-monthly plans use days
      expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + durationData.duration_in_days);
    }

    // ⏳ Apply 3-day grace period to contract end
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
      const { data: insertedSig, error: sigError } = await supabase
        .from("contract_signatures")
        .insert({
          user_id: userId,
          plan_duration_id: planDurationId,
          contract_id: session.metadata?.contract_id || null,
          signature: session.metadata.signature,
          agreed: true,
          created_at: toLocalISOString(new Date()),
        })
        .select("id")
        .single();
      
      if (sigError) {
        console.error("❌ Failed to insert contract signature:", sigError.message);
      } else {
        contractSignatureId = insertedSig.id;
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

    console.log("📥 Membership UPSERT payload:", {
      user_id: userId,
      plan_duration_id: planDurationId,
      status: "active",
      start_date: toLocalISOString(now),
      contract_end_date: contractEndDate ? toLocalISOString(contractEndDate) : null,
      next_payment_date: nextPaymentDate ? toLocalISOString(nextPaymentDate) : null,
      expires_at: expiresAt ? toLocalISOString(expiresAt) : null,
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
    });
    
    const { error: upsertError } = await supabase.from("memberships").upsert({
      user_id: userId,
      plan_duration_id: planDurationId,
      status: "active",
      start_date: nowLocal,
      contract_end_date: contractEndDate ? toLocalISOString(contractEndDate) : null,
      next_payment_date: nextPaymentDate ? toLocalISOString(nextPaymentDate) : null,
      expires_at: expiresAt ? toLocalISOString(expiresAt) : null,
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
    });

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
      contractEndDate: contractEndDate || null,
      nextPaymentDate: nextPaymentDate || null,
      expiresAt: expiresAt,
      expiredOn: null,
      notes,
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
      last_renewal_attempt: now,
    });

    await supabase.from("users").update({ onboarded: true }).eq("id", userId);
    return { status: 200, message: "Membership created and logged." };
  } catch (error) {
    console.error("❌ Stripe webhook error:", error);
    return { status: 500, message: "Internal server error" };
  }
}