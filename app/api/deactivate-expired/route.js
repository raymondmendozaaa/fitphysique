import { supabase } from "@/lib/supabaseClient";
import { NextResponse } from "next/server";

export async function GET() {
  console.log("🔄 Running nightly membership expiration check...");

  const today = new Date().toISOString().split("T")[0];

  // 🔍 Find memberships that have passed their expiration date
  const { data: expiredUsers, error } = await supabase
    .from("memberships")
    .select("user_id, expires_at")
    .lt("expires_at", today)
    .not("status", "eq", "expired");

  if (error) {
    console.error("❌ Error fetching expired users:", error.message);
    return NextResponse.json({ error: "Failed to check expired users" }, { status: 500 });
  }

  if (!expiredUsers.length) {
    console.log("✅ No expired memberships found.");
    return NextResponse.json({ message: "No expired users to update." });
  }

  console.log(`⚠️ Found ${expiredUsers.length} expired memberships. Marking as expired...`);

  const { error: updateError } = await supabase
    .from("memberships")
    .update({
      status: "expired",
      expired_on: today,
    })
    .in("user_id", expiredUsers.map((user) => user.user_id));

  if (updateError) {
    console.error("❌ Error updating expired users:", updateError.message);
    return NextResponse.json({ error: "Failed to update expired users" }, { status: 500 });
  }

  console.log(`✅ Marked ${expiredUsers.length} memberships as expired.`);
  return NextResponse.json({ message: `Expired ${expiredUsers.length} users.` });
}