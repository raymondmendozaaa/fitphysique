// ✅ Improved fetchCurrentContract
import { supabase } from "@/lib/supabaseClient";

export async function fetchCurrentContract(userId) {
  if (!userId) throw new Error("User ID is required to fetch contract length");

  const { data, error } = await supabase
    .from("memberships")
    .select(`
      plan_durations (plan_name, duration_label)
    `)
    .eq("user_id", userId)
    .single();

  if (error || !data?.plan_durations) {
    console.error("❌ Error fetching contract length:", error);
    throw new Error("Failed to fetch contract length");
  }

  return data.plan_durations.plan_name || "None";
}