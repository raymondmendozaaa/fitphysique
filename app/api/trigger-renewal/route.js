// app/api/trigger-renewal/route.js
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createStripeSession } from "@/lib/helpers/stripeUtils";

export async function POST(req) {
  const authHeader = req.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.INTERNAL_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const threeDaysFromNow = new Date(today);
  threeDaysFromNow.setDate(today.getDate() + 3);

  // Fetch eligible memberships
  const { data: memberships, error } = await supabaseAdmin
    .from("memberships")
    .select(
      "user_id, plan_duration_id, expires_at, renewal_pending, renewal_attempt_count, paid_in_full, renew_at_discounted_rate"
    )
    .eq("auto_renewal_enabled", true)
    .eq("status", "active");

  if (error) {
    console.error("❌ Failed to fetch memberships:", error.message);
    return Response.json({ error: "Fetch failed" }, { status: 500 });
  }

  for (const member of memberships) {
    const {
      user_id,
      plan_duration_id,
      expires_at,
      renewal_pending,
      renewal_attempt_count = 0,
    } = member;

    // Skip if renewal already succeeded or retry limit reached
    if (renewal_pending || renewal_attempt_count >= 3) continue;

    // Skip if expires_at is not within 3 days
    const expiresDate = new Date(expires_at);
    if (expiresDate > threeDaysFromNow) continue;

    // Optional: check onboarded status
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("onboarded")
      .eq("id", user_id)
      .maybeSingle();

    if (!user?.onboarded) continue;

    try {
      console.log(`🌀 Attempting auto-renewal for ${user_id} (Attempt #${renewal_attempt_count + 1})`);

      // 🔁 Create Stripe Checkout session
      await createStripeSession({
        user_id,
        plan_duration_id,
        auto_renewal_enabled: true,
        renew_at_discounted_rate: member.renew_at_discounted_rate || false,
        paid_in_full: member.paid_in_full || false,
        isRenewal: true,
      });

      // Update attempt count + timestamp
      await supabaseAdmin
        .from("memberships")
        .update({
          renewal_attempt_count: renewal_attempt_count + 1,
          last_renewal_attempt: new Date().toISOString(),
          renewal_pending: true,
        })
        .eq("user_id", user_id)
        .eq("plan_duration_id", plan_duration_id);

    } catch (err) {
      console.error(`❌ Failed for ${user_id}:`, err.message);
    }
  }

  return Response.json({ message: "Auto-renewals processed" });
}