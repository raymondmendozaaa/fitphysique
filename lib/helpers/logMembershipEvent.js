import { supabase } from "@/lib/supabaseClient";

// ✅ Convert to Local Time (America/Chicago)
function toLocalISOString(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString();
}

export async function logMembershipEvent({
  userId,
  eventType,
  plan,
  durationLabel,
  contractEndDate = null,
  nextPaymentDate = null,
  expiresAt = null,
  expiredOn = null,
  notes = null,
  isPromotional = false,
  promoStartDate = null,
  promoEndDate = null,
  stripe_subscription_id = null,
  stripe_payment_intent = null,
  pass_source = null,
  description = null,
  locationId = null,
  payment_id = null,
  contract_signature_id = null,
  paid_in_full = false,
  auto_renewal_enabled = false,
  renew_at_discounted_rate = false,
  renewal_pending = false,
  renewal_attempt_count = 0,
  last_renewal_attempt = null,
}) {
  if (!userId || !eventType || !plan || !durationLabel || !contractEndDate) {
    console.error("❌ Missing required membership log data.");
    return;
  }

  const nowUTC = new Date();
  const localLoggedAt = toLocalISOString(nowUTC);

  const { error } = await supabase.from("memberships_logs").insert({
    user_id: userId,
    event_type: eventType,
    plan,
    duration_label: durationLabel,
    contract_end_date: contractEndDate ? toLocalISOString(new Date(contractEndDate)) : null,
    next_payment_date: nextPaymentDate ? toLocalISOString(new Date(nextPaymentDate)) : null,
    expires_at: expiresAt ? toLocalISOString(new Date(expiresAt)) : null,
    expired_on: null,
    notes,
    is_promotional: isPromotional,
    promo_start_date: promoStartDate ? toLocalISOString(new Date(promoStartDate)) : null,
    promo_end_date: promoEndDate ? toLocalISOString(new Date(promoEndDate)) : null,
    stripe_subscription_id,
    stripe_payment_intent,
    pass_source,
    description,
    location_id: locationId,
    payment_id,
    contract_signature_id,
    paid_in_full,
    auto_renewal_enabled, 
    renew_at_discounted_rate, 
    renewal_pending,
    renewal_attempt_count,
    last_renewal_attempt: last_renewal_attempt
      ? toLocalISOString(new Date(last_renewal_attempt))
      : null,
    logged_at: localLoggedAt,
  });

  if (error) {
    console.error("❌ Failed to log membership event:", error.message);
  } else {
    console.log(`📘 Logged membership event: ${eventType} for user ${userId}`);
  }
}