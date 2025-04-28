import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function POST(req) {
  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ access: false, error: "Missing user ID" }), { status: 400 });
    }

    const { data: membership, error } = await supabase
      .from("memberships")
      .select("status, expires_at")
      .eq("user_id", user_id)
      .single();

    if (error || !membership) {
      return new Response(JSON.stringify({ access: false, error: "Membership not found" }), { status: 404 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expirationDate = new Date(`${membership.expires_at}T00:00:00Z`);
    const localExpiration = new Date(expirationDate.getTime() + expirationDate.getTimezoneOffset() * 60000);

    if (membership.status === "active" && localExpiration >= today) {
      return new Response(JSON.stringify({ access: true, message: "Access granted" }), { status: 200 });
    } else {
      return new Response(JSON.stringify({ access: false, message: "Access denied. Membership expired." }), { status: 403 });
    }
  } catch (err) {
    return new Response(JSON.stringify({ access: false, error: "Server error" }), { status: 500 });
  }
}
