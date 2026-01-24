// app/api/onboarding/complete/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Verify the caller with their Bearer token, then update using service role.
export async function POST(req) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ message: "Missing auth token" }, { status: 401 });
    }

    // 1) Verify token → who is calling?
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return NextResponse.json({ message: "Invalid session" }, { status: 401 });
    }
    const userId = userData.user.id;

    // 2) Flip onboarded = true (and optional timestamp) with service role
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { error: upErr } = await admin
      .from("users")
      .update({ onboarded: true, onboarded_at: new Date().toISOString() }) 
      .eq("id", userId);

    if (upErr) {
      console.error("onboarding/complete update failed:", upErr);
      return NextResponse.json({ message: "Update failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("onboarding/complete error:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}