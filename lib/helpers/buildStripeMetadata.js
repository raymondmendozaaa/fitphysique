export function buildStripeMetadata({
  user_id,
  plan_duration_id,
  requires_contract,
  paid_in_full,
  auto_renewal_enabled,
  renew_at_discounted_rate,
  signature,
  agreed,
  contract_id,
}) {
  return {
    user_id,
    plan_duration_id,
    requires_contract: requires_contract.toString(),
    paid_in_full: paid_in_full.toString(),
    auto_renewal_enabled: auto_renewal_enabled.toString(),
    renew_at_discounted_rate: renew_at_discounted_rate.toString(),
    signature,
    agreed,
    contract_id,
  };
}