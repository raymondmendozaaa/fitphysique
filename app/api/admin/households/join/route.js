// app/api/admin/households/join/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function requireAdmin(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) throw new Error("Missing Authorization bearer token.");

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) throw new Error("Invalid session.");

  const adminId = userData.user.id;

  const { data: dbUser, error: dbErr } = await supabaseAdmin
    .from("users")
    .select("id, role")
    .eq("id", adminId)
    .single();

  if (dbErr || !dbUser) throw new Error("Admin not found in users table.");
  if ((dbUser.role || "").toLowerCase() !== "admin") throw new Error("Not authorized.");

  return { adminId };
}

function isUuid(v = "") {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v).trim()
  );
}

export async function POST(req) {
  try {
    const { adminId } = await requireAdmin(req);

    const body = await req.json().catch(() => ({}));
    const { household_id, user_id, role } = body;

    if (!isUuid(household_id)) {
      return NextResponse.json({ ok: false, error: "Invalid household_id UUID." }, { status: 400 });
    }
    if (!isUuid(user_id)) {
      return NextResponse.json({ ok: false, error: "Invalid user_id UUID." }, { status: 400 });
    }

    // Ensure household exists
    const { data: hh, error: hhErr } = await supabaseAdmin
      .from("households")
      .select("id, name, billing_owner_id, primary_member_id, status, pif_end_action, pif_end_choice_set_at, pif_end_choice_set_by")
      .eq("id", household_id)
      .single();

    if (hhErr || !hh) {
      return NextResponse.json({ ok: false, error: "Household not found." }, { status: 404 });
    }

    // End any active household membership for this user (so they can't be in two)
    await supabaseAdmin
      .from("household_members")
      .update({ ended_at: new Date().toISOString(), is_active: false })
      .eq("user_id", user_id)
      .is("ended_at", null);

    // Insert new membership
    const insertRow = {
      household_id,
      user_id,
      role: role || "member",
      started_at: new Date().toISOString(),
      ended_at: null,
      is_active: true,
    };

    const { data: hm, error: hmErr } = await supabaseAdmin
      .from("household_members")
      .insert(insertRow)
      .select("id, household_id, user_id, role, started_at, ended_at, is_active")
      .single();

    if (hmErr || !hm) {
      return NextResponse.json(
        { ok: false, error: hmErr?.message || "Failed to add user to household." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      household: hh,
      householdMember: hm,
      meta: { set_by_admin_id: adminId },
    });
  } catch (e) {
    console.error("households/join error:", e);
    return NextResponse.json({ ok: false, error: e.message || "Server error." }, { status: 401 });
  }
}