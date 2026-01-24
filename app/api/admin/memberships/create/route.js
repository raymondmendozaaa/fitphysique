export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { createMembershipUniversal } from "@/lib/admin/createMembershipUniversal";
import { createUserAdmin } from "@/lib/admin/createUserAdmin";

async function ensureAdmin(req) {
  // 1) If a Bearer token is present, build a Supabase client with that token
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  let supabase;

  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const access_token = authHeader.slice(7).trim();
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw Object.assign(
        new Error("Supabase env vars missing"),
        { status: 500 }
      );
    }
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        global: {
          headers: { Authorization: `Bearer ${access_token}` },
        },
      }
    );
  } else {
    // 2) Fallback to cookie-based session (auth-helpers)
    supabase = createRouteHandlerClient({ cookies });
  }

  const { data: { user }, error: uErr } = await supabase.auth.getUser();
  if (uErr) throw Object.assign(new Error(uErr.message), { status: 401 });
  if (!user) throw Object.assign(new Error("UNAUTHORIZED"), { status: 401 });

  const { data: profile, error: pErr } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (pErr) throw Object.assign(new Error(pErr.message), { status: 500 });
  if (profile?.role !== "admin") {
    throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
  }

  return { supabase, user };
}

export async function POST(req) {
  try {
    const { supabase }}await ensureAdmin(req);

    const payload = await req.json();
    const { userId: incomingUserId, planDurationId, paymentMode, newUser } = payload || {};

    if ((!incomingUserId && !newUser) || !planDurationId || !paymentMode) {
      return NextResponse.json(
        { ok: false, error: "BAD_REQUEST", message: "Need (userId OR newUser), planDurationId, paymentMode" },
        { status: 400 }
      );
    }

    // If admin picked "Create New User", create them first
    let userId = incomingUserId || null;
    if (!userId && newUser) {
      const created = await createUserAdmin({
        full_name: newUser.full_name,
        email: newUser.email,
        role: "member",
        sendInvite: false,
        tempPassword: undefined,
      });
      userId = created.id;
    }

    // ----- CONTRACT DETOUR (ADD THIS) -----
    // Only detour the 'checkout' path; offline stays in admin flow as-is
    if (paymentMode === "checkout") {
      // Do we have a contract for this duration?
      const { data: contracts, error: cErr } = await supabase
        .from("contracts")
        .select("id, version")
        .eq("plan_duration_id", planDurationId)
        .order("version", { ascending: false })
        .limit(1);
    
      if (cErr) {
        console.error("Contract lookup failed:", cErr);
      }
    
      const requiresContract = Array.isArray(contracts) && contracts.length > 0;
    
      if (requiresContract) {
        // Optional: fetch duration to compute a PIF hint for the contract page
        const { data: pd } = await supabase
          .from("plan_durations")
          .select("duration_label, paid_in_full_price")
          .eq("id", planDurationId)
          .single();
      
        const isPaidInFull =
          !!pd?.paid_in_full_price ||
          (pd?.duration_label || "").toLowerCase().includes("paid in full");
      
        const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
        const signUrl = `${base}/contracts?` + new URLSearchParams({
          user_id: userId,
          plan_duration_id: planDurationId,
          // pass through the admin UI flags so your contract page can keep them
          paid_in_full: String(isPaidInFull),
          auto_renewal_enabled: String(!!payload?.autoRenewalEnabled),
          renew_at_discounted_rate: String(
            !!payload?.autoRenewalEnabled && isPaidInFull && !!payload?.renewAtDiscountedRate
          ),
        }).toString();
      
        // Tell the admin UI to open the contract page first
        return NextResponse.json({ signUrl }, { status: 200 });
      }
    }
    // ----- END CONTRACT DETOUR -----

    const result = await createMembershipUniversal({ ...payload, userId });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const status = err?.status || 500;
    console.error("admin/memberships/create error:", err);
    return NextResponse.json(
      { ok: false, error: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "SERVER_ERROR", message: err?.message || "Unexpected error" },
      { status }
    );
  }
}