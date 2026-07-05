import { supabase } from "@/lib/supabaseClient";

export async function fetchAllPlanDurationsClient() {
  const { data, error } = await supabase
    .from("plan_durations")
    .select(`
      id,
      plan_name,
      duration_label,
      requires_contract,
      duration_in_days,
      duration_in_months,
      is_promotional,
      is_paid_in_full
    `)
    .order("plan_name", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function fetchPlanDurationByIdClient(planDurationId) {
  if (!planDurationId) return null;

  const { data, error } = await supabase
    .from("plan_durations")
    .select(`
      id,
      plan_name,
      duration_label,
      requires_contract,
      duration_in_days,
      duration_in_months,
      is_promotional,
      is_paid_in_full
    `)
    .eq("id", planDurationId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}