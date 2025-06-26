"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import withAuth from "@/lib/withAuth";
import { createStripeSession } from "@/lib/utils/stripeSession";
import { showError, showSuccess, showLoading, dismissToast } from "@/lib/utils/toastUtils";
import { supabase } from "@/lib/supabaseClient";
import { groupPlanDurationsByName } from "@/lib/utils/planGrouping";

const MembershipChange = ({ user }) => {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState("");
  const [selectedDurationId, setSelectedDurationId] = useState("");
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [loading, setLoading] = useState(false);
  const [plansWithDurations, setPlansWithDurations] = useState({});

  useEffect(() => {
    const fetchDurations = async () => {
      const { data, error } = await supabase
        .from("plan_durations")
        .select("id, plan_name, duration_label, requires_contract");

      if (error) {
        showError("Failed to load plan durations");
      } else {
        setPlansWithDurations(groupPlanDurationsByName(data));
      }
    };

    fetchDurations();
  }, []);

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

    if (duration?.requires_contract) {
      showSuccess("Note: This duration requires a contract.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !selectedDuration) return;

    setLoading(true);
    const toastId = showLoading("Processing...");

    try {
      if (selectedDuration.requires_contract) {
        showSuccess("Redirecting to contract...", toastId);
        router.push(`/contract?user_id=${user.id}&plan_duration_id=${selectedDuration.id}`);
        return;
      }

      const planKey = selectedDuration.plan_name.toUpperCase().replace(/\s/g, "_");
      const durationKey = selectedDuration.duration_label.toUpperCase().replace(/\s/g, "");

      const url = await createStripeSession({
        userId: user.id,
        planDurationId: selectedDuration.id,
        planKey,
        durationKey,
        requiresContract: selectedDuration.requires_contract || false,
      });

      showSuccess("Redirecting to payment...", toastId);
      window.location.href = url;
    } catch (err) {
      console.error("Change Membership Error:", err);
      showError(err.message || "Something went wrong.", toastId);
      setLoading(false);
    } finally {
      dismissToast(toastId);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white px-4 py-16">
      <h1 className="text-3xl font-bold mb-4">Change Membership</h1>

      <div className="w-full max-w-md space-y-4">
        <label className="block text-sm font-medium">Select Membership Plan</label>
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
            <label className="block text-sm font-medium">Select Duration</label>
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

        <button
          onClick={handleSubmit}
          disabled={loading || !selectedDurationId}
          className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-xl mt-4"
        >
          {loading ? "Processing..." : "Confirm Change"}
        </button>
      </div>
    </div>
  );
};

export default withAuth(MembershipChange, "member");