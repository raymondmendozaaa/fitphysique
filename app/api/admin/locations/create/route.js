import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req) {
  try {
    const body = await req.json();
    let {
      name = "",
      address = "",
      city = "",
      state = "",
      zip_code = "",
      latitude = null,
      longitude = null,
    } = body || {};

    // Normalize
    name = String(name).trim();
    address = String(address).trim();
    city = String(city).trim();
    state = String(state).trim().toUpperCase();
    zip_code = String(zip_code).trim();

    // Validate
    if (!name || !address) {
      return NextResponse.json(
        { message: "Name and address are required." },
        { status: 400 }
      );
    }
    if (state && !/^[A-Z]{2}$/.test(state)) {
      return NextResponse.json(
        { message: "State must be a 2-letter code (e.g., TX)." },
        { status: 400 }
      );
    }
    if (zip_code && !/^\d{5}(-\d{4})?$/.test(zip_code)) {
      return NextResponse.json(
        { message: "ZIP must be 5 digits (optionally ZIP+4)." },
        { status: 400 }
      );
    }
    if (latitude != null) {
      const lat = Number(latitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        return NextResponse.json(
          { message: "Latitude must be between -90 and 90." },
          { status: 400 }
        );
      }
      latitude = lat;
    }
    if (longitude != null) {
      const lng = Number(longitude);
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        return NextResponse.json(
          { message: "Longitude must be between -180 and 180." },
          { status: 400 }
        );
      }
      longitude = lng;
    }

    const { data, error } = await supabase
      .from("locations")
      .insert([{ name, address, city, state, zip_code, latitude, longitude }])
      .select()
      .single();

    if (error) {
      console.error(error);
      return NextResponse.json({ message: error.message || "Failed to create location." }, { status: 500 });
    }

    return NextResponse.json({ location: data }, { status: 200 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ message: "Unexpected error" }, { status: 500 });
  }
}