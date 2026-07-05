import { supabase } from "@/lib/supabaseClient";

export async function fetchUserByIdClient(userId, select = "*") {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("users")
    .select(select)
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function fetchUserByEmailClient(email, select = "*") {
  if (!email) return null;

  const { data, error } = await supabase
    .from("users")
    .select(select)
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function updateUserByIdClient(userId, updates) {
  if (!userId) throw new Error("userId is required");
  if (!updates || typeof updates !== "object") {
    throw new Error("updates object is required");
  }

  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", userId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function insertUserClient(userPayload) {
  if (!userPayload || typeof userPayload !== "object") {
    throw new Error("userPayload is required");
  }

  const { data, error } = await supabase
    .from("users")
    .insert([userPayload])
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function upsertUserClient(userPayload, onConflict = "id") {
  if (!userPayload || typeof userPayload !== "object") {
    throw new Error("userPayload is required");
  }

  const { data, error } = await supabase
    .from("users")
    .upsert(userPayload, { onConflict })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}