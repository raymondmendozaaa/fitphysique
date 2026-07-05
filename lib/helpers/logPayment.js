// lib/helpers/logPayment.js
import {
  fetchPaymentByStripeRefs,
  insertPayment,
} from "@/lib/db/payments";
import { toUtcIso } from "@/lib/utils/dateTime";

export async function logPayment(
  supabase,
  {
    user_id,
    amount,
    method,
    status,
    payment_date,
    stripe_session_id = null,
    stripe_payment_intent = null,
    stripe_subscription_id = null,
    invoice_id = null,
    source = null,
    notes = null,
    guest_pass_id = null,
    membership_id = null,
    locationId = null,
  }
) {
  if (!supabase) {
    console.error("❌ logPayment: supabase client is required");
    return null;
  }

  if (!user_id || amount == null || !method || !status || !payment_date) {
    console.error("❌ logPayment: missing required fields");
    return null;
  }

  const normalizedPaymentDate = toUtcIso(payment_date);

  if (!normalizedPaymentDate) {
    console.error("❌ logPayment: invalid payment_date");
    return null;
  }

  try {
    const existingPayment = await fetchPaymentByStripeRefs(supabase, {
      stripe_session_id,
      stripe_payment_intent,
      invoice_id,
    });

    if (existingPayment) {
      console.warn("⚠️ Payment already logged for this Stripe object.");
      return existingPayment.id;
    }

    const newPayment = await insertPayment(supabase, {
      user_id,
      amount,
      method,
      status,
      payment_date: normalizedPaymentDate,
      stripe_session_id,
      stripe_payment_intent,
      stripe_subscription_id,
      invoice_id,
      source,
      notes,
      guest_pass_id,
      membership_id,
      location_id: locationId,
    });

    if (!newPayment?.id) {
      console.error("❌ Failed to log payment: missing inserted payment id");
      return null;
    }

    console.log(
      `💸 Payment recorded successfully for user ${user_id}.`,
      `Type: ${guest_pass_id ? "Guest Pass" : "Membership"}`,
      `Amount: $${amount}`,
      `Status: ${status}`
    );

    return newPayment.id;
  } catch (error) {
    console.error("❌ Failed to log payment:", error?.message || error);
    return null;
  }
}