// app/api/admin/memberships/[membershipId]/pause/route.js
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchMembershipById } from "@/lib/db/memberships";
import { fetchUserRoleById } from "@/lib/db/users";
import {
  getNowUtcIso,
  getEndOfDayUtcIso,
} from "@/lib/utils/dateTime";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })
  : null;

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
    const untilStr = body?.until || null;
    const pauseBilling = !!body?.pause_billing;
    const notes = body?.notes ?? null;

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

    let pauseUntilIso = null;

    if (!isClear && untilStr) {
      pauseUntilIso = getEndOfDayUtcIso(untilStr);

      if (!pauseUntilIso) {
        return NextResponse.json(
          { ok: false, error: "Invalid 'until' date." },
          { status: 400 }
        );
      }
    }

    const { error: overrideError } = await supabaseAdmin
      .from("membership_overrides")
      .upsert(
        {
          membership_id: membership.id,
          user_id: membership.user_id,
          pause_until: isClear ? null : pauseUntilIso,
          notes,
          updated_by: gate.admin_user_id,
          updated_at: nowIso,
        },
        { onConflict: "membership_id" }
      );

    if (overrideError) {
      console.error("❌ Failed to save pause override:", overrideError);

      return NextResponse.json(
        { ok: false, error: "Failed to save override." },
        { status: 500 }
      );
    }

    if (stripe && membership.stripe_subscription_id) {
      try {
        if (isClear || !pauseBilling) {
          await stripe.subscriptions.update(membership.stripe_subscription_id, {
            pause_collection: null,
          });
        } else {
          await stripe.subscriptions.update(membership.stripe_subscription_id, {
            pause_collection: {
              behavior: "mark_uncollectible",
            },
          });
        }
      } catch (stripeError) {
        console.error("⚠️ Stripe pause/unpause failed. Non-fatal:", stripeError);
      }
    }

    const { error: auditError } = await supabaseAdmin
      .from("admin_audit_logs")
      .insert({
        action: isClear ? "membership_clear_pause" : "membership_pause",
        admin_id: gate.admin_user_id,
        target_membership_id: membership.id,
        target_user_id: membership.user_id,
        details: {
          pause_until: isClear ? null : pauseUntilIso,
          pause_billing: pauseBilling && !isClear,
          notes,
        },
        created_at: nowIso,
      });

    if (auditError) {
      console.warn(
        "⚠️ Failed to insert pause audit log. Non-fatal:",
        auditError?.message || auditError
      );
    }

    return NextResponse.json(
      {
        ok: true,
        membership_id: membership.id,
        pause_until: isClear ? null : pauseUntilIso,
        pause_billing: pauseBilling && !isClear,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ pause membership route fatal error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Unexpected error pausing membership.",
      },
      { status: 500 }
    );
  }
}