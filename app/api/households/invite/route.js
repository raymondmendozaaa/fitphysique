// app/api/households/invite/route.js
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchUserHouseholdFieldsById } from "@/lib/db/users";
import { getNowUtcIso, addDaysToUtcIso } from "@/lib/utils/dateTime";

async function requireAuthenticatedUser(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Missing Authorization token.",
    };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user?.id) {
    return {
      ok: false,
      status: 401,
      error: "Invalid or expired session.",
    };
  }

  return {
    ok: true,
    user_id: data.user.id,
  };
}

function makeToken(length = 32) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const values = new Uint32Array(length);

  crypto.getRandomValues(values);

  let token = "";

  for (let i = 0; i < length; i++) {
    token += chars[values[i] % chars.length];
  }

  return token;
}

export async function POST(req) {
  try {
    const gate = await requireAuthenticatedUser(req);

    if (!gate.ok) {
      return NextResponse.json(
        { ok: false, error: gate.error },
        { status: gate.status }
      );
    }

    const body = await req.json().catch(() => ({}));

    const {
      userId,
      householdId,
      max_uses = 6,
      expires_in_days = 7,
    } = body;

    const authenticatedUserId = gate.user_id;

    // Do not let the request body impersonate another member.
    if (userId && userId !== authenticatedUserId) {
      return NextResponse.json(
        { ok: false, error: "You cannot create an invite for another user." },
        { status: 403 }
      );
    }

    let user = null;

    try {
      user = await fetchUserHouseholdFieldsById(
        supabaseAdmin,
        authenticatedUserId
      );
    } catch (userErr) {
      console.error("household invite user lookup error", userErr);

      return NextResponse.json(
        { ok: false, error: "Failed to load user." },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "User not found." },
        { status: 404 }
      );
    }

    if (!user.household_id) {
      return NextResponse.json(
        { ok: false, error: "User is not in a household." },
        { status: 400 }
      );
    }

    // Prevent creating invites for a different household.
    if (householdId && householdId !== user.household_id) {
      return NextResponse.json(
        { ok: false, error: "You cannot invite users to a different household." },
        { status: 403 }
      );
    }

    if (user.household_role !== "primary") {
      return NextResponse.json(
        { ok: false, error: "Only primary members can invite." },
        { status: 403 }
      );
    }

    const inviteDays = Number(expires_in_days);

    if (
      expires_in_days != null &&
      (!Number.isFinite(inviteDays) || inviteDays < 1 || inviteDays > 30)
    ) {
      return NextResponse.json(
        { ok: false, error: "expires_in_days must be between 1 and 30." },
        { status: 400 }
      );
    }

    const maxUses = Number(max_uses);

    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 20) {
      return NextResponse.json(
        { ok: false, error: "max_uses must be an integer between 1 and 20." },
        { status: 400 }
      );
    }

    const expires_at =
      expires_in_days != null
        ? addDaysToUtcIso(getNowUtcIso(), inviteDays)
        : null;

    if (expires_in_days != null && !expires_at) {
      return NextResponse.json(
        { ok: false, error: "Could not compute invite expiration." },
        { status: 400 }
      );
    }

    const token = makeToken(32);

    const { data: row, error: insertErr } = await supabaseAdmin
      .from("household_join_tokens")
      .insert({
        household_id: user.household_id,
        token,
        expires_at,
        max_uses: maxUses,
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

    const baseUrl =
      process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:3000";

    const joinUrl = `${baseUrl}/household/join?token=${encodeURIComponent(
      token
    )}`;

    return NextResponse.json({
      ok: true,
      token,
      joinUrl,
      invite: row,
    });
  } catch (err) {
    console.error("household invite error", err);

    return NextResponse.json(
      { ok: false, error: "Unexpected error creating invite." },
      { status: 500 }
    );
  }
}