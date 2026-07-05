import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function requireAdmin(req) {
  const authHeader =
    req.headers.get("authorization") || req.headers.get("Authorization");

  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return { error: "Missing bearer token", status: 401 };
  }

  const access_token = authHeader.slice(7).trim();

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    return { error: "Unauthorized", status: 401 };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return { error: "Failed to verify admin", status: 500 };
  }

  if (!profile || profile.role !== "admin") {
    return { error: "Forbidden", status: 403 };
  }

  return { user };
}

export async function PATCH(req, { params }) {
  try {
    const adminCheck = await requireAdmin(req);
    if (adminCheck.error) {
      return NextResponse.json(
        { message: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const { id } = params;
    const body = await req.json();
    let {
      name = "",
      address = "",
      city = "",
      state = "",
      zip_code = "",
      latitude = null,
      longitude = null,
      geofence_radius_m = 30,
      cooldown_seconds = 120,
      max_accuracy_meters = 15,
      conservative_geofence = false,
    } = body || {};

    name = String(name).trim();
    address = String(address).trim();
    city = String(city).trim();
    state = String(state).trim().toUpperCase();
    zip_code = String(zip_code).trim();

    if (!name || !address) {
      return NextResponse.json({ message: "Name and address are required." }, { status: 400 });
    }
    if (state && !/^[A-Z]{2}$/.test(state)) {
      return NextResponse.json({ message: "State must be a 2-letter code (e.g., TX)." }, { status: 400 });
    }
    if (zip_code && !/^\d{5}(-\d{4})?$/.test(zip_code)) {
      return NextResponse.json({ message: "ZIP must be 5 digits (optionally ZIP+4)." }, { status: 400 });
    }
    if (latitude != null) {
      const lat = Number(latitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        return NextResponse.json({ message: "Latitude must be between -90 and 90." }, { status: 400 });
      }
      latitude = lat;
    }
    if (longitude != null) {
      const lng = Number(longitude);
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        return NextResponse.json({ message: "Longitude must be between -180 and 180." }, { status: 400 });
      }
      longitude = lng;
    }

    const geofenceRadiusNum = Number(geofence_radius_m);
    const cooldownSecondsNum = Number(cooldown_seconds);
    const maxAccuracyMetersNum = Number(max_accuracy_meters);

    if (!Number.isFinite(geofenceRadiusNum) || geofenceRadiusNum <= 0 || geofenceRadiusNum > 500) {
      return NextResponse.json(
        { message: "Geofence radius must be between 1 and 500." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(cooldownSecondsNum) || cooldownSecondsNum < 0 || cooldownSecondsNum > 86400) {
      return NextResponse.json(
        { message: "Cooldown seconds must be between 0 and 86400." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(maxAccuracyMetersNum) || maxAccuracyMetersNum <= 0 || maxAccuracyMetersNum > 200) {
      return NextResponse.json(
        { message: "Max accuracy meters must be between 1 and 200." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("locations")
      .update({
        name,
        address,
        city,
        state,
        zip_code,
        latitude,
        longitude,
        geofence_radius_m: geofenceRadiusNum,
        cooldown_seconds: cooldownSecondsNum,
        max_accuracy_meters: maxAccuracyMetersNum,
        conservative_geofence: !!conservative_geofence,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(error);
      return NextResponse.json({ message: error.message || "Failed to update location." }, { status: 500 });
    }

    return NextResponse.json({ location: data }, { status: 200 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ message: "Unexpected error" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const adminCheck = await requireAdmin(req);
    if (adminCheck.error) {
      return NextResponse.json(
        { message: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { message: "Location id is required." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("locations")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      return NextResponse.json(
        { message: error.message || "Failed to delete location." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { message: "Unexpected error" },
      { status: 500 }
    );
  }
}