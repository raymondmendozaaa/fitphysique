export async function createStripeSession({
  userId,
  planDurationId,
  requiresContract = false,
  paidInFull = false,
  autoRenewalEnabled = false,
  renewAtDiscountedRate = false,
  typedName = "",            
  agreeChecked = false,     
  contractId = "", 
}) {
  const res = await fetch("/api/create-stripe-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      plan_duration_id: planDurationId,
      requires_contract: requiresContract,
      paid_in_full: paidInFull,
      auto_renewal_enabled: autoRenewalEnabled,
      renew_at_discounted_rate: renewAtDiscountedRate,
      signature: typedName,           
      agreed: agreeChecked ? "true" : "false", 
      contract_id: contractId,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to create Stripe session.");
  }

  const { url } = await res.json();
  return url;
}