// app/api/admin/checkins/route.js

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getStartOfDayUtcIso,
  getStartOfNextDayUtcIso,
} from "@/lib/utils/dateTime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHECKINS_SELECT = `
  id,
  checkin_time,
  user_id,
  full_name,
  email,
  location_id,
  location_name,
  geofence_radius_m,
  cooldown_seconds,
  max_accuracy_meters,
  conservative_geofence,
  checkin_type,
  distance_meters,
  accuracy_meters,
  guest_pass_id,
  membership_id,
  membership_status,
  membership_expires_at
`;

const ALLOWED_METHODS = new Set(["geolocation", "qr", "manual"]);

function json(payload, status = 200) {
  return NextResponse.json(payload, { status });
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

function isDateInput(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function normalizeSearch(value) {
  return String(value || "")
    .trim()
    .slice(0, 100)
    .replace(/[^a-zA-Z0-9@._+\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
      errorResponse: json(
        { ok: false, error: "Failed to verify admin role." },
        500
      ),
    };
  }

  if (profile?.role !== "admin") {
    return {
      errorResponse: json({ ok: false, error: "Forbidden." }, 403),
    };
  }

  return { adminUser: user, adminProfile: profile };
}

export async function GET(req) {
  try {
    const { errorResponse } = await getAdminUserFromRequest(req);
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(req.url);

    const start = searchParams.get("start")?.trim() || "";
    const end = searchParams.get("end")?.trim() || "";
    const locationId = searchParams.get("locationId")?.trim() || "";
    const method = searchParams.get("method")?.trim() || "";
    const search = normalizeSearch(searchParams.get("search"));

    if (start && !isDateInput(start)) {
      return json({ ok: false, error: "Invalid start date." }, 400);
    }

    if (end && !isDateInput(end)) {
      return json({ ok: false, error: "Invalid end date." }, 400);
    }

    if (start && end && start > end) {
      return json(
        { ok: false, error: "Start date cannot be after end date." },
        400
      );
    }

    if (locationId && !isUuid(locationId)) {
      return json({ ok: false, error: "Invalid locationId." }, 400);
    }

    if (method && !ALLOWED_METHODS.has(method)) {
      return json({ ok: false, error: "Invalid check-in method." }, 400);
    }

    const { data: locations, error: locationsError } = await supabaseAdmin
      .from("locations")
      .select("id, name")
      .order("name", { ascending: true });

    if (locationsError) {
      console.error("❌ Failed to load check-in locations:", locationsError);
      return json({ ok: false, error: "Failed to load locations." }, 500);
    }

    const startUtc = start ? getStartOfDayUtcIso(start) : null;
    const endUtcExclusive = end ? getStartOfNextDayUtcIso(end) : null;

    let query = supabaseAdmin
      .from("v_checkins_enriched")
      .select(CHECKINS_SELECT)
      .order("checkin_time", { ascending: false })
      .limit(1000);

    if (startUtc) query = query.gte("checkin_time", startUtc);
    if (endUtcExclusive) query = query.lt("checkin_time", endUtcExclusive);
    if (locationId) query = query.eq("location_id", locationId);
    if (method) query = query.eq("checkin_type", method);

    if (search) {
      const term = `*${search}*`;
      query = query.or(`full_name.ilike.${term},email.ilike.${term}`);
    }

    const { data: rows, error: rowsError } = await query;

    if (rowsError) {
      console.error("❌ Failed to load check-ins:", rowsError);
      return json({ ok: false, error: "Failed to load check-ins." }, 500);
    }

    return json({
      ok: true,
      locations: locations || [],
      rows: rows || [],
      meta: {
        maxRows: 1000,
      },
    });
  } catch (error) {
    console.error("❌ /api/admin/checkins error:", error);

    return json(
      {
        ok: false,
        error: "Unexpected server error.",
      },
      500
    );
  }
}