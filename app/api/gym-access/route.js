import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { fetchAccessEligibleMembershipForUser } from "@/lib/db/memberships";

export async function POST(req) {
  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ access: false, error: "Missing user ID" }), { status: 400 });
    }

    let membership = null;

    try {
      membership = await fetchAccessEligibleMembershipForUser(supabase, user_id);
    } catch (error) {
      console.error("❌ Failed to fetch membership:", error);
      return new Response(JSON.stringify({ access: false, error: "Failed to load membership" }), { status: 500 });
    }

    if (!membership) {
      return new Response(JSON.stringify({ access: false, error: "Membership not found" }), { status: 404 });
    }

    return new Response(
      JSON.stringify({ access: true, message: "Access granted" }),
      { status: 200 }
    );
  } catch (err) {
    return new Response(JSON.stringify({ access: false, error: "Server error" }), { status: 500 });
  }
}
