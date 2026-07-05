// lib/helpers/planUtils.js
export async function getPlanInfoByIdServer(supabase, planDurationId) {
  const { data, error } = await supabase
    .from("plan_durations")
    .select(`
      plan_name,
      duration_label,
      requires_contract,
      duration_in_months,
      duration_in_days,
      is_paid_in_full
    `)
    .eq("id", planDurationId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to fetch plan info: ${error?.message || "No data found"}`);
  }

  return {
    plan_name: data.plan_name,
    duration_label: data.duration_label,
    requires_contract: data.requires_contract ?? false,
    duration_in_months: data.duration_in_months ?? null,
    duration_in_days: data.duration_in_days ?? null,
    is_paid_in_full: data.is_paid_in_full ?? false,
  };
}