// app/api/admin/memberships/cancel/route.js

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cancelMembership } from "@/lib/helpers/cancelMembership";

export const dynamic = "force-dynamic";

function json(payload, status = 200) {
  return NextResponse.json(payload, { status });
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );` `
}

async function getAdminUserFromRequest(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return {
      errorResponse: json({ ok: false, error: "Unauthorized." }, 401),
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return {
      errorResponse: json({ ok: false, error: "Unauthorized." }, 401),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("users")
    .select("id, role, email")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("❌ Failed to verify admin role:", profileError);
    return {
      errorResponse: json({ ok: false, error: "Failed to verify admin role." }, 500),
    };
  }

  if (profile?.role !== "admin") {
    return {
      errorResponse: json({ ok: false, error: "Forbidden." }, 403),
    };
  }

  return { adminUser: user, adminProfile: profile };
}

export async function POST(req) {
  try {
    const { adminUser, errorResponse } = await getAdminUserFromRequest(req);

    if (errorResponse) return errorResponse;

    const body = await req.json().catch(() => ({}));

    const userId =
      typeof body?.userId === "string" ? body.userId.trim() : "";

    const membershipId =
      typeof body?.membershipId === "string" ? body.membershipId.trim() : "";

    const cancellationReason =
      typeof body?.cancellationReason === "string" &&
      body.cancellationReason.trim()
        ? body.cancellationReason.trim()
        : null;

    if (!isUuid(userId)) {
      return json({ ok: false, error: "Invalid userId." }, 400);
    }

    if (!isUuid(membershipId)) {
      return json({ ok: false, error: "Invalid membershipId." }, 400);
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("memberships")
      .select("id, user_id, status")
      .eq("id", membershipId)
      .eq("user_id", userId)
      .maybeSingle();

    if (membershipError) {
      console.error("❌ Failed to load membership for admin cancellation:", membershipError);
      return json({ ok: false, error: "Failed to load membership." }, 500);
    }

    if (!membership) {
      return json({ ok: false, error: "Membership not found." }, 404);
    }

    const currentStatus = String(membership.status || "").toLowerCase();

    if (currentStatus === "cancelled") {
      return json({
        ok: true,
        alreadyCancelled: true,
        message: "Membership already cancelled.",
      });
    }

    if (currentStatus !== "active") {
      return json(
        {
          ok: false,
          error: `Only active memberships can be cancelled from this action. Current status: ${membership.status || "unknown"}.`,
        },
        409
      );
    }

    const result = await cancelMembership(userId, {
      cancelledByUserId: adminUser.id,
      cancelledByRole: "admin",
      cancellationReason,
    });

    if (!result.success) {
      return json(
        {
          ok: false,
          error: result.message || "Cancellation failed.",
          alreadyCancelled: !!result.alreadyCancelled,
        },
        result.alreadyCancelled ? 200 : 500
      );
    }

    return json({
      ok: true,
      alreadyCancelled: !!result.alreadyCancelled,
      message:
        result.message ||
        "Membership will not renew. Access remains through the current access period.",
    });
  } catch (error) {
    console.error("❌ /api/admin/memberships/cancel error:", error);

    return json(
      {
        ok: false,
        error: "Unexpected server error.",
      },
      500
    );
  }
}