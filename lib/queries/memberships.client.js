import { supabase } from "@/lib/supabaseClient";
import { fetchActiveGuestPassForUserClient } from "@/lib/queries/guestPasses.client";
import { getNowUtcIso, toValidDate } from "@/lib/utils/dateTime";

const CLIENT_MEMBERSHIP_SELECT = `
  id,
  user_id,
  status,
  start_date,
  expires_at,
  grace_ends_at,
  contract_end_date,
  next_payment_date,
  stripe_subscription_id,
  promo_start_date,
  promo_end_date,
  auto_renewal_enabled,
  paid_in_full,
  cancelled_on,
  cancelled_by_user_id,
  cancelled_by_role,
  cancel_reason,
  plan_duration:plan_durations (
    id,
    plan_name,
    duration_label,
    requires_contract,
    is_promotional
  )
`;

const CLIENT_MEMBERSHIP_GRACE_DAYS = 3;

function isMembershipAccessEligible(
  membership,
  now = toValidDate(getNowUtcIso())
) {
  if (!membership) return false;

  const status = String(membership.status || "").toLowerCase();

  if (!["active", "past_due", "cancelled"].includes(status)) {
    return false;
  }

  const expiresAt = toValidDate(membership.expires_at);
  const storedGraceEndsAt = toValidDate(membership.grace_ends_at);
  const nowDate = toValidDate(now);

  if (!expiresAt || !nowDate) return false;

  const fallbackGraceEndsAt = new Date(
    expiresAt.getTime() + CLIENT_MEMBERSHIP_GRACE_DAYS * 24 * 60 * 60 * 1000
  );

  const graceEndsAt = storedGraceEndsAt || fallbackGraceEndsAt;

  return graceEndsAt.getTime() > nowDate.getTime();
}

export async function fetchLatestMembershipClient(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("memberships")
    .select(CLIENT_MEMBERSHIP_SELECT)
    .eq("user_id", userId)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function fetchAccessEligibleMembershipClient(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("memberships")
    .select(CLIENT_MEMBERSHIP_SELECT)
    .eq("user_id", userId)
    .in("status", ["active", "past_due", "cancelled"])
    .order("expires_at", { ascending: false })
    .limit(5);

  if (error) throw error;

  const now = toValidDate(getNowUtcIso());

  return (
    (data || []).find((membership) =>
      isMembershipAccessEligible(membership, now)
    ) || null
  );
}

export async function fetchMembershipPlanSummaryClient(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("memberships")
    .select(`
      start_date,
      plan_duration:plan_durations (
        plan_name,
        duration_label
      )
    `)
    .eq("user_id", userId)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.plan_duration || null;
}

export async function fetchMembershipStripeSummaryClient(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("memberships")
    .select(`
      start_date,
      stripe_subscription_id,
      plan_duration:plan_durations (
        plan_name
      )
    `)
    .eq("user_id", userId)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function fetchMembershipEntitlementClient(userId) {
  if (!userId) {
    return {
      membership: null,
      guestPass: null,
      latestMembership: null,
    };
  }

  const [membershipRes, guestPass] = await Promise.all([
    supabase
      .from("memberships")
      .select(CLIENT_MEMBERSHIP_SELECT)
      .eq("user_id", userId)
      .order("expires_at", { ascending: false })
      .limit(10),
    fetchActiveGuestPassForUserClient(userId),
  ]);

  if (membershipRes.error) throw membershipRes.error;

  const memberships = membershipRes.data || [];
  const latestMembership = memberships[0] || null;
  const now = toValidDate(getNowUtcIso());
  const membership =
    memberships.find((m) => isMembershipAccessEligible(m, now)) || null;

  return {
    membership,
    guestPass: guestPass || null,
    latestMembership,
  };
}