// app/api/admin/households/set-pif-end-action/route.js
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { updateActiveMembershipsByHouseholdId } from "@/lib/db/memberships";
import { fetchUserRoleById } from "@/lib/db/users";
import { getNowUtcIso } from "@/lib/utils/dateTime";

const ALLOWED_PIF_END_ACTIONS = new Set([
  "none",
  "stay_household",
  "renew_pif",
  "move_individual",
]);

async function requireAdmin(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Missing Authorization token.",
    };
  }

  const { data: auth, error: authErr } = await supabaseAdmin.auth.getUser(token);

  if (authErr || !auth?.user?.id) {
    return {
      ok: false,
      status: 401,
      error: "Invalid or expired token.",
    };
  }

  let me = null;

  try {
    me = await fetchUserRoleById(supabaseAdmin, auth.user.id);
  } catch (err) {
    console.error("❌ Failed to verify admin role:", err);
    return {
      ok: false,
      status: 500,
      error: "Failed to verify admin role.",
    };
  }

  if ((me?.role || "").toLowerCase() !== "admin") {
    return {
      ok: false,
      status: 403,
      error: "Forbidden.",
    };
  }

  return {
    ok: true,
    admin_user_id: auth.user.id,
  };
}

export async function POST(req) {
  if (process.env.VERCEL_ENV === "preview") {
    return new Response("Admin API disabled in Preview", { status: 403 });
  }

  try {
    const gate = await requireAdmin(req);

    if (!gate.ok) {
      return NextResponse.json(
        { ok: false, error: gate.error },
        { status: gate.status }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { household_id, pif_end_action, note } = body;

    if (!household_id) {
      return NextResponse.json(
        { ok: false, error: "Missing household_id." },
        { status: 400 }
      );
    }

    const action = String(pif_end_action || "").trim().toLowerCase();

    if (!ALLOWED_PIF_END_ACTIONS.has(action)) {
      return NextResponse.json(
        { ok: false, error: `Invalid pif_end_action: ${action}` },
        { status: 400 }
      );
    }

    const nowIso = getNowUtcIso();

    // 1) Update household-level decision
    const { data: household, error: householdError } = await supabaseAdmin
      .from("households")
      .update({
        pif_end_action: action,
        pif_end_choice_set_at: nowIso,
        pif_end_choice_set_by: gate.admin_user_id,
      })
      .eq("id", household_id)
      .select("*")
      .maybeSingle();

    if (householdError) {
      console.error("❌ Failed to update household PIF end action:", householdError);
      return NextResponse.json(
        { ok: false, error: "Failed to update household." },
        { status: 500 }
      );
    }

    if (!household?.id) {
      return NextResponse.json(
        { ok: false, error: "Household not found." },
        { status: 404 }
      );
    }

    // 2) Keep active household memberships synced for dashboard/banner logic
    try {
      await updateActiveMembershipsByHouseholdId(supabaseAdmin, household_id, {
        pif_end_action: action,
        pif_end_choice_set_at: nowIso,
        pif_end_choice_set_by: gate.admin_user_id,
      });
    } catch (membershipSyncError) {
      console.error(
        "❌ Household updated but failed to sync active memberships:",
        membershipSyncError
      );

      return NextResponse.json(
        {
          ok: false,
          error: "Household updated but failed to sync memberships.",
        },
        { status: 500 }
      );
    }

    // 3) Optional audit log. Non-fatal if the table/insert fails.
    const { error: logError } = await supabaseAdmin
      .from("household_actions_log")
      .insert({
        household_id,
        action: "set_pif_end_action",
        decision_source: "admin",
        decided_by: gate.admin_user_id,
        created_at: nowIso,
        notes: note || null,
      });

    if (logError) {
      console.warn(
        "⚠️ household_actions_log insert failed. Non-fatal:",
        logError?.message || logError
      );
    }

    return NextResponse.json({
      ok: true,
      household,
    });
  } catch (e) {
    console.error("❌ households/set-pif-end-action fatal error:", e);

    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Unexpected error saving household action.",
      },
      { status: 500 }
    );
  }
}