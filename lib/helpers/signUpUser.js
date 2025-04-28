import { supabase } from "@/lib/supabaseClient";

export async function signUpUser({ email, password }) {
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    throw new Error(error.message);
  }

  const user = data.user;
  if (!user) {
    throw new Error("User registration failed. Try again.");
  }

  return user;
}