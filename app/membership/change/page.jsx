"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import withAuth from "@/lib/withAuth";
import { loadStripe } from "@stripe/stripe-js";
import { fetchCurrentContract } from "@/lib/helpers/fetchCurrentContract";
import { handleMembershipChange } from "@/lib/utils/handleMembershipChange";
import {
  showError,
  showSuccess,
  showLoading,
  dismissToast,
} from "@/lib/utils/toastUtils";
import { supabase } from "@/lib/supabaseClient";

const MembershipChange = ({ user, role, membership }) => {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState(membership);
  const [contractLength, setContractLength] = useState("");
  const [currentContractLength, setCurrentContractLength] = useState(null);
  const [loading, setLoading] = useState(false);
  const [plansWithDurations, setPlansWithDurations] = useState({});

  useEffect(() => {
    if (!user) return;

    const loadContract = async () => {
      const contract = await fetchCurrentContract(user.id);
      setCurrentContractLength(contract || "None");
    };

    loadContract();
  }, [user]);

  useEffect(() => {
    const fetchDurations = async () => {
      const { data, error } = await supabase
        .from("plan_durations")
        .select("id, plan_name, duration_label, requires_contract");

      if (!error) {
        const grouped = {};
        data.forEach((item) => {
          if (!grouped[item.plan_name]) grouped[item.plan_name] = [];
          grouped[item.plan_name].push(item);
        });
        setPlansWithDurations(grouped);
      } else {
        console.error("Failed to load durations", error.message);
      }
    };

    fetchDurations();
  }, []);

  if (!user || role !== "member") {
    return <p className="text-white text-center mt-8">Checking access...</p>;
  }

  const handleClick = async () => {
    const toastId = showLoading("Checking membership...");
    setLoading(true);
  
    try {
      // 1️⃣ Fetch plan_duration_id from Supabase
      const { data: durationData, error } = await supabase
        .from("plan_durations")
        .select("id, requires_contract")
        .eq("plan_name", selectedPlan)
        .eq("duration_label", contractLength)
        .single();
  
      if (error || !durationData) {
        throw new Error("Failed to retrieve plan duration data");
      }
  
      const requiresContract = durationData.requires_contract;
      const planDurationId = durationData.id;
  
      if (requiresContract) {
        dismissToast(toastId);
        showSuccess("Redirecting to contract...");
        router.push(`/contract?user_id=${user.id}&plan_duration_id=${planDurationId}`);
        return;
      }
  
      // 2️⃣ Proceed to Stripe checkout
      const result = await handleMembershipChange({
        userId: user.id,
        selectedPlan,
        contractLength,
      });
  
      dismissToast(toastId);
      setLoading(false);
  
      if (result.success) {
        showSuccess("Redirecting to payment...");
        const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY);
        await stripe.redirectToCheckout({ sessionId: result.sessionId });
      } else {
        showError(result.message || "Something went wrong.");
      }
    } catch (err) {
      dismissToast(toastId);
      setLoading(false);
      showError(err.message || "An error occurred.");
      console.error("Membership change error:", err);
    }
  };  

  const isButtonDisabled =
    (selectedPlan === membership && contractLength === currentContractLength) ||
    loading ||
    !selectedPlan ||
    (selectedPlan !== "Guest Pass" && !contractLength);

  const handlePlanChange = (plan) => {
    setSelectedPlan(plan);
    setContractLength(""); // reset when plan changes
  };

  const handleDurationChange = (e) => {
    const durationLabel = e.target.value;
    setContractLength(durationLabel);

    const selectedDuration = plansWithDurations[selectedPlan]?.find(
      (d) => d.duration_label === durationLabel
    );

    if (selectedDuration?.requires_contract) {
      showSuccess("Note: This duration requires a contract.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
      <h1 className="text-3xl font-bold">Change Membership</h1>
      <p className="mt-4">
        Current Plan: <span className="font-semibold text-accent">{membership || "Expired"}</span>
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {["Standard", "Ultimate", "Professional", "Guest Pass"].map((plan) => (
          <button
            key={plan}
            className={`px-6 py-2 rounded ${
              selectedPlan === plan ? "bg-green-500" : "bg-blue-600 hover:bg-blue-700"
            }`}
            onClick={() => handlePlanChange(plan)}
          >
            {plan}
          </button>
        ))}
      </div>

      {selectedPlan && selectedPlan !== "Guest Pass" && (
        <>
          <label className="text-sm mt-4">Choose Contract Length:</label>
          <select
            value={contractLength}
            onChange={handleDurationChange}
            className="p-2 bg-gray-700 rounded border border-gray-600 focus:outline-none mt-2"
          >
            <option value="">Select Duration</option>
            {plansWithDurations[selectedPlan]?.map((d) => (
              <option key={d.id} value={d.duration_label}>
                {d.duration_label}
              </option>
            ))}
          </select>
        </>
      )}

      <button
        className="mt-6 px-6 py-2 bg-yellow-500 hover:bg-yellow-600 rounded"
        onClick={handleClick}
        disabled={isButtonDisabled}
      >
        {loading ? "Updating..." : "Confirm Change"}
      </button>
    </div>
  );
};

export default withAuth(MembershipChange, "member");