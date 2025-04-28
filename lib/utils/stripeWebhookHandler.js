import { supabase } from "@/lib/supabaseClient";

export async function handleStripeEvent(event) {
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const userId = session.metadata?.user_id;
      const planDurationId = session.metadata?.plan_duration_id;

      if (!userId || !planDurationId) {
        console.error("Missing user_id or plan_duration_id in session metadata");
        return { status: 400, message: "Missing metadata" };
      }

      // Retrieve user from Supabase
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (userError || !userData) {
        console.error("User not found:", userError?.message || "No user found");
        return { status: 404, message: "User not found" };
      }

      const now = new Date();
      const { data: durationData, error: durationError } = await supabase
        .from("plan_durations")
        .select("duration_in_days, duration_in_months") // ✅ add this
        .eq("id", planDurationId)
        .single();

      if (durationError || (!durationData?.duration_in_days && !durationData?.duration_in_months)) {
        console.error("Duration data not found:", durationError?.message || "Missing duration");
        return { status: 400, message: "Invalid plan_duration_id" };
      }

      let expiresAt = new Date(now);

      if (durationData.duration_in_months) {
        expiresAt.setMonth(expiresAt.getMonth() + durationData.duration_in_months);
      } else if (durationData.duration_in_days) {
        expiresAt.setDate(expiresAt.getDate() + durationData.duration_in_days);
      } else {
        console.error("❌ No valid duration found (months or days).");
        return { status: 400, message: "Invalid duration for membership."};
      }


      // Check if membership exists
      const { data: existingMembership, error: membershipCheckError } = await supabase
        .from("memberships")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (membershipCheckError && membershipCheckError.code !== "PGRST116") {
        // PGRST116 = no rows found, safe to insert
        console.error("Error checking existing membership:", membershipCheckError.message);
        return { status: 500, message: "Error checking membership" };
      }

      const newMembershipData = {
        user_id: userId,
        plan_duration_id: planDurationId,
        status: "active",
        start_date: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        expired_on: null,
        pass_source: "stripe",
        is_promotional: false,
        promo_start_date: null,
        promo_end_date: null,
        inactive_since: null,
        trial_type: null,
      };

      if (existingMembership) {
        // Update existing membership
        const { error: updateError } = await supabase
          .from("memberships")
          .update(newMembershipData)
          .eq("user_id", userId);

        if (updateError) {
          console.error("Error updating membership:", updateError.message);
          return { status: 500, message: "Failed to update membership" };
        }
      } else {
        // Insert new membership
        const { error: insertError } = await supabase
          .from("memberships")
          .insert(newMembershipData);

        if (insertError) {
          console.error("Error inserting new membership:", insertError.message);
          return { status: 500, message: "Failed to insert membership" };
        }
      }

      // Mark user as onboarded
      const { error: onboardError } = await supabase
        .from("users")
        .update({ onboarded: true })
        .eq("id", userId);

      if (onboardError) {
        console.error("Failed to update onboarded status:", onboardError.message);
        return { status: 500, message: "Failed to update user onboarded status" };
      }

      return { status: 200, message: "Membership updated successfully" };
    }

    return { status: 200, message: "Unhandled event type" };
  } catch (error) {
    console.error("Stripe webhook error:", error);
    return { status: 500, message: "Internal server error" };
  }
}