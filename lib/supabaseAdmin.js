// lib/supabaseAdmin.js
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  // Helpful at dev time
  console.warn("Missing SUPABASE env for admin client");
}

export const supabaseAdmin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch }, // ensure server fetch gets used
});