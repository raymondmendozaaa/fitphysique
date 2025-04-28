import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
console.log("🔍 SUPABASE_URL:", process.env.SUPABASE_URL); // Debugging
console.log("🔍 SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY); // Debugging


// ✅ Ensure environment variables are loaded
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Missing Supabase environment variables. Check .env.local");
  process.exit(1);
}

// ✅ Initialize Supabase client
const supabase = createClient(supabaseUrl, serviceRoleKey);

const updateExpiredMemberships = async () => {
  console.log("🔄 Checking for expired memberships...");

  // ✅ Get today's date (set to midnight to avoid time zone issues)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayString = today.toISOString().split("T")[0]; // Format YYYY-MM-DD

  // ✅ Fetch expired users whose status is still active
  const { data: expiredUsers, error } = await supabase
    .from("memberships")
    .select("user_id, expires_at, status")
    .lt("expires_at", todayString) // Only update memberships where expires_at < today
    .neq("status", "expired"); // Skip already expired ones

  if (error) {
    console.error("❌ Error fetching expired users:", error.message);
    process.exit(1);
  }

  if (!expiredUsers || expiredUsers.length === 0) {
    console.log("✅ No expired memberships to update.");
    process.exit(0);
  }

  console.log(`🔍 Found ${expiredUsers.length} memberships to update.`);

  // ✅ Update membership status to "expired"
  for (const user of expiredUsers) {
    const { error: updateError } = await supabase
      .from("memberships")
      .update({ status: "expired" })
      .eq("user_id", user.user_id);

    if (updateError) {
      console.error(`❌ Failed to update user ${user.user_id}:`, updateError.message);
    } else {
      console.log(`✅ User ${user.user_id} marked as expired.`);
    }
  }

  console.log("🎯 Expired membership updates completed.");
  process.exit(0);
};

// ✅ Run the script
updateExpiredMemberships().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});