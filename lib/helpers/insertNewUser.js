import { supabase } from "@/lib/supabaseClient";

export async function insertNewUser({ id, email, full_name, role = "member", onboarded = false }) {
  const { error } = await supabase.from("users").insert([
    {
      id,
      email,
      full_name,
      role,
      onboarded,
    },
  ]);

  if (error) {
    throw new Error(`Failed to save user info: ${error.message}`);
  }
}
