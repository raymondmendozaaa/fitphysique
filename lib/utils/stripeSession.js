export async function createStripeSession({
  userId,
  planDurationId,
  requiresContract = false,
}) {
  const res = await fetch("/api/create-stripe-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      plan_duration_id: planDurationId,
      requires_contract: requiresContract,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to create Stripe session.");
  }

  const { url } = await res.json();
  return url;
}
