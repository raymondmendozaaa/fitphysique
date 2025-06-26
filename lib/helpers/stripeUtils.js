export function getStripePriceKey(planName, durationLabel, paidInFull = false) {
  const planKey = planName.toUpperCase().replace(/[\s\-]+/g, "_");

  // 🔁 Normalize durationLabel by replacing "Paid in Full" with "PAID"
  const normalizedDuration = durationLabel
    .replace(/Paid in Full/i, "")
    .toUpperCase()
    .replace(/[\s\-]+/g, "");

  // ✅ Guest Pass handling
  if (planKey === "GUEST_PASS") {
    return `STRIPE_GUEST_PASS_${normalizedDuration}`;
  }

  // ✅ Paid-in-Full key if flagged
  if (paidInFull) {
    return `STRIPE_${planKey}_${normalizedDuration}_PAID`;
  }

  // ✅ Regular key
  return `STRIPE_${planKey}_${normalizedDuration}`;
}
