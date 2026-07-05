import { supabase } from "@/lib/supabaseClient";
import { getNowUtcIso, toUtcIso } from "@/lib/utils/dateTime";

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

  const { error } = await supabase.from("guest_passes_logs").insert({
    user_id: userId,
    guest_pass_id,
    event_type: eventType,
    location_id: locationId,
    expires_at: toUtcIso(expiresAt),
    notes,
    description,
    pass_source,
    payment_id,
    logged_at: getNowUtcIso(),
  });

  if (error) {
    console.error("❌ Failed to log guest pass event:", {
      error: error.message,
      userId,
      guest_pass_id,
      eventType,
    });
  } else {
    console.log(
      `✅ Logged guest pass event: ${eventType} for user ${userId} | Guest Pass ID: ${guest_pass_id}`
    );
  }
}