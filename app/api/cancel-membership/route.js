import { supabase } from "@/lib/supabaseClient";
import { NextResponse } from "next/server";

export async function POST(req) {
  const { user_id } = await req.json();

  // Fetch the user's membership details
  const { data: membership, error } = await supabase
    .from("memberships")
    .select("start_date, contract_length")
    .eq("user_id", user_id)
    .single();

  if (error || !membership) {
    return NextResponse.json({ error: "Membership not found." }, { status: 404 });
  }

  // Check if the contract period has ended
  const startDate = new Date(membership.start_date);
  const endDate = new Date(startDate);
  endDate.setMonth(startDate.getMonth() + membership.contract_length);

  if (new Date() < endDate) {
    return NextResponse.json({ error: "You cannot cancel before your contract ends." }, { status: 403 });
  }

  // Proceed with membership cancellation (delete from memberships table)
  const { error: cancelError } = await supabase
    .from("memberships")
    .delete()
    .eq("user_id", user_id);

  if (cancelError) {
    return NextResponse.json({ error: "Error canceling membership." }, { status: 500 });
  }

  return NextResponse.json({ message: "Membership canceled successfully." }, { status: 200 });
}
