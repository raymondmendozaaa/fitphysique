export const PLAN_DURATION_SELECT = `
  id,
  plan_name,
  duration_label,
  requires_contract,
  duration_in_days,
  is_promotional,
  duration_in_months
`;

export async function fetchPlanDurationById(supabase, planDurationId) {
  if (!planDurationId) return null;

  const { data, error } = await supabase
    .from("plan_durations")
    .select(PLAN_DURATION_SELECT)
    .eq("id", planDurationId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function fetchPlanDurationsByPlanName(supabase, planName) {
  if (!planName) return [];

  const { data, error } = await supabase
    .from("plan_durations")
    .select(PLAN_DURATION_SELECT)
    .eq("plan_name", planName)
    .order("duration_in_months", { ascending: true, nullsFirst: false })
    .order("duration_in_days", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data || [];
}

export async function fetchAllPlanDurations(supabase) {
  const { data, error } = await supabase
    .from("plan_durations")
    .select(PLAN_DURATION_SELECT)
    .order("plan_name", { ascending: true })
    .order("duration_in_months", { ascending: true, nullsFirst: false })
    .order("duration_in_days", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data || [];
}