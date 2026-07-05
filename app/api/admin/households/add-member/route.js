// app/api/admin/households/add-member/route.js
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  fetchUserRoleById,
  fetchUserById,
  updateUserById,
} from "@/lib/db/users";
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
  } catch (e) {
    console.error("❌ Failed to verify admin role:", e);
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
    const { household_id, user_id, role } = body;

    if (!household_id) {
      return NextResponse.json(
        { ok: false, error: "Missing household_id." },
        { status: 400 }
      );
    }

    if (!user_id) {
      return NextResponse.json(
        { ok: false, error: "Missing user_id." },
        { status: 400 }
      );
    }

    const desiredRole = String(role || "member").trim().toLowerCase();

    const allowedRoles = new Set(["primary", "member", "dependent"]);

    if (!allowedRoles.has(desiredRole)) {
      return NextResponse.json(
        { ok: false, error: `Invalid role: ${desiredRole}` },
        { status: 400 }
      );
    }

    // 1) Ensure household exists
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

    if ((household.status || "").toLowerCase() !== "active") {
      return NextResponse.json(
        { ok: false, error: "Household is not active." },
        { status: 400 }
      );
    }

    // 2) Load user + shortcut fields
    let user = null;

    try {
      user = await fetchUserById(
        supabaseAdmin,
        user_id,
        "id, full_name, email, household_id, household_role"
      );
    } catch (userError) {
      console.error("❌ Failed to load user:", userError);
      return NextResponse.json(
        { ok: false, error: "Failed to load user." },
        { status: 500 }
      );
    }

    if (!user?.id) {
      return NextResponse.json(
        { ok: false, error: "User not found." },
        { status: 404 }
      );
    }

    // v1 rule: block if user shortcut already says they are in a household
    if (user.household_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "User is already in a household. Use Move/Remove instead.",
        },
        { status: 400 }
      );
    }

    const nowIso = getNowUtcIso();

    // 3) Create household_members row
    const { data: hmRow, error: hmErr } = await supabaseAdmin
      .from("household_members")
      .insert({
        household_id: household.id,
        user_id: user.id,
        role: desiredRole,
        started_at: nowIso,
        is_active: true,
      })
      .select("*")
      .single();

    if (hmErr) {
      console.error("❌ Failed to insert household_members row:", hmErr);
      return NextResponse.json(
        { ok: false, error: "Failed to add member to household." },
        { status: 500 }
      );
    }

    // 4) Update user shortcut fields
    try {
      await updateUserById(supabaseAdmin, user.id, {
        household_id: household.id,
        household_role: desiredRole,
      });
    } catch (userUpdateErr) {
      console.error("❌ Failed to update user household shortcut fields:", userUpdateErr);

      // Cleanup inserted household_members row if user update fails
      const { error: cleanupMemberErr } = await supabaseAdmin
        .from("household_members")
        .delete()
        .eq("id", hmRow.id);

      if (cleanupMemberErr) {
        console.error("❌ Cleanup household_member failed:", cleanupMemberErr);
      }

      return NextResponse.json(
        {
          ok: false,
          error: "Failed to link user to household.",
        },
        { status: 500 }
      );
    }

    // 5) Optional: if added as primary, update household primary_member_id
    if (desiredRole === "primary" && household.primary_member_id !== user.id) {
      const { error: promoteErr } = await supabaseAdmin
        .from("households")
        .update({ primary_member_id: user.id })
        .eq("id", household.id);

      if (promoteErr) {
        console.warn("⚠️ Failed to update primary_member_id. Non-fatal:", promoteErr);
      }
    }

    return NextResponse.json({
      ok: true,
      household_id: household.id,
      householdMember: hmRow,
    });
  } catch (e) {
    console.error("❌ households/add-member fatal error:", e);
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Unexpected error adding household member.",
      },
      { status: 500 }
    );
  }
}