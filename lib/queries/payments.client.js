// lib/queries/payments.client.js
import { supabase } from "@/lib/supabaseClient";

export async function fetchPaymentsForUserClient(userId) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .order("payment_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchLatestPaymentForUserClient(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .order("payment_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}