// app/api/households/invite/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// tiny random token helper
function makeToken(length = 32) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function POST(req) {
  try {
    const { userId, householdId, max_uses = 6, expires_in_days = 7 } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Missing userId" },
        { status: 400 }
      );
    }

    // fetch user to ensure they have a household + are primary/billing owner
    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id, household_id, household_role")
      .eq("id", userId)
      .single();

    if (userErr || !user) {
      return NextResponse.json(
        { ok: false, error: "User not found" },
        { status: 404 }
      );
    }

    const targetHouseholdId = householdId || user.household_id;
    if (!targetHouseholdId) {
      return NextResponse.json(
        { ok: false, error: "User is not in a household." },
        { status: 400 }
      );
    }

    if (user.household_role !== "primary") {
      // you can relax this later if you want dependents to invite too
      return NextResponse.json(
        { ok: false, error: "Only primary members can invite." },
        { status: 403 }
      );
    }

    const token = makeToken(32);

    const expires_at =
      expires_in_days != null
        ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString()
        : null;

    const { data: row, error: insertErr } = await supabaseAdmin
      .from("household_join_tokens")
      .insert({
        household_id: targetHouseholdId,
        token,
        expires_at,
        max_uses,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (insertErr) {
      console.error("household invite insert error", insertErr);
      return NextResponse.json(
        { ok: false, error: "Failed to create invite." },
        { status: 500 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const joinUrl = `${baseUrl}/household/join?token=${encodeURIComponent(token)}`;

    return NextResponse.json({ ok: true, token, joinUrl, invite: row });
  } catch (err) {
    console.error("household invite error", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected error creating invite." },
      { status: 500 }
    );
  }
}