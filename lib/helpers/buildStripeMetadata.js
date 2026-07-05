import { getDateInputFromValue, isValidDateInput } from "@/lib/utils/dateTime";

export function buildStripeMetadata({
  user_id,
  plan_duration_id,
  requires_contract,
  paid_in_full,
  auto_renewal_enabled,
  renew_at_discounted_rate,
  is_renewal,
  // optional debug fields
  stripe_mode,
  price_source,
  // contract fields
  signature,
  agreed,
  contract_id,
  contract_version,
  ip_address,
  location_id,
  gps_accuracy,
  // delayed start controls
  start_date,
  checkout_behavior,
}) {
  const md = {
    user_id: String(user_id),
    plan_duration_id: String(plan_duration_id),
    requires_contract: String(!!requires_contract),
    paid_in_full: String(!!paid_in_full),
    auto_renewal_enabled: String(!!auto_renewal_enabled),
    renew_at_discounted_rate: String(!!renew_at_discounted_rate),
    is_renewal: String(!!is_renewal),
  };

  if (stripe_mode) md.stripe_mode = String(stripe_mode);
  if (price_source) md.price_source = String(price_source).slice(0, 120);

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

  if (start_date) {
    const rawStartDate = String(start_date).trim();

    md.start_date = isValidDateInput(rawStartDate)
      ? rawStartDate
      : getDateInputFromValue(rawStartDate);
  }
  if (checkout_behavior) md.checkout_behavior = String(checkout_behavior);

  return md;
}
