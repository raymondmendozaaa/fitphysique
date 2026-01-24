import { supabase } from "@/lib/supabaseClient";

/**
 * Upserts a renewal attempt keyed by (stripe_invoice_id, attempt_number).
 * Retries for the same invoice+attempt will update the existing row.
 */
export async function insertRenewalLog({
  user_id,
  membership_id = null,
  stripe_subscription_id,
  stripe_invoice_id = null,
  stripe_payment_intent = null,
  attempt_result,            // 'succeeded' | 'failed'
  amount,
  attempt_number,
  payment_date,              // ISO string
  notes = null,
}) {
  // We need these to guarantee idempotency
  if (!stripe_invoice_id || attempt_number == null) {
    console.warn(
      "insertRenewalLog skipped: missing stripe_invoice_id or attempt_number",
      { stripe_invoice_id, attempt_number }
    );
    return { data: null, error: null };
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
    // optional if you have this column:
    // updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("renewals_log")
    .upsert(payload, { onConflict: "stripe_invoice_id,attempt_number" })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("❌ renewals_log upsert failed:", error.message);
  } else {
    console.log(`🧾 renewals_log upserted (${attempt_result}) for invoice ${stripe_invoice_id} #${attempt_number}`);
  }

  return { data, error };
}