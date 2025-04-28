import { supabase } from "@/lib/supabaseClient";

export async function getPlanInfoById(planDurationId) {
    console.log("🔍 planDurationId received in helper:", planDurationId);
  
    const { data, error } = await supabase
      .from("plan_durations")
      .select("plan_name, duration_label")
      .eq("id", planDurationId)
      .single();
  
    if (error || !data) {
      console.error("❌ Supabase error or no data:", error);
      throw new Error("Failed to fetch plan info");
    }
  
    return data;
  }
  