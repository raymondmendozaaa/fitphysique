// lib/queries/guestPasses.client.js

import { supabase } from "@/lib/supabaseClient";
import { getNowUtcIso } from "@/lib/utils/dateTime";

export async function fetchGuestPassesForUserClient(userId) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from("guest_passes")
    .select("*")
    .eq("user_id", userId)
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchLatestGuestPassForUserClient(userId) {
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

export async function fetchActiveGuestPassForUserClient(userId) {
  if (!userId) return null;

  const nowIso = getNowUtcIso();

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