// scripts/run-expiration-manual.js
// Manual/local fallback script.
// Production expiration is handled by Supabase pg_cron:
// CALL public.expire_old_memberships();
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { getNowUtcIso } from "../lib/utils/dateTime.js";

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Missing Supabase environment variables. Check .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const runExpirationProcedure = async () => {
  const startedAt = getNowUtcIso();

  console.log("🔄 Running membership expiration procedure...");
  console.log("Started at:", startedAt);

  const { error } = await supabase.rpc("run_expire_old_memberships");

  if (error) {
    console.error("❌ Failed to run expiration procedure:", error);
    process.exit(1);
  }

  console.log("🎯 Expiration procedure completed.");
  console.log("Completed at:", getNowUtcIso());

  process.exit(0);
};

runExpirationProcedure().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});