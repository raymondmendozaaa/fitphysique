// app/api/trigger-renewal/route.js
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createStripeSession } from "@/lib/utils/stripeSession";

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
      paid_in_full,
      renew_at_discounted_rate,
    } = member;

    // Skip if renewal already succeeded or retry limit reached
    if (renewal_pending || renewal_attempt_count >= 3) continue;

    // Skip if not within 3-day window
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

      // 🔁 Create Stripe Checkout session with correct renewal type
      await createStripeSession({
        user_id,
        plan_duration_id,
        auto_renewal_enabled: true,
        renew_at_discounted_rate: !!renew_at_discounted_rate,
        paid_in_full: !!paid_in_full,
        isRenewal: true,
      });

      // Update renewal tracking in DB
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
      console.error(`❌ Failed renewal for ${user_id}:`, err.message);
    }
  }

  return Response.json({ message: "Auto-renewals processed" });
}

export async function GET() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/trigger-renewal`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.INTERNAL_SECRET}`,
    },
  });

  const data = await res.json();
  console.log("🧪 Manual trigger test result:", data);

  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}