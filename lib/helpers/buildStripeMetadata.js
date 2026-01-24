export function buildStripeMetadata({
  user_id,
  plan_duration_id,
  requires_contract,
  paid_in_full,
  auto_renewal_enabled,
  renew_at_discounted_rate,
  isRenewal,
  signature,
  agreed,
  contract_id,
  contract_version,
  ip_address,
  location_id,
  gps_accuracy,
  start_date,
  checkout_behavior,
  source,
}) {
  const md = {
    user_id: String(user_id),
    plan_duration_id: String(plan_duration_id),
    requires_contract: String(!!requires_contract),
    paid_in_full: String(!!paid_in_full),
    auto_renewal_enabled: String(!!auto_renewal_enabled),
    renew_at_discounted_rate: String(!!renew_at_discounted_rate),
    isRenewal: String(!!isRenewal),
  };

  if (source) md.source = String(source).slice(0, 120);
  if (signature != null) md.signature = String(signature).slice(0, 500);

  if (agreed !== undefined) {
    const agreedBool = agreed === true || agreed === "true";
    md.agreed = String(agreedBool);
  }

  if (contract_id) md.contract_id = String(contract_id);
  if (contract_version != null) md.contract_version = String(contract_version);
  if (ip_address) md.ip_address = String(ip_address);
  if (location_id) md.location_id = String(location_id);
  if (gps_accuracy != null) md.gps_accuracy = String(gps_accuracy);
  if (start_date) md.start_date = String(start_date).slice(0, 10);
  if (checkout_behavior) md.checkout_behavior = String(checkout_behavior);

  return md;
}