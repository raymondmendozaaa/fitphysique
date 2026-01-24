import { supabase } from "@/lib/supabaseClient";

// ✅ Convert to Local Time (America/Chicago)
function toLocalISOString(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString();
}

export async function logGuestPassEvent({
  userId,
  guest_pass_id,
  eventType,
  locationId = null,
  expiresAt,
  notes = null,
  description = null,
  pass_source = null,
  payment_id = null,
}) {
  if (!userId || !eventType || !expiresAt || !guest_pass_id) {
    console.error("❌ Missing required guest pass log data. Provided:", {
      userId,
      guest_pass_id,
      eventType,
      expiresAt,
    });
    return;
  }

  // ✅ Convert to consistent local ISO format
  const nowUTC = new Date();
  const localNow = toLocalISOString(nowUTC);

  // ✅ Ensure expiresAt is always set to 23:59:59.999 (local time)
  const expiresAtDate = new Date(expiresAt);
  expiresAtDate.setHours(0, 0, 0, 0);
  const localExpiresAt = toLocalISOString(expiresAtDate);

  const { error } = await supabase.from("guest_passes_logs").insert({
    user_id: userId,
    guest_pass_id,
    event_type: eventType,
    location_id: locationId,
    expires_at: localExpiresAt,
    notes,
    description,
    pass_source,
    payment_id,
    logged_at: localNow,
  });

  if (error) {
    console.error("❌ Failed to log guest pass event:", {
      error: error.message,
      userId,
      guest_pass_id,
      eventType,
    });
  } else {
    console.log(`✅ Logged guest pass event: ${eventType} for user ${userId} | Guest Pass ID: ${guest_pass_id}`);
  }
}