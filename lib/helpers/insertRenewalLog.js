// lib/helpers/insertRenewalLog.js

/**
 * Upserts a renewal attempt keyed by (stripe_invoice_id, attempt_number).
 * Retries for the same invoice + attempt update the existing row.
 */
export async function insertRenewalLog(
  supabase,
  {
    user_id,
    membership_id = null,
    stripe_subscription_id,
    stripe_invoice_id = null,
    stripe_payment_intent = null,
    attempt_result, // "succeeded" | "failed"
    amount,
    attempt_number,
    payment_date, // UTC ISO string from Stripe/webhook flow
    notes = null,
  }
) {
  if (!supabase) {
    throw new Error("insertRenewalLog requires a Supabase client.");
  }

  // Required for idempotency.
  if (!stripe_invoice_id || attempt_number == null) {
    console.warn(
      "insertRenewalLog skipped: missing stripe_invoice_id or attempt_number",
      { stripe_invoice_id, attempt_number }
    );

    return { data: null, error: null };
  }

  const allowedResults = new Set(["succeeded", "failed"]);
  if (!allowedResults.has(attempt_result)) {
    throw new Error(`Invalid renewal attempt_result: ${attempt_result}`);
  }

  const payload = {
    user_id,
    membership_id,
    stripe_subscription_id,
    stripe_invoice_id,
    stripe_payment_intent,
    attempt_result,
    amount,
    attempt_number,
    payment_date,
    notes,
  };

  const { data, error } = await supabase
    .from("renewals_log")
    .upsert(payload, { onConflict: "stripe_invoice_id,attempt_number" })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("❌ renewals_log upsert failed:", error);
  } else {
    console.log(
      `🧾 renewals_log upserted (${attempt_result}) for invoice ${stripe_invoice_id} #${attempt_number}`
    );
  }

  return { data, error };
}