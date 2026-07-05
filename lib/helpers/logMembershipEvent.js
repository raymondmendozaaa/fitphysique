import { supabase } from "@/lib/supabaseClient";
import { toUtcIso, getNowUtcIso } from "@/lib/utils/dateTime";

export async function logMembershipEvent({
  userId,
  eventType,
  plan,
  durationLabel,
  contractEndDate = null,
  nextPaymentDate = null,
  expiresAt = null,
  graceEndsAt = null,
  expiredOn = null,
  cancelledOn = null,
  cancelled_by_user_id = null,
  cancelled_by_role = null,
  cancellation_reason = null,
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
  // Only require plan/duration for events that describe a membership term
  const needPlanMeta = [
    "created",
    "renewed",
    "activated",
    "scheduled",
    "admin_create_membership",
    "admin_renew_membership",
  ].includes(eventType);

  if (!userId || !eventType || (needPlanMeta && (!plan || !durationLabel))) {
    console.error("❌ Missing required membership log data.", {
      userId,
      eventType,
      plan,
      durationLabel,
    });
    return;
  }

  const loggedAt = getNowUtcIso();

  const { error } = await supabase.from("memberships_logs").insert({
    user_id: userId,
    event_type: eventType,
    plan,
    duration_label: durationLabel,
    contract_end_date: toUtcIso(contractEndDate),
    next_payment_date: toUtcIso(nextPaymentDate),
    expires_at: toUtcIso(expiresAt),
    grace_ends_at: toUtcIso(graceEndsAt),
    expired_on: toUtcIso(expiredOn),
    cancelled_on: toUtcIso(cancelledOn),
    cancelled_by_user_id,
    cancelled_by_role,
    cancellation_reason,
    notes,
    is_promotional: isPromotional,
    promo_start_date: toUtcIso(promoStartDate),
    promo_end_date: toUtcIso(promoEndDate),
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
    last_renewal_attempt: toUtcIso(last_renewal_attempt),
    logged_at: loggedAt,
  });

  if (error) {
    console.error("❌ Failed to log membership event:", error.message);
  } else {
    console.log(`📘 Logged membership event: ${eventType} for user ${userId}`);
  }
}