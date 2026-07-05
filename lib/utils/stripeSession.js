// lib/utils/stripeSession.js
export async function createStripeSession({
  userId,
  planDurationId,
  requiresContract = false,
  paidInFull = false,
  autoRenewalEnabled = false,
  renewAtDiscountedRate = false,
  isRenewal = false,
  typedName = "",
  agreeChecked = false,
  contractId = "",
  contractVersion = null,
  ipAddress = null,
  locationId = null,
  gpsAccuracy = null,
  startDate = null,
  checkoutBehavior = null,
  source = "member",
  pricingTierOverride = null,
}) {
  const payload = {
    user_id: userId,
    plan_duration_id: planDurationId,
    requires_contract: !!requiresContract,
    paid_in_full: !!paidInFull,
    auto_renewal_enabled: !!autoRenewalEnabled,
    renew_at_discounted_rate: !!renewAtDiscountedRate,
    is_renewal: !!isRenewal,
    signature: typedName,
    agreed: !!agreeChecked,
    contract_id: contractId,
    contract_version: contractVersion,
    ip_address: ipAddress,
    location_id: locationId,
    gps_accuracy: gpsAccuracy,
    start_date: startDate,
    checkout_behavior: checkoutBehavior,
    source,
    pricing_tier_override: pricingTierOverride,
  };

  const res = await fetch("/api/create-stripe-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("❌ Failed to create Stripe session:", text);
    throw new Error(text || "Failed to create Stripe session.");
  }

  const data = await res.json();
  if (!data?.url) {
    throw new Error("Stripe session URL was missing.");
  }

  return data.url;
}