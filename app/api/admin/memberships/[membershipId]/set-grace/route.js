// app/api/admin/memberships/[membershipId]/set-grace/route.js
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchMembershipById } from "@/lib/db/memberships";
import { fetchUserRoleById } from "@/lib/db/users";
import {
  getNowUtcIso,
  getStartOfDayUtcIso,
  getEndOfDayUtcIso,
  toValidDate,
} from "@/lib/utils/dateTime";

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

  let adminUser = null;

  try {
    adminUser = await fetchUserRoleById(supabaseAdmin, auth.user.id);
  } catch (err) {
    console.error("❌ Failed to verify admin role:", err);

    return {
      ok: false,
      status: 500,
      error: "Failed to verify admin role.",
    };
  }

  if ((adminUser?.role || "").toLowerCase() !== "admin") {
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

export async function POST(req, { params }) {
  if (process.env.VERCEL_ENV === "preview") {
    return new Response("Admin API disabled in Preview", { status: 403 });
  }

  try {
    const resolvedParams = await params;
    const membershipId = resolvedParams?.membershipId;

    if (!membershipId) {
      return NextResponse.json(
        { ok: false, error: "Missing membershipId." },
        { status: 400 }
      );
    }

    const gate = await requireAdmin(req);

    if (!gate.ok) {
      return NextResponse.json(
        { ok: false, error: gate.error },
        { status: gate.status }
      );
    }

    const body = await req.json().catch(() => ({}));
    const isClear = !!body?.clear;

    let membership = null;

    try {
      membership = await fetchMembershipById(supabaseAdmin, membershipId);
    } catch (membershipError) {
      console.error("❌ Failed to fetch membership:", membershipError);

      return NextResponse.json(
        { ok: false, error: "Failed to load membership." },
        { status: 500 }
      );
    }

    if (!membership?.id) {
      return NextResponse.json(
        { ok: false, error: "Membership not found." },
        { status: 404 }
      );
    }

    const nowIso = getNowUtcIso();

    if (isClear) {
      const { error: overrideError } = await supabaseAdmin
        .from("membership_overrides")
        .upsert(
          {
            membership_id: membership.id,
            user_id: membership.user_id,
            grace_start: null,
            grace_end: null,
            updated_by: gate.admin_user_id,
            updated_at: nowIso,
          },
          { onConflict: "membership_id" }
        );

      if (overrideError) {
        console.error("❌ Failed to clear grace override:", overrideError);

        return NextResponse.json(
          { ok: false, error: "Failed to clear grace." },
          { status: 500 }
        );
      }

      const { error: membershipUpdateError } = await supabaseAdmin
        .from("memberships")
        .update({
          grace_ends_at: null,
        })
        .eq("id", membership.id);
      
      if (membershipUpdateError) {
        console.error("❌ Failed to clear memberships.grace_ends_at:", membershipUpdateError);
      
        return NextResponse.json(
          { ok: false, error: "Failed to clear membership grace end." },
          { status: 500 }
        );
      }

      const { error: auditError } = await supabaseAdmin
        .from("admin_audit_logs")
        .insert({
          action: "membership_clear_grace",
          admin_id: gate.admin_user_id,
          target_membership_id: membership.id,
          target_user_id: membership.user_id,
          details: {},
          created_at: nowIso,
        });

      if (auditError) {
        console.warn(
          "⚠️ Failed to insert grace clear audit log. Non-fatal:",
          auditError?.message || auditError
        );
      }

      return NextResponse.json(
        {
          ok: true,
          membership_id: membership.id,
          grace_start: null,
          grace_end: null,
          grace_ends_at: null,
        },
        { status: 200 }
      );
    }

    const startStr = body?.start;
    const endStr = body?.end;
    const notes = body?.notes ?? null;

    if (!startStr || !endStr) {
      return NextResponse.json(
        {
          ok: false,
          error: "start and end are required.",
        },
        { status: 400 }
      );
    }

    const graceStartIso = getStartOfDayUtcIso(startStr);
    const graceEndIso = getEndOfDayUtcIso(endStr);

    if (!graceStartIso || !graceEndIso) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid grace date range.",
        },
        { status: 400 }
      );
    }

    const graceStartDate = toValidDate(graceStartIso);
    const graceEndDate = toValidDate(graceEndIso);
      
    if (
      !graceStartDate ||
      !graceEndDate ||
      graceEndDate.getTime() <= graceStartDate.getTime()
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid date range. end must be after start.",
        },
        { status: 400 }
      );
    }

    const { error: overrideError } = await supabaseAdmin
      .from("membership_overrides")
      .upsert(
        {
          membership_id: membership.id,
          user_id: membership.user_id,
          grace_start: graceStartIso,
          grace_end: graceEndIso,
          notes,
          updated_by: gate.admin_user_id,
          updated_at: nowIso,
        },
        { onConflict: "membership_id" }
      );

    if (overrideError) {
      console.error("❌ Failed to save grace override:", overrideError);

      return NextResponse.json(
        { ok: false, error: "Failed to save override." },
        { status: 500 }
      );
    }

    const { error: membershipUpdateError } = await supabaseAdmin
      .from("memberships")
      .update({
        grace_ends_at: graceEndIso,
      })
      .eq("id", membership.id);
    
    if (membershipUpdateError) {
      console.error("❌ Failed to update memberships.grace_ends_at:", membershipUpdateError);
    
      return NextResponse.json(
        { ok: false, error: "Failed to update membership grace end." },
        { status: 500 }
      );
    }

    const { error: auditError } = await supabaseAdmin
      .from("admin_audit_logs")
      .insert({
        action: "membership_set_grace",
        admin_id: gate.admin_user_id,
        target_membership_id: membership.id,
        target_user_id: membership.user_id,
        details: {
          start: startStr,
          end: endStr,
          grace_start: graceStartIso,
          grace_end: graceEndIso,
          grace_ends_at: graceEndIso,
          notes,
        },
        created_at: nowIso,
      });

    if (auditError) {
      console.warn(
        "⚠️ Failed to insert grace audit log. Non-fatal:",
        auditError?.message || auditError
      );
    }

    return NextResponse.json(
      {
        ok: true,
        membership_id: membership.id,
        grace_start: graceStartIso,
        grace_end: graceEndIso,
        grace_ends_at: graceEndIso,
        updated_at: nowIso,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ set-grace route fatal error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Unexpected error setting grace period.",
      },
      { status: 500 }
    );
  }
}