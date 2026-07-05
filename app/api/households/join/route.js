// app/api/households/join/route.js
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getNowUtcIso } from "@/lib/utils/dateTime";

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
    const { userId, token } = body;

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing invite token." },
        { status: 400 }
      );
    }

    const authenticatedUserId = gate.user_id;

    // Do not let the request body impersonate another member.
    if (userId && userId !== authenticatedUserId) {
      return NextResponse.json(
        { ok: false, error: "You cannot join a household for another user." },
        { status: 403 }
      );
    }

    const nowIso = getNowUtcIso();

    const { data, error } = await supabaseAdmin.rpc(
      "join_household_with_token",
      {
        p_token: token,
        p_user_id: authenticatedUserId,
        p_now: nowIso,
      }
    );

    if (error) {
      console.error("join_household_with_token error:", error);

      const message = error?.message || "";

      if (message.includes("INVALID_INVITE")) {
        return NextResponse.json(
          { ok: false, error: "Invalid invite link." },
          { status: 404 }
        );
      }

      if (message.includes("INVITE_EXPIRED")) {
        return NextResponse.json(
          { ok: false, error: "This invite link has expired." },
          { status: 400 }
        );
      }

      if (message.includes("INVITE_USED_UP")) {
        return NextResponse.json(
          { ok: false, error: "This invite can no longer be used." },
          { status: 400 }
        );
      }

      if (message.includes("USER_IN_DIFFERENT_HOUSEHOLD")) {
        return NextResponse.json(
          { ok: false, error: "User already belongs to a different household." },
          { status: 400 }
        );
      }

      if (message.includes("USER_ALREADY_IN_HOUSEHOLD")) {
        return NextResponse.json(
          { ok: false, error: "User already belongs to this household." },
          { status: 400 }
        );
      }

      if (message.includes("USER_UPDATE_FAILED")) {
        return NextResponse.json(
          { ok: false, error: "Could not update the user's household." },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { ok: false, error: "Failed to join household." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      householdMember: data?.[0] || null,
    });
  } catch (err) {
    console.error("household join error:", err);

    return NextResponse.json(
      { ok: false, error: "Unexpected error joining household." },
      { status: 500 }
    );
  }
}