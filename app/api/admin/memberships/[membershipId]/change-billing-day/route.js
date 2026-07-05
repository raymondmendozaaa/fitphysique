// app/api/admin/memberships/[membershipId]/change-billing-day/route.js
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchMembershipById } from "@/lib/db/memberships";
import { fetchUserRoleById } from "@/lib/db/users";
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
            desired_billing_day: null,
            updated_by: gate.admin_user_id,
            updated_at: nowIso,
          },
          { onConflict: "membership_id" }
        );

      if (overrideError) {
        console.error("❌ Failed to clear billing-day override:", overrideError);

        return NextResponse.json(
          { ok: false, error: "Failed to clear override." },
          { status: 500 }
        );
      }

      const { error: auditError } = await supabaseAdmin
        .from("admin_audit_logs")
        .insert({
          action: "membership_clear_billing_day_override",
          admin_id: gate.admin_user_id,
          target_membership_id: membership.id,
          target_user_id: membership.user_id,
          details: {},
          created_at: nowIso,
        });

      if (auditError) {
        console.warn(
          "⚠️ Failed to insert billing-day clear audit log. Non-fatal:",
          auditError?.message || auditError
        );
      }

      return NextResponse.json(
        {
          ok: true,
          membership_id: membership.id,
          desired_billing_day: null,
        },
        { status: 200 }
      );
    }

    const raw = body?.new_day ?? body?.day ?? body?.billing_day;
    const newDay = Number.parseInt(raw, 10);
    const notes = body?.notes ?? null;

    if (!Number.isFinite(newDay) || newDay < 1 || newDay > 28) {
      return NextResponse.json(
        {
          ok: false,
          error: "new_day must be an integer between 1 and 28.",
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
          desired_billing_day: newDay,
          notes,
          updated_by: gate.admin_user_id,
          updated_at: nowIso,
        },
        { onConflict: "membership_id" }
      );

    if (overrideError) {
      console.error("❌ Failed to save billing-day override:", overrideError);

      return NextResponse.json(
        { ok: false, error: "Failed to save override." },
        { status: 500 }
      );
    }

    const { error: auditError } = await supabaseAdmin
      .from("admin_audit_logs")
      .insert({
        action: "membership_change_billing_day",
        admin_id: gate.admin_user_id,
        target_membership_id: membership.id,
        target_user_id: membership.user_id,
        details: {
          new_day: newDay,
          notes,
        },
        created_at: nowIso,
      });

    if (auditError) {
      console.warn(
        "⚠️ Failed to insert billing-day change audit log. Non-fatal:",
        auditError?.message || auditError
      );
    }

    return NextResponse.json(
      {
        ok: true,
        membership_id: membership.id,
        desired_billing_day: newDay,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ change-billing-day route fatal error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Unexpected error changing billing day.",
      },
      { status: 500 }
    );
  }
}