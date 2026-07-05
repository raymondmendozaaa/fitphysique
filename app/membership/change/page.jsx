"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import withAuth from "@/lib/withAuth";
import { createStripeSession } from "@/lib/utils/stripeSession";
import {
  showError,
  showSuccess,
  showLoading,
  dismissToast,
} from "@/lib/utils/toastUtils";
import { fetchUserByIdClient } from "@/lib/queries/users.client";
import { groupPlanDurationsByName } from "@/lib/utils/planGrouping";
import { fetchAllPlanDurationsClient } from "@/lib/queries/planDurations.client";

const MembershipChange = ({ user }) => {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState("");
  const [selectedDurationId, setSelectedDurationId] = useState("");
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [loading, setLoading] = useState(false);
  const [plansWithDurations, setPlansWithDurations] = useState({});

  // 🔹 New: preferred location for metadata
  const [preferredLocationId, setPreferredLocationId] = useState(null);

  // Load plan durations
  useEffect(() => {
    const fetchDurations = async () => {
      try {
        const data = await fetchAllPlanDurationsClient();
        setPlansWithDurations(groupPlanDurationsByName(data || []));
      } catch (error) {
        console.error("[MembershipChange] Failed to load durations:", error);
        showError("Failed to load plan durations");
      }
    };

    fetchDurations();
  }, []);

  // 🔹 Load user preferred_location_id
  useEffect(() => {
    if (!user?.id) return;

    const fetchUserPrefs = async () => {
      try {
        const data = await fetchUserByIdClient(
          user.id,
          "preferred_location_id"
        );
        setPreferredLocationId(data?.preferred_location_id || null);
      } catch (error) {
        console.error("[MembershipChange] Failed to load user prefs:", error);
      }
    };

    fetchUserPrefs();
  }, [user]);

  const handlePlanChange = (plan) => {
    setSelectedPlan(plan);
    setSelectedDurationId("");
    setSelectedDuration(null);
  };

  const handleDurationChange = (e) => {
    const durationId = e.target.value;
    const duration = plansWithDurations[selectedPlan]?.find(
      (d) => d.id === durationId
    );
    setSelectedDurationId(durationId);
    setSelectedDuration(duration);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !selectedDuration) return;
    
    setLoading(true);
    const toastId = showLoading("Processing...");
    
    try {
      // If contract required, route to contract signing first (and include source + location)
      if (selectedDuration.requires_contract) {
        showSuccess("Redirecting to contract...", toastId);
        router.push(
          `/contract?user_id=${encodeURIComponent(user.id)}&plan_duration_id=${encodeURIComponent(selectedDuration.id)}&source=${encodeURIComponent("member:change-membership")}`
        );
        return;
      }
    
      const url = await createStripeSession({
        userId: user.id,
        planDurationId: selectedDuration.id,
        requiresContract: false,
        source: "member:change-membership",
        locationId: preferredLocationId || null,
        // If you later add toggles on this page, you’d pass:
        // paidInFull, autoRenewalEnabled, renewAtDiscountedRate, isRenewal
      });
    
      showSuccess("Redirecting to payment...", toastId);
      window.location.href = url;
    } catch (err) {
      console.error("Change Membership Error:", err);
      showError(err.message || "Something went wrong.", toastId);
    } finally {
      setLoading(false);
      dismissToast(toastId);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white px-4 py-16">
      <h1 className="text-3xl font-bold mb-4">Change Membership</h1>

      <p className="text-xs text-gray-500 text-center max-w-md mb-4">
        Billing, renewals, and access cutoffs are processed based on America/Chicago.
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
        <label className="block text-sm font-medium">
          Select Membership Plan
        </label>
        <select
          value={selectedPlan}
          onChange={(e) => handlePlanChange(e.target.value)}
          className="w-full bg-gray-800 p-3 rounded border border-gray-700"
        >
          <option value="">Select a Plan</option>
          {Object.keys(plansWithDurations).map((plan) => (
            <option key={plan} value={plan}>
              {plan}
            </option>
          ))}
        </select>

        {selectedPlan && (
          <>
            <label className="block text-sm font-medium">
              Select Duration
            </label>
            <select
              value={selectedDurationId}
              onChange={handleDurationChange}
              className="w-full bg-gray-800 p-3 rounded border border-gray-700"
            >
              <option value="">Select Duration</option>
              {plansWithDurations[selectedPlan]?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.duration_label}
                </option>
              ))}
            </select>
          </>
        )}

        {selectedDuration?.requires_contract && (
          <p className="text-xs text-yellow-400">
            This option requires signing a contract before checkout.
          </p>
        )}

        {selectedDuration && (
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm">
            <p>
              <span className="font-semibold">Selected:</span> {selectedPlan} — {selectedDuration.duration_label}
            </p>
            <p className="text-gray-400 mt-1">
              {selectedDuration.requires_contract
                ? "Requires contract before payment."
                : "No contract required."}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !selectedDurationId}
          className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-xl mt-4 disabled:opacity-50"
        >
          {loading ? "Processing..." : "Confirm Change"}
        </button>
      </form>
    </div>
  );
};

export default withAuth(MembershipChange, "member");