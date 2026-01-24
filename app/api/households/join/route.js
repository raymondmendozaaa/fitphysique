// app/api/households/join/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const { userId, token } = await req.json();

    if (!userId || !token) {
      return NextResponse.json(
        { ok: false, error: "Missing userId or token." },
        { status: 400 }
      );
    }

    // lookup token
    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from("household_join_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (inviteErr || !invite) {
      return NextResponse.json(
        { ok: false, error: "Invalid invite link." },
        { status: 404 }
      );
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return NextResponse.json(
        { ok: false, error: "This invite link has expired." },
        { status: 400 }
      );
    }

    if (
      invite.max_uses != null &&
      invite.used_count >= invite.max_uses
    ) {
      return NextResponse.json(
        { ok: false, error: "This invite has already been used." },
        { status: 400 }
      );
    }

    // check if user is already in a household
    const { data: existingUser, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id, household_id, household_role")
      .eq("id", userId)
      .single();

    if (userErr || !existingUser) {
      return NextResponse.json(
        { ok: false, error: "User not found." },
        { status: 404 }
      );
    }

    if (existingUser.household_id && existingUser.household_id !== invite.household_id) {
      // later you can allow “move” with confirmation
      return NextResponse.json(
        { ok: false, error: "User already belongs to a different household." },
        { status: 400 }
      );
    }

    // upsert into household_members
    const { data: hmRow, error: hmErr } = await supabaseAdmin
      .from("household_members")
      .insert({
        household_id: invite.household_id,
        user_id: userId,
        role: existingUser.household_role || "dependent",
      })
      .select("*")
      .single();

    if (hmErr) {
      console.error("household_members insert error", hmErr);
      return NextResponse.json(
        { ok: false, error: "Failed to join household." },
        { status: 500 }
      );
    }

    // update users table current-state shortcuts
    const { error: updateUserErr } = await supabaseAdmin
      .from("users")
      .update({
        household_id: invite.household_id,
        household_role: existingUser.household_role || "dependent",
      })
      .eq("id", userId);

    if (updateUserErr) {
      console.error("users household update error", updateUserErr);
      return NextResponse.json(
        { ok: false, error: "Joined, but failed to update user." },
        { status: 500 }
      );
    }

    // bump used_count
    await supabaseAdmin
      .from("household_join_tokens")
      .update({ used_count: invite.used_count + 1 })
      .eq("id", invite.id);

    return NextResponse.json({ ok: true, householdMember: hmRow });
  } catch (err) {
    console.error("household join error", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected error joining household." },
      { status: 500 }
    );
  }
}