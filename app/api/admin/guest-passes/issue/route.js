// app/api/admin/guest-passes/issue/route.js
import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { upsertGuestPassForUser } from "@/lib/db/guestPasses";
import { logGuestPassEvent } from "@/lib/helpers/logGuestPassEvent";
import { computeGuestPassExpiry } from "@/lib/time/expiry";
import { fetchUserRoleById } from "@/lib/db/users";
import { getNowUtcIso, toUtcIso } from "@/lib/utils/dateTime";

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

  const { data: auth, error: authErr } = await supabase.auth.getUser(token);

  if (authErr || !auth?.user?.id) {
    return {
      ok: false,
      status: 401,
      error: "Invalid or expired token.",
    };
  }

  let adminUser = null;

  try {
    adminUser = await fetchUserRoleById(supabase, auth.user.id);
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

    const {
      user_id,
      duration_days = 1,
      location_id = null,
      is_promotional = false,
      pass_source = "admin",
      promo_start_date = null,
      promo_end_date = null,
      notes = null,
    } = body || {};

    if (!user_id) {
      return NextResponse.json(
        { ok: false, error: "Missing user_id" },
        { status: 400 }
      );
    }

    const days = Math.max(1, Number(duration_days) || 1);
    const startIso = getNowUtcIso();

    const expiresAt = computeGuestPassExpiry({
      startDate: startIso,
      durationDays: days,
    });

    const expiresAtIso = toUtcIso(expiresAt);

    if (!expiresAtIso) {
      return NextResponse.json(
        { ok: false, error: "Could not compute guest pass expiration." },
        { status: 400 }
      );
    }

    const pass = await upsertGuestPassForUser(supabase, {
      user_id,
      location_id,
      start_date: startIso,
      expires_at: expiresAtIso,
      status: "active",
      is_promotional,
      promo_start_date: toUtcIso(promo_start_date),
      promo_end_date: toUtcIso(promo_end_date),
      pass_source,
      stripe_session_id: null,
      stripe_payment_intent: null,
      payment_id: null,
    });

    if (!pass?.id) {
      return NextResponse.json(
        { ok: false, error: "Guest pass was not created." },
        { status: 500 }
      );
    }

    await logGuestPassEvent({
      userId: user_id,
      guest_pass_id: pass.id,
      eventType: "issued",
      locationId: location_id,
      expiresAt: expiresAtIso,
      notes,
      description: `Guest pass issued (${days}-day) by admin ${gate.admin_user_id}`,
      pass_source,
      payment_id: null,
    });

    return NextResponse.json({ ok: true, guest_pass: pass });
  } catch (e) {
    console.error("❌ Failed to issue guest pass:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to issue guest pass" },
      { status: 500 }
    );
  }
}