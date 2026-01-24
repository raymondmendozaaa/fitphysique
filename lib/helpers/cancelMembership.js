import { supabase } from "@/lib/supabaseClient";
import { logMembershipEvent } from "@/lib/helpers/logMembershipEvent";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ✅ Convert to local ISO time
function toLocalISOString(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString();
}

export async function cancelMembership(userId, {
  cancelledByUserId = null,
  cancelledByRole = null,
  cancellationReason = null
} = {}) {

  const now = new Date();

  // Step 1: Fetch current membership + plan info
  const { data: membership, error } = await supabase
    .from("memberships")
    .select(`
      id,
      expires_at,
      plan_duration_id,
      paid_in_full,
      auto_renewal_enabled,
      stripe_subscription_id,
      plan_durations (plan_name, duration_label)
    `)
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  if (error || !membership) {
    console.error("❌ Failed to fetch membership:", error?.message);
    return { success: false, message: "Membership not found." };
  }

  const calculatedEndDate = membership.expires_at || toLocalISOString(now);

  // ❌ Cancel Stripe subscription if active
  if (membership.stripe_subscription_id) {
    try {
      await stripe.subscriptions.update(membership.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
      console.log("🔁 Stripe subscription set to cancel at period end.");
    } catch (err) {
      console.error("❌ Failed to update Stripe subscription:", err.message);
      return { success: false, message: "Stripe cancellation failed." };
    }
  }

  // ✅ Update Supabase membership
  const { error: updateError } = await supabase
    .from("memberships")
    .update({
      status: "cancelled",
      expires_at: calculatedEndDate,
      cancelled_on: toLocalISOString(now),
      cancelled_by_user_id: cancelledByUserId,
      cancelled_by_role: cancelledByRole,
    })
    .eq("id", membership.id);

  if (updateError) {
    console.error("❌ Failed to cancel membership in Supabase:", updateError.message);
    return { success: false, message: "Failed to cancel locally." };
  }

  // ✅ Log cancellation
  await logMembershipEvent({
    userId,
    eventType: "cancelled",
    plan: membership.plan_durations?.plan_name || "Unknown",
    durationLabel: membership.plan_durations?.duration_label || "Unknown",
    contractEndDate: calculatedEndDate,
    nextPaymentDate: null,
    expiredOn: calculatedEndDate,
    cancelledOn: now,
    notes: cancellationReason || "User cancelled membership",
    paid_in_full: membership.paid_in_full,
    auto_renewal_enabled: membership.auto_renewal_enabled,
    stripe_subscription_id: membership.stripe_subscription_id,
    cancelled_by_user_id: cancelledByUserId,
    cancelled_by_role: cancelledByRole,
    cancellation_reason: cancellationReason,
  });

  return { success: true };
}