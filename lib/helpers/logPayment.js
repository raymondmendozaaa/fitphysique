import { supabase } from "@/lib/supabaseClient";

export async function logPayment({
  user_id,
  amount,
  method,                  // required
  status,                  // required
  payment_date,            // required
  stripe_session_id,
  stripe_payment_intent,
  guest_pass_id = null,
  membership_id = null,
}) {
  if (!user_id || !amount || !method || !status || !payment_date) {
    console.error("❌ Missing or invalid required payment fields");
    return null;
  }

  // ✅ Prevent Duplicate Payment Logging
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id")
    .or(`stripe_session_id.eq.${stripe_session_id},stripe_payment_intent.eq.${stripe_payment_intent}`)
    .single();

  if (existingPayment) {
    console.warn("⚠️ Payment already logged for this session or payment intent.");
    return existingPayment.id;
  }

  const { data: newPayment, error } = await supabase
    .from("payments")
    .insert({
      user_id,
      amount,
      method,
      status,
      payment_date,
      stripe_session_id,
      stripe_payment_intent,
      guest_pass_id,
      membership_id,
    })
    .select("id")
    .single();

  if (error || !newPayment) {
    console.error("❌ Failed to log payment:", error?.message);
    return null;
  }

  console.log(
    `💸 Payment recorded successfully for user ${user_id}.`,
    `Type: ${guest_pass_id ? "Guest Pass" : "Membership"}`,
    `Amount: $${amount}`,
    `Status: ${status}`
  );

  return newPayment.id;
}