// ✅ Improved fetchCurrentContract
import { fetchMembershipPlanSummaryClient } from "@/lib/queries/memberships.client";

export async function fetchCurrentContract(userId) {
  if (!userId) throw new Error("User ID is required to fetch contract length");

  let planSummary = null;

  try {
    planSummary = await fetchMembershipPlanSummaryClient(userId);
  } catch (error) {
    console.error("❌ Error fetching contract length:", error);
    throw new Error("Failed to fetch contract length");
  }

  if (!planSummary) {
    throw new Error("Failed to fetch contract length");
  }

  return planSummary.plan_name || "None";