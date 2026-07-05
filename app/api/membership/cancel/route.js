// app/api/membership/cancel/route.js
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies as nextCookies } from "next/headers";
import { cancelMembership } from "@/lib/helpers/cancelMembership";

export async function POST(req) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          async get(name) {
            return (await nextCookies()).get(name)?.value;
          },
          async set() {},
          async remove() {},
        },
      }
    );

    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const cancellationReason =
      typeof body?.cancellationReason === "string"
        ? body.cancellationReason.trim()
        : null;

    const result = await cancelMembership(authUser.id, {
      cancelledByUserId: authUser.id,
      cancelledByRole: "member",
      cancellationReason,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.message || "Cancellation failed." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message:
        result.message ||
        "Membership will not renew. Access remains through the current access period.",
      alreadyCancelled: !!result.alreadyCancelled,
    });
  } catch (error) {
    console.error("❌ membership/cancel route error:", error);

    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}