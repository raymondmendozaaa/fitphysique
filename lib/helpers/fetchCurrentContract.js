import { supabase } from "@/lib/supabaseClient";

export async function fetchCurrentContract(userId) {
  if (!userId) throw new Error("User ID is required to fetch contract length");

  const { data, error } = await supabase
    .from("memberships")
    .select("plan_durations(duration_label)")
    .eq("user_id", userId)
    .single();

  if (error) {
    console.error("❌ Error fetching contract length:", error);
    throw new Error("Failed to fetch contract length");
  }

  return data.contract_length || "None";
}
