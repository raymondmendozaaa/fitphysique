export function getStripePriceKey(
  planName,
  durationLabel,
  paidInFull = false,
  renewAtDiscountedRate = false,
  isRenewal = false
) {
  const planKey = planName.toUpperCase().replace(/[\s\-]+/g, "_");

  // 🔁 Normalize durationLabel
  const normalizedDuration = durationLabel
    .replace(/Paid in Full/i, "")
    .toUpperCase()
    .replace(/[\s\-]+/g, "");

  // ✅ Handle Guest Pass
  if (planKey === "GUEST_PASS") {
    return `STRIPE_GUEST_PASS_${normalizedDuration}`;
  }

  // 🔁 Logic for Renewals
  if (isRenewal) {
    if (paidInFull && renewAtDiscountedRate) {
      // Both toggled on → stay on Paid-in-Full plan
      return `STRIPE_${planKey}_${normalizedDuration}_PAID`;
    } else {
      // Only auto-renew on → use the regular contract version
      return `STRIPE_${planKey}_${normalizedDuration}`;
    }
  }

  // 🧾 New signups
  if (paidInFull) {
    return `STRIPE_${planKey}_${normalizedDuration}_PAID`;
  }

  // Default fallback (used for monthly signups only)
  return `STRIPE_${planKey}_MONTHLY`;
}