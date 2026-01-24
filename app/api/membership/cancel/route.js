import { NextResponse } from "next/server";
import { cancelMembership } from "@/lib/helpers/cancelMembership";

export async function POST(req) {
const { userId, cancelledByUserId, cancelledByRole, cancellationReason } = await req.json();

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const result = await cancelMembership(userId, {
    cancelledByUserId,
    cancelledByRole,
    cancellationReason,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Membership cancelled successfully" });
}