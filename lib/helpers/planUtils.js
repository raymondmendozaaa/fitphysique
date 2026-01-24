// lib/helpers/planUtils.server.js (recommended new file)
export async function getPlanInfoByIdServer(supabase, planDurationId) {
  const { data, error } = await supabase
    .from("plan_durations")
    .select("plan_name, duration_label, requires_contract, duration_in_months, duration_in_days, paid_in_full_price")
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
    paid_in_full_price: data.paid_in_full_price ?? null,
  };
}