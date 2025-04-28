"use client";

<<<<<<< HEAD
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
=======
import withAuth from "@/lib/withAuth";
import { useState } from "react";
import { useRouter } from "next/navigation";
>>>>>>> a13871cbcb0587d21345b91f28863c3e4151a8e6
import { supabase } from "@/lib/supabaseClient";

const MembershipChange = ({ user, role, membership }) => {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState(membership);
<<<<<<< HEAD
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
=======
  const [contractLength, setContractLength] = useState("Monthly"); // ✅ Fixed: Now properly defined
  const [loading, setLoading] = useState(false);
>>>>>>> a13871cbcb0587d21345b91f28863c3e4151a8e6

  if (!user || role !== "member") {
    return <p className="text-white text-center mt-8">Checking access...</p>;
  }

<<<<<<< HEAD
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

=======
  const handleMembershipChange = async () => {
    if (!selectedPlan || selectedPlan === membership) {
      console.warn("No membership change detected.");
      return;
    }
  
    setLoading(true);
    console.log(`Attempting to change membership to: ${selectedPlan} (${contractLength})`);
  
    // 🔹 **Fetch user's current membership details**
    const { data: currentMembership, error: fetchError } = await supabase
      .from("memberships")
      .select("contract_length, has_active_contract")
      .eq("user_id", user.id)
      .single();
  
    if (fetchError) {
      console.error("Error fetching current membership:", fetchError.message);
      setLoading(false);
      return;
    }
  
    // 🔹 Restrict contract users from switching early
    if (currentMembership?.has_active_contract) {
      alert("You cannot change your membership while under contract. Please wait until your contract expires or contact an admin.");
      setLoading(false);
      return;
    }
  
    // 🔹 Convert contract length to months
    const contractLengthMap = {
      "Monthly": 1,
      "3-Month": 3,
      "6-Month": 6,
      "Yearly": 12,
    };
    const contractMonths = contractLengthMap[contractLength] || null;
  
    let newHasActiveContract = false;
    let newNextBillDate = null;
  
    if (contractMonths && contractMonths > 1) {
      // **Contracts are locked in**
      newHasActiveContract = true;
    } else if (selectedPlan === "Monthly") {
      // **Monthly users get a next bill date**
      newNextBillDate = new Date(new Date().setMonth(new Date().getMonth() + 1))
        .toISOString()
        .split("T")[0];
    }
  
    try {
      // 🔹 **Update Membership**
      const { data, error } = await supabase
        .from("memberships")
        .update({
          plan: selectedPlan,
          contract_length: contractMonths,
          has_active_contract: newHasActiveContract, // ✅ Show "Active Contract: Yes" if contract
          next_bill_date: newNextBillDate, // ✅ Show next bill date if Monthly
          inactive_since: null, // ✅ Reset inactive status when user resubscribes
        })
        .eq("user_id", user.id)
        .select();
  
      if (error) throw error;
  
      console.log("Membership updated successfully:", data);
      alert(`Membership changed to ${selectedPlan} (${contractLength})!`);
      router.push("/dashboard");
    } catch (error) {
      console.error("Error updating membership:", error.message);
      alert("Failed to update membership.");
    } finally {
      setLoading(false);
    }
  };  

>>>>>>> a13871cbcb0587d21345b91f28863c3e4151a8e6
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
      <h1 className="text-3xl font-bold">Change Membership</h1>
      <p className="mt-4">
<<<<<<< HEAD
        Current Plan: <span className="font-semibold text-accent">{membership || "Expired"}</span>
      </p>

=======
        Current Plan: <span className="font-semibold text-accent">{membership}</span>
      </p>

      {/* Membership Options */}
>>>>>>> a13871cbcb0587d21345b91f28863c3e4151a8e6
      <div className="mt-6 flex flex-col gap-4">
        {["Standard", "Ultimate", "Professional", "Guest Pass"].map((plan) => (
          <button
            key={plan}
            className={`px-6 py-2 rounded ${
              selectedPlan === plan ? "bg-green-500" : "bg-blue-600 hover:bg-blue-700"
            }`}
<<<<<<< HEAD
            onClick={() => handlePlanChange(plan)}
=======
            onClick={() => setSelectedPlan(plan)}
>>>>>>> a13871cbcb0587d21345b91f28863c3e4151a8e6
          >
            {plan}
          </button>
        ))}
      </div>

<<<<<<< HEAD
      {selectedPlan && selectedPlan !== "Guest Pass" && (
=======
      {/* Show Contract Length only if NOT Guest Pass */}
      {selectedPlan !== "Guest Pass" && (
>>>>>>> a13871cbcb0587d21345b91f28863c3e4151a8e6
        <>
          <label className="text-sm mt-4">Choose Contract Length:</label>
          <select
            value={contractLength}
<<<<<<< HEAD
            onChange={handleDurationChange}
            className="p-2 bg-gray-700 rounded border border-gray-600 focus:outline-none mt-2"
          >
            <option value="">Select Duration</option>
            {plansWithDurations[selectedPlan]?.map((d) => (
              <option key={d.id} value={d.duration_label}>
                {d.duration_label}
              </option>
            ))}
=======
            onChange={(e) => setContractLength(e.target.value)}
            className="p-2 bg-gray-700 rounded border border-gray-600 focus:outline-none mt-2"
          >
            <option value="Monthly">Monthly</option>
            <option value="3-Month">3-Month</option>
            <option value="6-Month">6-Month</option>
            <option value="Yearly">Yearly</option>
>>>>>>> a13871cbcb0587d21345b91f28863c3e4151a8e6
          </select>
        </>
      )}

<<<<<<< HEAD
      <button
        className="mt-6 px-6 py-2 bg-yellow-500 hover:bg-yellow-600 rounded"
        onClick={handleClick}
        disabled={isButtonDisabled}
=======
      {/* Confirm Button */}
      <button
        className="mt-6 px-6 py-2 bg-yellow-500 hover:bg-yellow-600 rounded"
        onClick={handleMembershipChange}
        disabled={selectedPlan === membership || loading}
>>>>>>> a13871cbcb0587d21345b91f28863c3e4151a8e6
      >
        {loading ? "Updating..." : "Confirm Change"}
      </button>
    </div>
  );
};

export default withAuth(MembershipChange, "member");