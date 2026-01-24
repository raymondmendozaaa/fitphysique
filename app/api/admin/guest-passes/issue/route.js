// app/api/guest-passes/issue/route.js
import { NextResponse } from "next/server";
import { supabaseAmin as supabase } from "@/lib/supabaseAdmin";

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const {
      user_id,
      duration_days = 1,
      location_id = null,
      is_promotional = false,
      pass_source = "admin",
      promo_start_date = null, // optional (YYYY-MM-DD or ISO)
      promo_end_date = null,   // optional (YYYY-MM-DD or ISO)
      notes = null,            // optional, for logs
    } = body || {};

    if (!user_id) {
      return NextResponse.json({ ok: false, error: "Missing user_id" }, { status: 400 });
    }

    const days = Math.max(1, Number(duration_days) || 1);

    // compute start/end (UTC). Your DB stores TIMESTAMP WITHOUT TZ; this will still be ISO.
    const start = new Date();
    const expires = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

    // Insert guest_pass
    const { data: pass, error: insertErr } = await supabase
      .from("guest_passes")
      .insert([
        {
          user_id,
          location_id,
          // start_date has a DEFAULT now() — we also set it explicitly for clarity:
          start_date: start.toISOString(),
          expires_at: expires.toISOString(),
          status: "active",
          is_promotional,
          promo_start_date: promo_start_date || null,
          promo_end_date: promo_end_date || null,
          pass_source,
          // stripe_session_id / stripe_payment_intent / payment_id left null for manual issue
        },
      ])
      .select("*")
      .single();

    if (insertErr) throw insertErr;

    // Log creation
    const { error: logErr } = await supabase.from("guest_passes_logs").insert([
      {
        guest_pass_id: pass.id,
        user_id,
        event_type: "created",
        description: `Guest pass issued (${days}-day)`,
        notes,
        expires_at: pass.expires_at,
        location_id,
        is_promotional,
        promo_start_date,
        promo_end_date,
        pass_source,
        // payment_id null for manual
      },
    ]);
    if (logErr) throw logErr;

    return NextResponse.json({ ok: true, guest_pass: pass });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to issue guest pass" },
      { status: 500 }
    );
  }
}