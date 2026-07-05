// app/api/admin/households/join/route.js
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  fetchUserRoleById,
  updateUserHouseholdFields,
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
      error: "Missing Authorization bearer token.",
    };
  }

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);

  if (userErr || !userData?.user?.id) {
    return {
      ok: false,
      status: 401,
      error: "Invalid session.",
    };
  }

  const adminId = userData.user.id;

  let dbUser = null;

  try {
    dbUser = await fetchUserRoleById(supabaseAdmin, adminId);
  } catch (err) {
    console.error("❌ Failed to verify admin role:", err);
    return {
      ok: false,
      status: 500,
      error: "Failed to verify admin role.",
    };
  }

  if (!dbUser) {
    return {
      ok: false,
      status: 404,
      error: "Admin not found in users table.",
    };
  }

  if ((dbUser.role || "").toLowerCase() !== "admin") {
    return {
      ok: false,
      status: 403,
      error: "Not authorized.",
    };
  }

  return {
    ok: true,
    adminId,
  };
}

function isUuid(v = "") {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v).trim()
  );
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

    const desiredRole = String(role || "member").trim().toLowerCase();

    const allowedRoles = new Set(["primary", "member", "dependent"]);

    if (!allowedRoles.has(desiredRole)) {
      return NextResponse.json(
        { ok: false, error: `Invalid role: ${desiredRole}` },
        { status: 400 }
      );
    }

    if (!isUuid(household_id)) {
      return NextResponse.json(
        { ok: false, error: "Invalid household_id UUID." },
        { status: 400 }
      );
    }

    if (!isUuid(user_id)) {
      return NextResponse.json(
        { ok: false, error: "Invalid user_id UUID." },
        { status: 400 }
      );
    }

    // Ensure household exists
    const { data: household, error: householdError } = await supabaseAdmin
      .from("households")
      .select(`
        id,
        name,
        billing_owner_id,
        primary_member_id,
        status,
        pif_end_action,
        pif_end_choice_set_at,
        pif_end_choice_set_by
      `)
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

    const nowIso = getNowUtcIso();

    // End any active household membership for this user
    const { error: endExistingError } = await supabaseAdmin
      .from("household_members")
      .update({
        ended_at: nowIso,
        is_active: false,
      })
      .eq("user_id", user_id)
      .is("ended_at", null);

    if (endExistingError) {
      console.error("❌ Failed to end existing household membership:", endExistingError);
      return NextResponse.json(
        { ok: false, error: "Failed to end existing household membership." },
        { status: 500 }
      );
    }

    // Insert new household membership
    const { data: householdMember, error: householdMemberError } = await supabaseAdmin
      .from("household_members")
      .insert({
        household_id,
        user_id,
        role: desiredRole,
        started_at: nowIso,
        ended_at: null,
        is_active: true,
      })
      .select("id, household_id, user_id, role, started_at, ended_at, is_active")
      .single();

    if (householdMemberError || !householdMember) {
      console.error("❌ Failed to add user to household:", householdMemberError);
      return NextResponse.json(
        {
          ok: false,
          error: householdMemberError?.message || "Failed to add user to household.",
        },
        { status: 500 }
      );
    }

    try {
      await updateUserHouseholdFields(supabaseAdmin, user_id, {
        household_id,
        household_role: desiredRole,
      });
    } catch (userUpdateErr) {
      console.error("❌ Failed to update user household shortcut fields:", userUpdateErr);

      const { error: cleanupError } = await supabaseAdmin
        .from("household_members")
        .delete()
        .eq("id", householdMember.id);

      if (cleanupError) {
        console.error("❌ Failed to cleanup household member after user update failure:", cleanupError);
      }

      return NextResponse.json(
        { ok: false, error: "Failed to update user household fields." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      household,
      householdMember,
      meta: {
        set_by_admin_id: gate.adminId,
      },
    });
  } catch (e) {
    console.error("❌ households/join error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}