import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { fetchPlanDurationById } from "@/lib/db/planDurations";
import { computeMembershipExpiry } from "@/lib/time/expiry";
import { logPayment } from "@/lib/helpers/logPayment";
import { logMembershipEvent } from "@/lib/helpers/logMembershipEvent";
import { MEMBERSHIP_GRACE_DAYS, upsertMembershipForUser } from "@/lib/db/memberships";
import { 
  getNowUtcIso, 
  toUtcIso, 
  getDateInputFromValue, 
  addDaysToUtcIso, 
} from "@/lib/utils/dateTime";

const BASE_URL = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;

export async function createMembershipUniversal(input) {
  const {
    userId,
    planDurationId,
    autoRenewalEnabled = true,
    renewAtDiscountedRate = false,
    isRenewal = false,
    startDate = getNowUtcIso(),
    locationId = null,
    paymentMode,                       // "checkout" | "direct" | "comped"
    offlinePayment = null,             // { method:'cash'|'card'|'comped', amount, notes }
    contract = {},                     // { required,id,version,signature,agreed }
    createdBy = { role: "admin", id:null },  
    source = "admin",
    idempotencyKey = null,
  } = input || {};

  if (!paymentMode || !["checkout", "direct", "comped"].includes(paymentMode)) {
    throw new Error('paymentMode is required and must be "checkout", "direct", or "comped"');
  }

  if (!userId) {
    throw new Error("userId is required");
  }

  if (!planDurationId) {
    throw new Error("planDurationId is required");
  }

  const planInfo = await fetchPlanDurationById(supabase, planDurationId);
  const {
    plan_name,
    duration_label,
    duration_in_months,
    requires_contract,
    is_paid_in_full,
  } = planInfo || {};

  if (!plan_name || !duration_label) throw new Error("Invalid plan info");

  const resolvedPaidInFull = !!is_paid_in_full;
  const resolvedRenewAtDiscountedRate =
    resolvedPaidInFull && !!autoRenewalEnabled
      ? !!renewAtDiscountedRate
      : false;

  const normalizedStartDate = toUtcIso(startDate) || getNowUtcIso();
  const nowIso = getNowUtcIso();
  const startDateInput = getDateInputFromValue(normalizedStartDate);

  // A) Stripe Checkout path (re-uses your existing route & webhooks)
  if (paymentMode === "checkout") {
    if (!BASE_URL) throw new Error("Base URL not configured");
    const res = await fetch(`${BASE_URL}/api/create-stripe-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}) },
      body: JSON.stringify({
        user_id: userId,
        plan_duration_id: planDurationId,
        requires_contract: !!contract?.required,
        paid_in_full: resolvedPaidInFull,
        auto_renewal_enabled: !!autoRenewalEnabled,
        renew_at_discounted_rate: resolvedRenewAtDiscountedRate,
        is_renewal: !!isRenewal,
        signature: contract?.signature ?? "",
        agreed: contract?.agreed ? "true" : "false",
        contract_id: contract?.id ?? null,
        contract_version: contract?.version ?? null,
        location_id: locationId,
        start_date: startDateInput,
        checkout_behavior: input?.checkoutBehavior || "bill_today_start_today",
      }),
    });
    if (!res.ok) throw new Error(`Failed to create Stripe session (admin): ${await res.text().catch(()=> "")}`);
    const { url } = await res.json();
    return { ok: true, mode: "checkout", checkoutUrl: url };
  }

  // B) Direct server-side membership creation path (offline/manual/admin-managed)
  const isComped = paymentMode === "comped";
  const isDirect = paymentMode === "direct";

  const offlineMethod = isComped
    ? "comped"
    : offlinePayment?.method ?? null;

  if (isDirect && !offlineMethod) {
    throw new Error('offlinePayment.method is required when paymentMode is "direct"');
  }

  const allowedOfflineMethods = new Set(["cash", "card", "comped"]);
  if (isDirect && !allowedOfflineMethods.has(offlineMethod)) {
    throw new Error('offlinePayment.method must be "cash", "card", or "comped"');
  }

  if (!(Number(offlinePayment?.amount ?? 0) >= 0)) {
    throw new Error("offlinePayment.amount must be 0 or greater");
  }

  let contractEndDate = null;
  let expiresAt = null;
  
  if (duration_in_months) {
    expiresAt = computeMembershipExpiry({
      startDate: normalizedStartDate,
      months: duration_in_months,
      durationLabel: duration_label,
    });
  } else {
    throw new Error(
      "createMembershipUniversal only supports month-based memberships. Use the guest pass flow for day-based plans."
    );
  }
  
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
    throw new Error("Failed to compute membership expiration date");
  }
  
  const expiresAtIso = expiresAt.toISOString();
  const graceEndsAt = addDaysToUtcIso(expiresAtIso, MEMBERSHIP_GRACE_DAYS);
  
  if (!graceEndsAt) {
    throw new Error("Failed to compute membership grace end date");
  }
  
  contractEndDate = requires_contract ? expiresAtIso : null;

  const membershipPayload = {
    user_id: userId,
    plan_duration_id: planDurationId,
    status: "active",
    start_date: normalizedStartDate,
    contract_end_date: contractEndDate,
    next_payment_date: null,
    expires_at: expiresAtIso,
    grace_ends_at: graceEndsAt,
    expired_on: null,
    cancelled_on: null,
    cancelled_by_user_id: null,
    cancelled_by_role: null,
    cancel_reason: null,
    suspended_until: null,
    banned_by_admin_id: null,
    auto_renewal_enabled: !!autoRenewalEnabled,
    paid_in_full: resolvedPaidInFull,
    renew_at_discounted_rate: resolvedRenewAtDiscountedRate,
    location_id: locationId,
    pass_source: source,
    stripe_session_id: null,
    stripe_payment_intent: null,
    stripe_subscription_id: null,
    payment_id: null,
    renewal_pending: false,
    renewal_attempt_count: 0,
    last_renewal_attempt: null,
    contract_signature_id: null,
  };

  let membershipRow = null;

  try {
    membershipRow = await upsertMembershipForUser(supabase, membershipPayload);
  } catch (membershipErr) {
    throw new Error(`Failed to upsert membership: ${membershipErr?.message || "unknown"}`);
  }

  if (!membershipRow?.id) {
    throw new Error("Failed to upsert membership: missing membership row");
  }

  const membershipId = membershipRow.id;

  // Payment record (server-side direct flow)
  const paymentId = await logPayment(supabase, {
    user_id: userId,
    amount: Number(offlinePayment?.amount ?? 0),
    method: offlineMethod,
    status: "succeeded",
    payment_date: nowIso,
    stripe_session_id: null,
    stripe_payment_intent: null,
    stripe_subscription_id: null,
    invoice_id: null,
    source,
    notes: offlinePayment?.notes || (isComped ? "Comped membership created by admin" : null),
    membership_id: membershipId,
    guest_pass_id: null,
  });

  if (paymentId) {
    await upsertMembershipForUser(supabase, {
      ...membershipPayload,
      payment_id: paymentId,
    });
  }

  // Membership log
  await logMembershipEvent({
    userId,
    eventType: isRenewal ? "admin_renew_membership" : "admin_create_membership",
    plan: plan_name,
    durationLabel: duration_label,
    contractEndDate,
    nextPaymentDate: null,
    expiresAt: expiresAtIso,
    graceEndsAt,
    expiredOn: null,
    cancelledOn: null,
    stripe_subscription_id: null,
    stripe_payment_intent: null,
    pass_source: source,
    description: `${
      isComped ? "COMPED" : (offlineMethod || "").toUpperCase()
    } by ${source}${createdBy?.role ? ` (${createdBy.role})` : ""}`,
    locationId,
    payment_id: paymentId || null,
    paid_in_full: resolvedPaidInFull,
    auto_renewal_enabled: !!autoRenewalEnabled,
    renew_at_discounted_rate: resolvedRenewAtDiscountedRate,
    renewal_pending: false,
  });

  return {
    ok: true,
    mode: paymentMode,
    membershipId,
    status: "active",
    expiresAt: expiresAtIso,
    graceEndsAt,
  };
}