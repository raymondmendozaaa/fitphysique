import { createServerClient } from "@supabase/ssr";
import { cookies as nextCookies } from "next/headers";
import { fetchAccessEligibleMembershipForUser } from "@/lib/db/memberships";
import { fetchActiveGuestPassForUser } from "@/lib/db/guestPasses";
import { getNowUtcIso, toUtcIso } from "@/lib/utils/dateTime";

// Defaults (used if a location doesn't have overrides set)
const DEFAULT_COOLDOWN_SECONDS = 120;
const DEFAULT_MAX_DISTANCE_METERS = 30;
const DEFAULT_MAX_ALLOWED_ACCURACY_METERS = 15;

export async function POST(req) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.split(" ")[1];

  if (!token) {
    return Response.json({ error: "Missing auth token." }, { status: 401 });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      cookies: {
        async get(name) {
          return (await nextCookies()).get(name)?.value;
        },
        async set(name, value, options) {
          (await nextCookies()).set(name, value, options);
        },
        async remove(name, options) {
          (await nextCookies()).delete(name, options);
        },
      },
    }
  );

  // Parse body
  let body;
  try {
    body = await req.json();
  } catch (e) {
    console.error("❌ Invalid JSON body:", e);
    return Response.json({ error: "Invalid JSON in request." }, { status: 400 });
  }

  // Method tag (informational)
  const method = body?.method || "geolocation";
  const allowedMethods = ["geolocation", "qr", "manual"];

  if (!allowedMethods.includes(method)) {
    return Response.json({ error: "Invalid check-in method." }, { status: 400 });
  }

  const { latitude, longitude, accuracy } = body;
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    typeof accuracy !== "number"
  ) {
    return Response.json({ error: "Missing or invalid coordinates or accuracy." }, { status: 400 });
  }
  // quick sanity bounds for lat/lng
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return Response.json({ error: "Coordinates out of range." }, { status: 400 });
  }

  // Auth
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Fetch locations (include overrides)
  const { data: locations, error: locError } = await supabase
    .from("locations")
    .select("id, name, latitude, longitude, geofence_radius_m, cooldown_seconds, max_accuracy_meters, conservative_geofence");
  if (locError || !locations) {
    console.error("Failed to fetch locations:", locError);
    return Response.json({ error: "Failed to fetch gym locations." }, { status: 500 });
  }
  if (!locations.length) {
    return Response.json({ error: "No gym locations configured." }, { status: 500 });
  }

  // Find nearest location
  let nearest = null;
  let minDistance = Infinity;
  for (const loc of locations) {
    if (loc.latitude == null || loc.longitude == null) continue;
    const distance = haversine(latitude, longitude, loc.latitude, loc.longitude);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = loc;
    }
  }
  if (!nearest) {
    return Response.json({ error: "No gym found nearby." }, { status: 403 });
  }
  minDistance = Math.max(minDistance, 0);

  // Effective per-location settings (with fallbacks)
  const MAX_DISTANCE_METERS = Number.isFinite(nearest.geofence_radius_m)
    ? nearest.geofence_radius_m
    : DEFAULT_MAX_DISTANCE_METERS;

  const COOLDOWN_SECONDS = Number.isFinite(nearest.cooldown_seconds)
    ? nearest.cooldown_seconds
    : DEFAULT_COOLDOWN_SECONDS;

  const ACCURACY_LIMIT_M = Number.isFinite(nearest.max_accuracy_meters)
    ? nearest.max_accuracy_meters
    : DEFAULT_MAX_ALLOWED_ACCURACY_METERS;

  const USE_CONSERVATIVE = !!nearest.conservative_geofence;

  // Accuracy gate
  if (accuracy > ACCURACY_LIMIT_M) {
    return Response.json(
      { error: `GPS accuracy too low (${accuracy.toFixed(0)}m). Min required: ${ACCURACY_LIMIT_M}m.` },
      { status: 422 }
    );
  }

  // Geofence gate (normal vs conservative)
  const insideNormal = minDistance <= MAX_DISTANCE_METERS;
  const insideConservative = minDistance + accuracy <= MAX_DISTANCE_METERS;
  const insideFence = USE_CONSERVATIVE ? insideConservative : insideNormal;
  if (!insideFence) {
    return Response.json(
      { error: `No gym found within ${MAX_DISTANCE_METERS} meters.` },
      { status: 403 }
    );
  }

  // Cooldown gate (per location)
  {
    const sinceIso = toUtcIso(Date.now() - COOLDOWN_SECONDS * 1000);
    const { data: recentCheckin, error: recentErr } = await supabase
      .from("checkins")
      .select("id, checkin_time")
      .eq("user_id", user.id)
      .eq("location_id", nearest.id)
      .gte("checkin_time", sinceIso)
      .order("checkin_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!recentErr && recentCheckin) {
      return Response.json(
        { error: "Please wait a moment before checking in again." },
        { status: 429 }
      );
    }
  }

  // Access gate (membership or guest pass) and capture IDs
  const { membershipId, guestPassId } = await getAccessContext(supabase, user.id);
  if (!membershipId && !guestPassId) {
    return Response.json(
      { error: "No access-eligible membership or valid guest pass found." },
      { status: 403 }
    );
  }

  const checkinTimeIso = getNowUtcIso();

  // Insert check-in
  const { error: checkinError } = await supabase.from("checkins").insert({
    user_id: user.id,
    location_id: nearest.id,
    checkin_time: checkinTimeIso,
    checkin_latitude: latitude,
    checkin_longitude: longitude,
    accuracy_meters: Math.round(accuracy * 100) / 100,
    distance_meters: Math.round(minDistance * 100) / 100,
    visit_duration_seconds: null,
    checkin_type: method,
    guest_pass_id: guestPassId || null,
    membership_id: membershipId || null, // keep if you added the column
    notes: null,
    strength_summary: null,
  });

  if (checkinError) {
    console.error("Failed to log check-in:", checkinError);
    return Response.json({ error: "Failed to log check-in." }, { status: 500 });
  }

  return Response.json({
    success: true,
    location: { id: nearest.id, name: nearest.name },
    distance: Math.round(minDistance * 100) / 100,
    // helpful debug echo
    applied: {
      geofence_radius_m: MAX_DISTANCE_METERS,
      cooldown_seconds: COOLDOWN_SECONDS,
      max_accuracy_meters: ACCURACY_LIMIT_M,
      conservative_geofence: USE_CONSERVATIVE,
      method,
    },
  });
}

// Distance (meters)
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Access context (returns IDs to attach to checkins)
async function getAccessContext(supabase, userId) {
  const membershipId = await getActiveMembershipId(supabase, userId);
  if (membershipId) return { membershipId, guestPassId: null };
  const guestPassId = await getAccessEligibleGuestPassId(supabase, userId);
  return { membershipId: null, guestPassId };
}

async function getActiveMembershipId(supabase, userId) {
  try {
    const membership = await fetchAccessEligibleMembershipForUser(supabase, userId);
    return membership?.id || null;
  } catch (error) {
    console.error("❌ Failed to fetch access-eligible membership:", error);
    return null;
  }
}

async function getAccessEligibleGuestPassId(supabase, userId) {
  try {
    const guestPass = await fetchActiveGuestPassForUser(supabase, userId);
    return guestPass?.id || null;
  } catch (error) {
    console.error("❌ Failed to fetch active guest pass:", error);
    return null;
  }
}