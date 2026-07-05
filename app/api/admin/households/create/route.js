import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { 
  fetchUserRoleById, 
  fetchUserHouseholdFieldsById, 
  updateUserHouseholdFields 
} from "@/lib/db/users";
import { getNowUtcIso } from "@/lib/utils/dateTime";

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

  let me = null;

  try {
    me = await fetchUserRoleById(supabaseAdmin, auth.user.id);
  } catch {
    return { ok: false, status: 500, error: "Failed to verify admin role." };
  }

  if ((me?.role || "").toLowerCase() !== "admin") {
    return { ok: false, status: 403, error: "Forbidden." };
  }

  return { ok: true, admin_user_id: auth.user.id };
}

export async function POST(req) {
  if (process.env.VERCEL_ENV === "preview") {
    return new Response("Admin API disabled in Preview", { status: 403 });
  }
  
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) {
      return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
    }

    const { user_id, name } = await req.json();

    if (!user_id) {
      return NextResponse.json(
        { ok: false, error: "Missing user_id." },
        { status: 400 }
      );
    }

    // 1) Load the user (to get name + current household)
    let user = null;

    try {
      user = await fetchUserHouseholdFieldsById(supabaseAdmin, user_id);
    } catch (userErr) {
      console.error("load user error:", userErr);
      return NextResponse.json(
        { ok: false, error: "User not found." },
        { status: 404 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "User not found." },
        { status: 404 }
      );
    }

    // For v1: block if they’re already in a household.
    if (user.household_id) {
      return NextResponse.json(
        { ok: false, error: "User is already in a household. Use Move/Remove instead." },
        { status: 400 }
      );
    }

    const householdName =
      (name && name.trim()) ||
      (user.full_name ? `${user.full_name}'s household` : "Household");

    // 2) Create household with this user as both billing_owner + primary_member
    const { data: household, error: hErr } = await supabaseAdmin
      .from("households")
      .insert({
        name: householdName,
        billing_owner_id: user.id,
        primary_member_id: user.id,
      })
      .select("*")
      .single();

    if (hErr) {
      console.error("insert household error:", hErr);
      return NextResponse.json(
        { ok: false, error: "Failed to create household." },
        { status: 500 }
      );
    }

    const nowIso = getNowUtcIso();

    // 3) Add them to household_members as 'primary'
    const { data: hmRow, error: hmErr } = await supabaseAdmin
      .from("household_members")
      .insert({
        household_id: household.id,
        user_id: user.id,
        role: "primary",
        started_at: nowIso,
        is_active: true,
      })
      .select("*")
      .single();
    
    if (hmErr) {
      console.error("insert household_members error:", hmErr);
    
      // ✅ Cleanup: delete the household we just created so we don't leave an orphan record
      const { error: cleanupErr } = await supabaseAdmin
        .from("households")
        .delete()
        .eq("id", household.id);
    
      if (cleanupErr) {
        console.error("cleanup orphan household failed:", cleanupErr);
      }
    
      return NextResponse.json(
        { ok: false, error: "Failed to add member to household." },
        { status: 500 }
      );
    }

    // 4) Update the user shortcut fields
    let userUpdateErr = null;

    try {
      await updateUserHouseholdFields(supabaseAdmin, user.id, {
        household_id: household.id,
        household_role: "primary",
      });
    } catch (err) {
      userUpdateErr = err;
    }

    if (userUpdateErr) {
      console.error("update user household error:", userUpdateErr);

      // ✅ Cleanup: undo what we created (member row + household row)
      const { error: cleanupMemberErr } = await supabaseAdmin
        .from("household_members")
        .delete()
        .eq("id", hmRow.id);

      if (cleanupMemberErr) {
        console.error("cleanup household_member failed:", cleanupMemberErr);
      }
    
      const { error: cleanupHouseholdErr } = await supabaseAdmin
        .from("households")
        .delete()
        .eq("id", household.id);
    
      if (cleanupHouseholdErr) {
        console.error("cleanup household failed:", cleanupHouseholdErr);
      }
    
      return NextResponse.json(
        { ok: false, error: "Failed to link user to household (user update failed)." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      household,
      householdMember: hmRow,
    });
  } catch (e) {
    console.error("households/create fatal error:", e);
    return NextResponse.json(
      { ok: false, error: "Unexpected error creating household." },
      { status: 500 }
    );
  }
}