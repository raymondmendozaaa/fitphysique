import { getNowUtcIso, toValidDate } from "@/lib/utils/dateTime";

export function isPIFPlanDuration(planDurationRow) {
  if (!planDurationRow) return false;

  const label = (planDurationRow.duration_label || "").toLowerCase();
  const name = (planDurationRow.plan_name || "").toLowerCase();

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

  const nowDate = toValidDate(getNowUtcIso());
  const expiresAtDate = toValidDate(membership.expires_at);

  if (!nowDate || !expiresAtDate) return false;

  const diffMs = expiresAtDate.getTime() - nowDate.getTime();

  if (diffMs < 0) return false;

  const dayLimit = Number(days);

  if (!Number.isFinite(dayLimit) || dayLimit < 0) return false;
  
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  
  return diffDays <= dayLimit;
}