import { supabase } from "@/lib/supabaseClient";
import toast from "react-hot-toast";

const updateUserAndMembership = async ({ userId, profileUrl, planDurationId }) => {
  const { error: updateUserError } = await supabase
    .from("users")
    .update({ profile_url: profileUrl, onboarded: true })
    .eq("id", userId);

  if (updateUserError) {
    toast.error("User profile update failed.");
    throw new Error("User update failed");
  }

  const { error: membershipError } = await supabase
    .from("memberships")
    .update({ 
      plan_duration_id: planDurationId,
      inactive_since: null,
     })
    .eq("user_id", userId);

  if (membershipError) {
    toast.error("Membership update failed.");
    throw new Error("Membership update failed");
  }
};

export default updateUserAndMembership;