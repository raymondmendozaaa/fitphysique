import { supabase } from "@/lib/supabaseClient";

export async function handleMembershipChange({ userId, selectedPlan, contractLength }) {
  if (!userId || !selectedPlan || !contractLength) {
    return { success: false, message: "Missing required fields." };
  }

  try {
    // 🔍 Get Stripe Price ID
    const { data: priceData, error: priceError } = await supabase
      .from("pricing")
      .select("stripe_price_id")
      .eq("plan", selectedPlan)
      .eq("contract_length", contractLength)
      .single();

    if (priceError || !priceData) {
      console.error("❌ Pricing table mismatch:", priceError);
      return { success: false, message: "Invalid membership selection." };
    }

    const stripe_price_id = priceData.stripe_price_id;

    // 🔍 Find matching plan_durations row
    const { data: planDuration, error: durationError } = await supabase
      .from("plan_durations")
      .select("id")
      .eq("plan_name", selectedPlan)
      .eq("duration_label", contractLength)
      .single();

    if (durationError || !planDuration) {
      console.error("❌ Plan duration mismatch:", durationError);
      return { success: false, message: "Plan duration not found." };
    }

    const plan_duration_id = planDuration.id;

    // 🔁 Call membership-checkout API route
    const response = await fetch("/api/membership-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        price_id: stripe_price_id,
        plan: selectedPlan,
        contract_length: contractLength,
        plan_duration_id,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.sessionId) {
      return { success: false, message: result.error || "Failed to create Stripe session." };
    }

    return {
      success: true,
      sessionId: result.sessionId,
    };
  } catch (err) {
    console.error("❌ Membership change error:", err);
    return { success: false, message: "Unexpected error occurred." };
  }
}