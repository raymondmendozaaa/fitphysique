// lib/db/guestPasses.js
import { getNowUtcIso } from "@/lib/utils/dateTime";

export async function fetchGuestPassesForUser(supabase, userId) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from("guest_passes")
    .select("*")
    .eq("user_id", userId)
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchLatestGuestPassForUser(supabase, userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("guest_passes")
    .select("*")
    .eq("user_id", userId)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function fetchActiveGuestPassForUser(
  supabase,
  userId,
  nowIso = getNowUtcIso()
) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("guest_passes")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("expires_at", nowIso)
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function fetchGuestPassById(supabase, guestPassId) {
  if (!guestPassId) return null;

  const { data, error } = await supabase
    .from("guest_passes")
    .select("*")
    .eq("id", guestPassId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function insertGuestPass(supabase, payload) {
  const { data, error } = await supabase
    .from("guest_passes")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function updateGuestPassById(supabase, guestPassId, updates) {
  if (!guestPassId) throw new Error("guestPassId is required");

  const { data, error } = await supabase
    .from("guest_passes")
    .update(updates)
    .eq("id", guestPassId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function upsertGuestPassForUser(supabase, payload) {
  if (!payload?.user_id) {
    throw new Error("payload.user_id is required");
  }

  const existing = await fetchLatestGuestPassForUser(supabase, payload.user_id);

  if (existing?.id) {
    return await updateGuestPassById(supabase, existing.id, payload);
  }

  return await insertGuestPass(supabase, payload);
}

export async function attachPaymentToGuestPass(supabase, guestPassId, paymentId) {
  if (!guestPassId) {
    throw new Error("guestPassId is required");
  }

  if (!paymentId) {
    throw new Error("paymentId is required");
  }

  const { data, error } = await supabase
    .from("guest_passes")
    .update({ payment_id: paymentId })
    .eq("id", guestPassId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}