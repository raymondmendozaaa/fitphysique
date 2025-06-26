import { supabase } from "@/lib/supabaseClient";

export async function getPlanInfoById(planDurationId) {
  console.log("🔍 Fetching plan info for ID:", planDurationId);

  const { data, error } = await supabase
    .from("plan_durations")
    .select("plan_name, duration_label, paid_in_full_price")
    .eq("id", planDurationId)
    .single();

  if (error || !data) {
    console.error("❌ Error fetching plan info:", error?.message || "No data found");
    throw new Error("Failed to fetch plan info");
  }

  console.log("✅ Plan Info Retrieved:", data);

  return {
    plan_name: data.plan_name,
    duration_label: data.duration_label,
    paid_in_full_price: data.paid_in_full_price || null,
  };
}