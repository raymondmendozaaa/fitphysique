// app/api/admin/households/remove-member/route.js
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchUserRoleById, updateUserHouseholdFields } from "@/lib/db/users";
import { getNowUtcIso } from "@/lib/utils/dateTime";

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
    const { user_id, household_id } = body;

    if (!user_id) {
      return NextResponse.json(
        { ok: false, error: "Missing user_id." },
        { status: 400 }
      );
    }

    if (!household_id) {
      return NextResponse.json(
        { ok: false, error: "Missing household_id." },
        { status: 400 }
      );
    }

    // 1) Load household
    const { data: household, error: householdError } = await supabaseAdmin
      .from("households")
      .select("id, billing_owner_id, primary_member_id, status")
      .eq("id", household_id)
      .maybeSingle();

    if (householdError) {
      console.error("❌ Failed to load household:", householdError);
      return NextResponse.json(
        { ok: false, error: "Failed to load household." },
        { status: 500 }
      );
    }

    if (!household?.id) {
      return NextResponse.json(
        { ok: false, error: "Household not found." },
        { status: 404 }
      );
    }

    // v1 safety: do not allow removing billing owner / primary
    if (household.billing_owner_id === user_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Cannot remove the billing owner. Transfer billing owner first.",
        },
        { status: 400 }
      );
    }

    if (household.primary_member_id === user_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Cannot remove the primary member. Transfer primary first.",
        },
        { status: 400 }
      );
    }

    const nowIso = getNowUtcIso();

    // 2) End the active household_members row
    const { data: endedRow, error: endError } = await supabaseAdmin
      .from("household_members")
      .update({
        ended_at: nowIso,
        is_active: false,
      })
      .eq("household_id", household_id)
      .eq("user_id", user_id)
      .is("ended_at", null)
      .select("*")
      .maybeSingle();

    if (endError) {
      console.error("❌ Failed to end household member row:", endError);
      return NextResponse.json(
        { ok: false, error: "Failed to remove member from household." },
        { status: 500 }
      );
    }

    if (!endedRow) {
      return NextResponse.json(
        {
          ok: false,
          error: "No active household membership found for this user.",
        },
        { status: 404 }
      );
    }

    // 3) Clear user shortcut fields
    try {
      await updateUserHouseholdFields(supabaseAdmin, user_id, {
        household_id: null,
        household_role: null,
      });
    } catch (userUpdateErr) {
      console.error("❌ Failed to clear user household fields:", userUpdateErr);

      // rollback: re-activate their household_members row
      const { error: rollbackError } = await supabaseAdmin
        .from("household_members")
        .update({
          ended_at: null,
          is_active: true,
        })
        .eq("id", endedRow.id);

      if (rollbackError) {
        console.error("❌ Rollback household_members failed:", rollbackError);
      }

      return NextResponse.json(
        {
          ok: false,
          error: "Failed to unlink user from household.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      ended: endedRow,
      meta: {
        removed_by_admin_id: gate.admin_user_id,
      },
    });
  } catch (e) {
    console.error("❌ households/remove-member fatal error:", e);
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Unexpected error removing household member.",
      },
      { status: 500 }
    );
  }
}