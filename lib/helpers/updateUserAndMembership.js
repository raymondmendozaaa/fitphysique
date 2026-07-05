import { supabase } from "@/lib/supabaseClient";
import toast from "react-hot-toast";
import { updateUserByIdClient } from "@/lib/queries/users.client";
import { updateMembershipByUserId } from "@/lib/db/memberships";
import { fetchPlanDurationById } from "@/lib/db/planDurations";

const updateUserAndMembership = async ({ userId, profileUrl, planDurationId, autoRenewalEnabled = true, renewAtDiscountedRate = false }) => {
  // 1️⃣ Update user profile
  try {
    await updateUserByIdClient(userId, { profile_url: profileUrl });
  } catch (updateUserError) {
    toast.error("User profile update failed.");
    throw new Error("User update failed");
  }

  // 2️⃣ Fetch plan info to determine if it's paid in full
  let planData = null;

  try {
    planData = await fetchPlanDurationById(supabase, planDurationId);
  } catch (planError) {
    toast.error("Invalid plan selection.");
    throw new Error("Plan validation failed.");
  }

  if (!planData) {
    toast.error("Invalid plan selection.");
    throw new Error("Plan validation failed.");
  }

  // ✅ Automatically detect if the plan is Paid-in-Full
  const isPaidInFull = planData.duration_label.toLowerCase().includes("paid in full");

  // 3️⃣ Always update membership with new settings
  try {
    await updateMembershipByUserId(supabase, userId, {
      plan_duration_id: planDurationId,
      inactive_since: null,
      auto_renewal_enabled: autoRenewalEnabled,
      renew_at_discounted_rate: isPaidInFull ? renewAtDiscountedRate : false,
      paid_in_full: isPaidInFull,
    });
  } catch (membershipError) {
    toast.error("Membership update failed.");
    throw new Error("Membership update failed");
  }
};

export default updateUserAndMembership;