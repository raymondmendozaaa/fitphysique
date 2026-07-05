import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { fetchAccessEligibleMembershipForUser } from "@/lib/db/memberships";
import { fetchUserAccessIdentityByEmailOrBarcode } from "@/lib/db/users";

export async function POST(req) {
  try {
    const { email, barcode } = await req.json();

    if (!email && !barcode) {
      return NextResponse.json({ error: "Must provide an email or barcode" }, { status: 400 });
    }

    // 🔹 Check for user by email OR barcode
    let user = null;

    try {
      user = await fetchUserAccessIdentityByEmailOrBarcode(supabase, {
        email,
        barcode,
      });
    } catch (userLookupError) {
      console.error("❌ Failed to fetch user:", userLookupError);
      return NextResponse.json({ error: "Failed to load user" }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 🔹 Check access-eligible membership
    let membership = null;

    try {
      membership = await fetchAccessEligibleMembershipForUser(supabase, user.id);
    } catch (membershipError) {
      console.error("❌ Failed to fetch access-eligible membership:", membershipError);
    
      return NextResponse.json(
        { error: "Failed to load membership" },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json(
        {
          error: "No active access-eligible membership found",
          status: "denied",
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      message: "Access granted",
      status: "approved",
      membership_id: membership.id,
    });
  } catch (error) {
    console.error("Error checking gym access:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}