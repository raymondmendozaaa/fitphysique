import { createBrowserClient } from "@supabase/ssr";

export async function fetchStripeSubscription(userId) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  

  // Step 1: Get membership info from Supabase
  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("start_date, stripe_subscription_id, plan_durations ( plan_name )")
    .eq("user_id", userId)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    console.error("Failed to fetch membership:", membershipError?.message || "No membership found");
    return null;
  }

  const { stripe_subscription_id, plan_durations } = membership;

  // Step 2: Handle Guest Pass users (no subscription)
  if (plan_durations?.plan_name === "Guest-Pass") {
    console.log("Guest Pass user - no Stripe subscription.");
    return null;
  }

  if (!stripe_subscription_id) {
    console.warn("No Stripe subscription ID found for user.");
    return null;
  }

  // Step 3: Call your API route to get Stripe subscription
  const res = await fetch(`/api/fetch-stripe-subscription?subscription_id=${stripe_subscription_id}`);
  
  if (!res.ok) {
    console.error("Failed to fetch Stripe subscription");
    return null;
  }

  const { subscription } = await res.json();
  return subscription;
}