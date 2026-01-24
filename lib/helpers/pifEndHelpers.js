// lib/helpers/pifEndHelpers.js

export function isPIFPlanDuration(planDurationRow) {
  if (!planDurationRow) return false;
  const label = (planDurationRow.duration_label || "").toLowerCase();
  const name  = (planDurationRow.plan_name || "").toLowerCase();

  // adjust these heuristics to match your actual naming
  return (
    label.includes("paid in full") ||
    label.includes("pif") ||
    name.includes("paid in full") ||
    name.includes("pif")
  );
}

export function isPIFMembership(membership, pdMap) {
  if (!membership?.plan_duration_id) return false;
  const pd = pdMap?.get?.(membership.plan_duration_id);
  if (!pd) return false;
  return isPIFPlanDuration(pd);
}

export function isWithinDaysOfExpiry(membership, days = 30) {
  if (!membership?.expires_at) return false;
  const now = Date.now();
  const end = new Date(membership.expires_at).getTime();
  if (Number.isNaN(end)) return false;

  const diffMs = end - now;
  if (diffMs < 0) return false; // already expired

  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= days;
}