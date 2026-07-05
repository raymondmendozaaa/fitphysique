import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { logMembershipEvent } from "@/lib/helpers/logMembershipEvent";
import Stripe from "stripe";
import { 
  fetchActiveMembershipForUser, 
  fetchLatestMembership,
  updateMembershipById 
} from "@/lib/db/memberships";
import { fetchPlanDurationById } from "@/lib/db/planDurations";
import { getNowUtcIso } from "@/lib/utils/dateTime";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function cancelMembership(
  userId,
  {
    cancelledByUserId = null,
    cancelledByRole = null,
    cancellationReason = null,
  } = {}
) {
  const nowIso = getNowUtcIso();

  let membership = null;

  try {
    membership = await fetchActiveMembershipForUser(supabase, userId);
  } catch (error) {
    console.error("❌ Failed to fetch membership:", error);
    return { success: false, message: "Failed to load membership." };
  }

  if (!membership) {
    let latestMembership = null;
    
    try {
      latestMembership = await fetchLatestMembership(supabase, userId);
    } catch (latestErr) {
      console.warn("⚠️ Failed to fetch latest membership after no active membership:", latestErr);
    }
  
    const latestStatus = String(latestMembership?.status || "").toLowerCase();
  
    if (latestStatus === "cancelled") {
      return {
        success: true,
        alreadyCancelled: true,
        message: "Membership already cancelled.",
      };
    }
  
    return { success: false, message: "Membership not found." };
  }

  let planInfo = null;

  if (membership.plan_duration_id) {
    try {
      planInfo = await fetchPlanDurationById(supabase, membership.plan_duration_id);
    } catch (pdErr) {
      console.warn("⚠️ Failed to fetch plan duration info:", pdErr);
    }
  }

  if (membership.stripe_subscription_id) {
    try {
      await stripe.subscriptions.update(membership.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
      console.log("🔁 Stripe subscription set to cancel at period end.");
    } catch (err) {
      console.error("❌ Failed to update Stripe subscription:", err);
      return { success: false, message: "Stripe cancellation failed." };
    }
  }

  try {
    await updateMembershipById(supabase, membership.id, {
      status: "cancelled",
      auto_renewal_enabled: false,
      renew_at_discounted_rate: false,
      renewal_pending: false,
      next_payment_date: null,
      cancelled_on: nowIso,
      cancelled_by_user_id: cancelledByUserId,
      cancelled_by_role: cancelledByRole,
    });
  } catch (updateError) {
    console.error("❌ Failed to cancel membership in Supabase:", updateError);
    return { success: false, message: "Failed to cancel locally." };
  }

  try {
    await logMembershipEvent({
      userId,
      eventType: "cancelled",
      plan: planInfo?.plan_name || "Unknown",
      durationLabel: planInfo?.duration_label || "Unknown",
      contractEndDate: membership.contract_end_date || null,
      nextPaymentDate: null,
      expiresAt: membership.expires_at || null,
      graceEndsAt: membership.grace_ends_at || null,
      expiredOn: null,
      cancelledOn: nowIso,
      notes: cancellationReason || "User cancelled membership",
      paid_in_full: membership.paid_in_full,
      auto_renewal_enabled: false,
      stripe_subscription_id: membership.stripe_subscription_id,
      cancelled_by_user_id: cancelledByUserId,
      cancelled_by_role: cancelledByRole,
      cancellation_reason: cancellationReason,
    });
  } catch (logError) {
    console.error("❌ Failed to log cancellation:", logError);
    return { success: false, message: "Membership cancelled, but logging failed." };
  }

  return { success: true };
}