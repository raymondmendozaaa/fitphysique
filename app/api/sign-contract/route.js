import { supabase } from "@/lib/supabaseClient";

function toLocalISOString(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString();
}

export async function POST(req) {
  const {
    userId,
    planDurationId,
    contractId,
    signature,
    agreed,
    contractVersion,
    latitude,
    longitude,
    accuracy,
    location_id,
    ipAddress: clientIp,        // ⬅️ 1) Read client IP from request body
  } = await req.json();

  // 🕒 Match the rest of the system's local timestamp formatting
  const createdAt = toLocalISOString(new Date());

  // 🧠 2) Prefer IP sent from client (ipify) → fallback to headers → fallback to unknown
  const finalIp =
    clientIp ||
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    req.ip ||
    "unknown";

  // 🧾 Insert the signature record
  const { data, error } = await supabase.from("contract_signatures").insert([
    {
      user_id: userId,
      plan_duration_id: planDurationId,
      contract_id: contractId,
      signature,
      agreed,
      version: contractVersion,
      latitude,
      longitude,
      gps_accuracy: accuracy ?? null,
      ip_address: finalIp,       // ⬅️ 3) Use improved IP
      location_id,
      created_at: createdAt,
    },
  ]);

  if (error) {
    console.error("❌ Signature insert error:", error);
    return new Response("Failed to save signature", { status: 500 });
  }

  return new Response("Signature saved", { status: 200 });
}