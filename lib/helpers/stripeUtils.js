export function getStripePriceKey(planName, durationLabel) {
  const planKey = planName.toUpperCase().replace(/[\s\-]+/g, "_");

  if (planKey === "GUEST_PASS") {
    return "STRIPE_GUEST_PASS";
  }

  let durationKey = durationLabel.toUpperCase().replace(/[\s\-]+/g, "");

  // 🔧 Force plural format like "3MONTHS", "6MONTHS", etc.
  if (!durationKey.endsWith("S")) {
    durationKey += "S";
  }

  return `STRIPE_${planKey}_${durationKey}`;
}