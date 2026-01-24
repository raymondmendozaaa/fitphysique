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

    const { user_id, household_id } = await req.json();

    if (!user_id) {
      return NextResponse.json({ ok: false, error: "Missing user_id." }, { status: 400 });
    }
    if (!household_id) {
      return NextResponse.json({ ok: false, error: "Missing household_id." }, { status: 400 });
    }

    // 1) Load household
    const { data: household, error: hErr } = await supabaseAdmin
      .from("households")
      .select("id, billing_owner_id, primary_member_id, status")
      .eq("id", household_id)
      .single();

    if (hErr || !household?.id) {
      return NextResponse.json({ ok: false, error: "Household not found." }, { status: 404 });
    }

    // v1 safety: do not allow removing billing owner / primary
    if (household.billing_owner_id === user_id) {
      return NextResponse.json(
        { ok: false, error: "Cannot remove the billing owner. Transfer billing owner first." },
        { status: 400 }
      );
    }

    if (household.primary_member_id === user_id) {
      return NextResponse.json(
        { ok: false, error: "Cannot remove the primary member. Transfer primary first." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // 2) End the active household_members row
    const { data: endedRow, error: endErr } = await supabaseAdmin
      .from("household_members")
      .update({ ended_at: now })
      .eq("household_id", household_id)
      .eq("user_id", user_id)
      .is("ended_at", null)
      .select("*")
      .maybeSingle();

    if (endErr) {
      console.error("end household member error:", endErr);
      return NextResponse.json(
        { ok: false, error: "Failed to remove member from household." },
        { status: 500 }
      );
    }

    if (!endedRow) {
      return NextResponse.json(
        { ok: false, error: "No active household membership found for this user." },
        { status: 404 }
      );
    }

    // 3) Clear user shortcut fields (REQUIRED)
    const { error: userUpdateErr } = await supabaseAdmin
      .from("users")
      .update({
        household_id: null,
        household_role: null,
      })
      .eq("id", user_id);

    if (userUpdateErr) {
      console.error("clear user household fields error:", userUpdateErr);

      // rollback: re-activate their row (set ended_at back to null)
      const { error: rollbackErr } = await supabaseAdmin
        .from("household_members")
        .update({ ended_at: null })
        .eq("id", endedRow.id);

      if (rollbackErr) {
        console.error("rollback household_members failed:", rollbackErr);
      }

      return NextResponse.json(
        { ok: false, error: "Failed to unlink user from household (user update failed)." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, ended: endedRow });
  } catch (e) {
    console.error("households/remove-member fatal error:", e);
    return NextResponse.json(
      { ok: false, error: "Unexpected error removing household member." },
      { status: 500 }
    );
  }
}