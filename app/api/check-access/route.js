import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req) {
  try {
    const { email, barcode } = await req.json();

    if (!email && !barcode) {
      return NextResponse.json({ error: "Must provide an email or barcode" }, { status: 400 });
    }

    // 🔹 Check for user by email OR barcode
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, email")
      .or(`email.eq.${email}, barcode.eq.${barcode}`)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 🔹 Check membership status
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select("plan, status, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json({ error: "No active membership found" }, { status: 403 });
    }

    // 🔹 Validate expiration date
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Midnight reset

    const expiresAt = membership.expires_at ? new Date(membership.expires_at) : null;

    if (!expiresAt || expiresAt < today) {
      return NextResponse.json({ error: "Membership expired", status: "denied" }, { status: 403 });
    }

    return NextResponse.json({ message: "Access granted", status: "approved" });
  } catch (error) {
    console.error("Error checking gym access:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}