import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Service-role admin client (server-side only)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED = new Set(["none", "stay_household", "renew_pif", "move_individual"]);

/**
 * Optional but strongly recommended:
 * Verifies the caller is an authenticated admin.
 *
 * This requires the client to send the logged-in user's access token
 * in: Authorization: Bearer <token>
 *
 * If you don't want to implement this yet, you can remove this function.
 */
async function requireAdmin(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return { ok: false, status: 401, error: "Missing Authorization token." };
  }

  const { data: auth, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !auth?.user?.id) {
    return { ok: false, status: 401, error: "Invalid or expired token." };
  }

  const { data: me, error: meErr } = await supabaseAdmin
    .from("users")
    .select("id, role")
    .eq("id", auth.user.id)
    .single();

  if (meErr) {
    return { ok: false, status: 500, error: "Failed to verify admin role." };
  }

  if ((me?.role || "").toLowerCase() !== "admin") {
    return { ok: false, status: 403, error: "Forbidden." };
  }

  return { ok: true, admin_user_id: auth.user.id };
}

export async function POST(req) {
  try {
    const { household_id, pif_end_action, note } = await req.json();

    if (!household_id) {
      return NextResponse.json({ ok: false, error: "Missing household_id." }, { status: 400 });
    }

    const action = String(pif_end_action || "").trim();
    if (!ALLOWED.has(action)) {
      return NextResponse.json(
        { ok: false, error: `Invalid pif_end_action: ${action}` },
        { status: 400 }
      );
    }

    // ✅ Recommended admin guard (keep it)
    const gate = await requireAdmin(req);
    if (!gate.ok) {
      return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
    }

    const now = new Date().toISOString();

    // 1) Update household
    const { data: household, error: hErr } = await supabaseAdmin
      .from("households")
      .update({
        pif_end_action: action,
        pif_end_choice_set_at: now,
        pif_end_choice_set_by: gate.admin_user_id,
      })
      .eq("id", household_id)
      .select("*")
      .single();

    if (hErr) {
      console.error("update household error:", hErr);
      return NextResponse.json(
        { ok: false, error: "Failed to update household." },
        { status: 500 }
      );
    }

    // 2) Keep membership banner logic consistent by copying the decision onto active household memberships
    // (If you want this household-only, you can delete this block.)
    const { error: mErr } = await supabaseAdmin
      .from("memberships")
      .update({
        pif_end_action: action,
        pif_end_choice_set_at: now,
        pif_end_choice_set_by: gate.admin_user_id,
      })
      .eq("household_id", household_id)
      .eq("status", "active");

    if (mErr) {
      console.error("update memberships error:", mErr);
      return NextResponse.json(
        { ok: false, error: "Household updated but failed to sync memberships." },
        { status: 500 }
      );
    }

    // 3) Optional log (non-fatal if table doesn't exist yet)
    // Only keep this if you have household_actions_log
    const { error: logErr } = await supabaseAdmin.from("household_actions_log").insert({
      household_id,
      action: "set_pif_end_action",
      decision_source: "admin",
      decided_by: gate.admin_user_id,
      created_at: now,
      notes: note || null,
    });

    if (logErr) {
      console.warn("household_actions_log insert failed (non-fatal):", logErr?.message || logErr);
    }

    return NextResponse.json({ ok: true, household });
  } catch (e) {
    console.error("households/set-pif-end-action fatal error:", e);
    return NextResponse.json(
      { ok: false, error: "Unexpected error saving household action." },
      { status: 500 }
    );
  }
}