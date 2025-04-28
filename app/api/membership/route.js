import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function PATCH(req) {
  try {
    const { user_id, plan } = await req.json();

    if (!user_id || !plan) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Ensure the plan is valid
    const validPlans = ["Standard", "Ultimate", "Professional", "Guest-Pass"];
    if (!validPlans.includes(plan)) {
      return NextResponse.json({ error: "Invalid membership plan" }, { status: 400 });
    }

    // Update the membership
    const { error } = await supabase
      .from("memberships")
      .update({ plan })
      .eq("user_id", user_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Membership updated successfully" });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}