import { supabase } from "@/lib/supabaseClient";
import { getPlanInfoById } from "@/lib/helpers/planUtils";
import { computeMembershipExpiry } from "@/lib/time/expiry";
import { logPayment } from "@/lib/helpers/logPayment";
import { logMembershipEvent } from "@/lib/helpers/logMembershipEvent";

const BASE_URL = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;

export async function createMembershipUniversal(input) {
  const {
    userId,
    planDurationId,
    paidInFull = false,
    autoRenewalEnabled = true,
    renewAtDiscountedRate = false,
    isRenewal = false,
    startDate = new Date().toISOString(),
    locationId = null,
    paymentMode,                       // "checkout" | "comped"
    offlinePayment = null,             // { method:'cash'|'check'|'comp', amount, notes }
    contract = {},                     // { required,id,version,signature,agreed }
    createdBy = { role: "admin", id:null },  
    source = "admin",
    idempotencyKey = null,
  } = input || {};

  if (!paymentMode || !["checkout", "comped"].includes(paymentMode)) {
    throw new Error('paymentMode is required and must be "checkout" or "comped"');
  }

  const planInfo = await getPlanInfoById(planDurationId);
  const { plan_name, duration_label, duration_in_months } = planInfo || {};
  if (!plan_name || !duration_label) throw new Error("Invalid plan info");

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
        paid_in_full: !!paidInFull,
        auto_renewal_enabled: !!autoRenewalEnabled,
        renew_at_discounted_rate: !!renewAtDiscountedRate,
        is_renewal: !!isRenewal,
        signature: contract?.signature ?? "",
        agreed: contract?.agreed ? "true" : "false",
        contract_id: contract?.id ?? null,
        contract_version: contract?.version ?? null,
        location_id: locationId,
        start_date: (startDate || new Date().toISOString()).slice(0,10),
        checkout_behavior: input?.checkoutBehavior || "bill_today_start_today",
      }),
    });
    if (!res.ok) throw new Error(`Failed to create Stripe session (admin): ${await res.text().catch(()=> "")}`);
    const { url } = await res.json();
    return { ok: true, mode: "checkout", checkoutUrl: url };
  }

  // B) Offline path (cash/check/comp) → direct DB writes
  if (!offlinePayment?.method) throw new Error("offlinePayment.method required for comped path");
  if ((offlinePayment.method === "cash" || offlinePayment.method === "check") && !(offlinePayment.amount > 0)) {
    throw new Error("Amount required for cash/check and must be > 0");
  }
  if (offlinePayment.method === "comp" && offlinePayment.amount == null) offlinePayment.amount = 0;

  const expiresAt = computeMembershipExpiry({ 
    startDate, 
    months: duration_in_months,
    durationLabel: duration_label,
  });

  // Upsert membership (by user_id)
  const upsert = {
    user_id: userId,
    plan_duration_id: planDurationId,
    status: "active",
    auto_renewal_enabled: !!autoRenewalEnabled,
    paid_in_full: !!paidInFull,
    renew_at_discounted_rate: !!renewAtDiscountedRate,
    is_renewal: !!isRenewal,
    expires_at: expiresAt.toISOString(),
    location_id: locationId,
    pass_source: source,
  };
  const { data: rows, error: mErr } = await supabase
    .from("memberships")
    .upsert(upsert, { onConflict: "user_id" })
    .select("id, expires_at")
    .eq("user_id", userId);

  if (mErr || !rows || !rows[0]) throw new Error(`Failed to upsert membership: ${mErr?.message || "unknown"}`);
  const membershipId = rows[0].id;

  // Payment record (succeeded)
  const now = new Date().toISOString();
  const paymentId = await logPayment({
    user_id: userId,
    amount: Number(offlinePayment.amount || 0),
    method: offlinePayment.method,           // 'cash'|'check'|'comp'
    status: "succeeded",
    payment_date: now,
    stripe_session_id: null,
    stripe_payment_intent: null,
    stripe_subscription_id: null,
    invoice_id: null,
    source,
    notes: offlinePayment.notes || null,
    membership_id: membershipId,
    guest_pass_id: null,
  });

  // Membership log
  await logMembershipEvent({
    userId,
    eventType: isRenewal ? "admin_renew_membership" : "admin_create_membership",
    plan: plan_name,
    durationLabel: duration_label,
    contractEndDate: expiresAt,
    nextPaymentDate: null,
    expiresAt,
    expiredOn: null,
    cancelledOn: null,
    stripe_subscription_id: null,
    stripe_payment_intent: null,
    pass_source: source,
    description: `${(offlinePayment.method || "").toUpperCase()} by ${source}${createdBy?.role ? ` (${createdBy.role})` : ""}`,
    locationId,
    payment_id: paymentId || null,
    paid_in_full: !!paidInFull,
    auto_renewal_enabled: !!autoRenewalEnabled,
    renew_at_discounted_rate: !!renewAtDiscountedRate,
    renewal_pending: false,
  });

  return { ok: true, mode: "comped", membershipId, status: "active", expiresAt: expiresAt.toISOString() };
}