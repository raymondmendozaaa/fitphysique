import { supabase } from "@/lib/supabaseClient";
import toast from "react-hot-toast";

const updateUserAndMembership = async ({ userId, profileUrl, planDurationId, autoRenewalEnabled = true, renewAtDiscountedRate = false }) => {
  // 1️⃣ Update user profile
  const { error: updateUserError } = await supabase
    .from("users")
    .update({ profile_url: profileUrl })
    .eq("id", userId);

  if (updateUserError) {
    toast.error("User profile update failed.");
    throw new Error("User update failed");
  }

  // 2️⃣ Fetch plan info to determine if it's paid in full
  const { data: planData, error: planError } = await supabase
    .from("plan_durations")
    .select("id, duration_label")
    .eq("id", planDurationId)
    .maybeSingle();

  if (planError || !planData) {
    toast.error("Invalid plan selection.");
    throw new Error("Plan validation failed.");
  }

  // ✅ Automatically detect if the plan is Paid-in-Full
  const isPaidInFull = planData.duration_label.toLowerCase().includes("paid in full");

  // 3️⃣ Always update membership with new settings
  const { error: membershipError } = await supabase
    .from("memberships")
    .update({
      plan_duration_id: planDurationId,
      inactive_since: null,
      auto_renewal_enabled: autoRenewalEnabled,
      renew_at_discounted_rate: isPaidInFull ? renewAtDiscountedRate : false, // Only applies to paid-in-full
      paid_in_full: isPaidInFull, // ✅ Tracking paid-in-full status
    })
    .eq("user_id", userId);

  if (membershipError) {
    toast.error("Membership update failed.");
    throw new Error("Membership update failed");
  }
};

export default updateUserAndMembership;