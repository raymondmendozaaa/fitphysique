import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function requireAdmin(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) return { ok: false, status: 401, error: "Missing Authorization token." };

  const { data: auth, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !auth?.user?.id) {
    return { ok: false, status: 401, error: "Invalid or expired token." };
  }

  const { data: me, error: meErr } = await supabaseAdmin
    .from("users")
    .select("id, role")
    .eq("id", auth.user.id)
    .single();

  if (meErr) return { ok: false, status: 500, error: "Failed to verify admin role." };
  if ((me?.role || "").toLowerCase() !== "admin") {
    return { ok: false, status: 403, error: "Forbidden." };
  }

  return { ok: true, admin_user_id: auth.user.id };
}

export async function POST(req) {
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) {
      return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
    }

    const { household_id, user_id, role } = await req.json();

    if (!household_id) {
      return NextResponse.json({ ok: false, error: "Missing household_id." }, { status: 400 });
    }
    if (!user_id) {
      return NextResponse.json({ ok: false, error: "Missing user_id." }, { status: 400 });
    }

    const desiredRole = (role || "dependent").toLowerCase();
    const allowedRoles = new Set(["primary", "dependent"]);
    if (!allowedRoles.has(desiredRole)) {
      return NextResponse.json(
        { ok: false, error: `Invalid role: ${desiredRole}` },
        { status: 400 }
      );
    }

    // 1) Ensure household exists
    const { data: household, error: hErr } = await supabaseAdmin
      .from("households")
      .select("id, billing_owner_id, primary_member_id, status")
      .eq("id", household_id)
      .single();

    if (hErr || !household?.id) {
      return NextResponse.json({ ok: false, error: "Household not found." }, { status: 404 });
    }

    if ((household.status || "").toLowerCase() !== "active") {
      return NextResponse.json({ ok: false, error: "Household is not active." }, { status: 400 });
    }

    // 2) Load user + shortcut fields
    const { data: user, error: uErr } = await supabaseAdmin
      .from("users")
      .select("id, full_name, email, household_id, household_role")
      .eq("id", user_id)
      .single();

    if (uErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
    }

    // v1 rule: block if user is already in a household
    if (user.household_id) {
      return NextResponse.json(
        { ok: false, error: "User is already in a household. Use Move/Remove instead." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // 3) Create household_members row
    const { data: hmRow, error: hmErr } = await supabaseAdmin
      .from("household_members")
      .insert({
        household_id: household.id,
        user_id: user.id,
        role: desiredRole,
        started_at: now,
      })
      .select("*")
      .single();

    if (hmErr) {
      console.error("insert household_members error:", hmErr);
      return NextResponse.json(
        { ok: false, error: "Failed to add member to household." },
        { status: 500 }
      );
    }

    // 4) Update user shortcut fields (REQUIRED)
    const { error: userUpdateErr } = await supabaseAdmin
      .from("users")
      .update({
        household_id: household.id,
        household_role: desiredRole,
      })
      .eq("id", user.id);

    if (userUpdateErr) {
      console.error("update user household error:", userUpdateErr);

      // cleanup: remove hmRow
      const { error: cleanupMemberErr } = await supabaseAdmin
        .from("household_members")
        .delete()
        .eq("id", hmRow.id);

      if (cleanupMemberErr) console.error("cleanup household_member failed:", cleanupMemberErr);

      return NextResponse.json(
        { ok: false, error: "Failed to link user to household (user update failed)." },
        { status: 500 }
      );
    }

    // 5) Optional: if they’re being added as primary, update household primary_member_id
    // (You can remove this block if you want primary to be set only via a dedicated “transfer primary” flow.)
    if (desiredRole === "primary" && household.primary_member_id !== user.id) {
      const { error: promoteErr } = await supabaseAdmin
        .from("households")
        .update({ primary_member_id: user.id })
        .eq("id", household.id);

      if (promoteErr) {
        console.warn("promote primary_member_id failed (non-fatal):", promoteErr);
      }
    }

    return NextResponse.json({
      ok: true,
      household_id: household.id,
      householdMember: hmRow,
    });
  } catch (e) {
    console.error("households/add-member fatal error:", e);
    return NextResponse.json(
      { ok: false, error: "Unexpected error adding household member." },
      { status: 500 }
    );
  }
}