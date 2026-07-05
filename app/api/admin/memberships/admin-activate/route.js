// app/api/admin/memberships/admin-activate/route.js
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createMembershipUniversal } from "@/lib/admin/createMembershipUniversal";
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

export async function POST(req) {
  if (process.env.VERCEL_ENV === "preview") {
    return NextResponse.json(
      { ok: false, error: "Admin API disabled in Preview" },
      { status: 403 }
    );
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

    const {
      user_id,
      plan_duration_id,
      auto_renewal_enabled,
      renew_at_discounted_rate,
      source,
      payment,
    } = body;

    if (!user_id || !plan_duration_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "user_id and plan_duration_id are required.",
        },
        { status: 400 }
      );
    }

    const nowIso = getNowUtcIso();

    const result = await createMembershipUniversal({
      userId: user_id,
      planDurationId: plan_duration_id,
      autoRenewalEnabled: !!auto_renewal_enabled,
      renewAtDiscountedRate: !!renew_at_discounted_rate,
      isRenewal: false,
      startDate: nowIso,
      locationId: null,
        
      paymentMode: payment ? "direct" : "comped",
        
      offlinePayment: payment
        ? {
            amount: Number(payment.amount_cents ?? 0) / 100,
            method: payment.method || "cash",
            notes: payment.description || "Manual activation payment",
          }
        : {
            amount: 0,
            method: "comped",
            notes: "Comped manual activation",
          },
        
      createdBy: {
        role: "admin",
        id: gate.admin_user_id,
      },
    
      source: source || "admin-manual",
    });

    return NextResponse.json(
      {
        ok: true,
        membership_id: result?.membershipId || null,
        mode: "upserted",
        payment_recorded: !!payment,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ admin-activate route fatal error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Unexpected error activating membership.",
      },
      { status: 500 }
    );
  }
}