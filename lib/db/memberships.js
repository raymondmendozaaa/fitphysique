import { getNowUtcIso, toValidDate } from "@/lib/utils/dateTime";

export const MEMBERSHIP_SELECT = `
  id,
  user_id,
  plan_duration_id,
  status,
  start_date,
  expires_at,
  grace_ends_at,
  expired_on,
  contract_end_date,
  next_payment_date,
  auto_renewal_enabled,
  renew_at_discounted_rate,
  household_id,
  pif_end_action,
  pif_end_choice_set_at,
  stripe_subscription_id,
  stripe_payment_intent,
  stripe_session_id,
  location_id,
  payment_id,
  renewal_pending,
  renewal_attempt_count,
  last_renewal_attempt,
  pass_source,
  paid_in_full,
  contract_signature_id
`;

export const ACCESS_ELIGIBLE_MEMBERSHIP_STATUSES = [
  "active",
  "past_due",
  "cancelled",
];

export const MEMBERSHIP_GRACE_DAYS = 3;

export function isMembershipAccessEligible(
  membership,
  now = toValidDate(getNowUtcIso())
) {
  if (!membership) return false;

  const status = String(membership.status || "").toLowerCase();

  if (!ACCESS_ELIGIBLE_MEMBERSHIP_STATUSES.includes(status)) {
    return false;
  }

  const expiresAt = toValidDate(membership.expires_at);
  const nowDate = toValidDate(now);

  if (!expiresAt || !nowDate) return false;

  const storedGraceEndsAt = toValidDate(membership.grace_ends_at);

  const graceEndsAt =
    storedGraceEndsAt ||
    new Date(
      expiresAt.getTime() + MEMBERSHIP_GRACE_DAYS * 24 * 60 * 60 * 1000
    );
  
  return graceEndsAt.getTime() > nowDate.getTime();
}

export async function fetchLatestMembership(supabase, user_id) {
  if (!user_id) return null;

  const { data, error } = await supabase
    .from("memberships")
    .select(MEMBERSHIP_SELECT)
    .eq("user_id", user_id)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function fetchMembershipsForUser(supabase, user_id) {
  if (!user_id) return [];

  const { data, error } = await supabase
    .from("memberships")
    .select(MEMBERSHIP_SELECT)
    .eq("user_id", user_id)
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchActiveMembershipForUser(supabase, user_id) {
  if (!user_id) return null;

  const { data, error } = await supabase
    .from("memberships")
    .select(MEMBERSHIP_SELECT)
    .eq("user_id", user_id)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function fetchMembershipById(supabase, membership_id) {
  if (!membership_id) return null;

  const { data, error } = await supabase
    .from("memberships")
    .select(MEMBERSHIP_SELECT)
    .eq("id", membership_id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function fetchMembershipByStripeSubscriptionId(supabase, stripe_subscription_id) {
  if (!stripe_subscription_id) return null;

  const { data, error } = await supabase
    .from("memberships")
    .select(MEMBERSHIP_SELECT)
    .eq("stripe_subscription_id", stripe_subscription_id)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function fetchMembershipByUserAndSubscription(supabase, user_id, stripe_subscription_id) {
  if (!user_id || !stripe_subscription_id) return null;

  const { data, error } = await supabase
    .from("memberships")
    .select(MEMBERSHIP_SELECT)
    .eq("user_id", user_id)
    .eq("stripe_subscription_id", stripe_subscription_id)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function fetchMembershipsByPlanDuration(supabase, user_id, plan_duration_id) {
  if (!user_id || !plan_duration_id) return [];

  const { data, error } = await supabase
    .from("memberships")
    .select(MEMBERSHIP_SELECT)
    .eq("user_id", user_id)
    .eq("plan_duration_id", plan_duration_id)
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchActiveMembershipByPlanDuration(supabase, user_id, plan_duration_id) {
  if (!user_id || !plan_duration_id) return null;

  const { data, error } = await supabase
    .from("memberships")
    .select(MEMBERSHIP_SELECT)
    .eq("user_id", user_id)
    .eq("plan_duration_id", plan_duration_id)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function fetchLatestMembershipByUserAndPlanDuration(supabase, user_id, plan_duration_id) {
  if (!user_id || !plan_duration_id) return null;

  const { data, error } = await supabase
    .from("memberships")
    .select(MEMBERSHIP_SELECT)
    .eq("user_id", user_id)
    .eq("plan_duration_id", plan_duration_id)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function updateMembershipById(supabase, membership_id, updates) {
  if (!membership_id) return null;

  const { data, error } = await supabase
    .from("memberships")
    .update(updates)
    .eq("id", membership_id)
    .select(MEMBERSHIP_SELECT)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function updateMembershipByUserAndSubscription(
  supabase,
  user_id,
  stripe_subscription_id,
  updates
) {
  if (!user_id || !stripe_subscription_id) return null;

  const { data, error } = await supabase
    .from("memberships")
    .update(updates)
    .eq("user_id", user_id)
    .eq("stripe_subscription_id", stripe_subscription_id)
    .select(MEMBERSHIP_SELECT);

  if (error) throw error;
  return data || [];
}

export async function updateMembershipByUserAndPlanDuration(
  supabase,
  user_id,
  plan_duration_id,
  updates
) {
  if (!user_id || !plan_duration_id) return null;

  const { data, error } = await supabase
    .from("memberships")
    .update(updates)
    .eq("user_id", user_id)
    .eq("plan_duration_id", plan_duration_id)
    .select(MEMBERSHIP_SELECT);

  if (error) throw error;
  return data || [];
}

export async function upsertMembershipForUser(supabase, payload) {
  if (!payload?.user_id) throw new Error("upsertMembershipForUser requires payload.user_id");

  const { error } = await supabase
    .from("memberships")
    .upsert(payload, { onConflict: "user_id" });

  if (error) throw error;

  return fetchLatestMembership(supabase, payload.user_id);
}

export async function updateActiveMembershipsByHouseholdId(supabase, household_id, updates) {
  if (!household_id) return [];

  const { data, error } = await supabase
    .from("memberships")
    .update(updates)
    .eq("household_id", household_id)
    .eq("status", "active")
    .select(MEMBERSHIP_SELECT);

  if (error) throw error;
  return data || [];
}

export async function fetchAccessEligibleMembershipForUser(
  supabase,
  user_id,
  now = toValidDate(getNowUtcIso())
) {
  if (!user_id) return null;

  const { data, error } = await supabase
    .from("memberships")
    .select(MEMBERSHIP_SELECT)
    .eq("user_id", user_id)
    .in("status", ACCESS_ELIGIBLE_MEMBERSHIP_STATUSES)
    .order("start_date", { ascending: false })
    .limit(5);

  if (error) throw error;

  return (
    (data || []).find((membership) =>
      isMembershipAccessEligible(membership, now)
    ) || null
  );
}

export async function updateMembershipByUserId(supabase, user_id, updates) {
  if (!user_id) return [];

  const { data, error } = await supabase
    .from("memberships")
    .update(updates)
    .eq("user_id", user_id)
    .select(MEMBERSHIP_SELECT);

  if (error) throw error;
  return data || [];
}

export async function fetchPastDueAutoRenewMemberships(supabase) {
  const { data, error } = await supabase
    .from("memberships")
    .select(MEMBERSHIP_SELECT)
    .eq("auto_renewal_enabled", true)
    .in("status", ["past_due"])
    .not("stripe_subscription_id", "is", null);

  if (error) throw error;
  return data || [];
}