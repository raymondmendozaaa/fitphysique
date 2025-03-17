"use client";

import withAuth from "@/lib/withAuth";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const MembershipChange = ({ user, role, membership }) => {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState(membership);
  const [contractLength, setContractLength] = useState("Monthly"); // ✅ Fixed: Now properly defined
  const [loading, setLoading] = useState(false);

  if (!user || role !== "member") {
    return <p className="text-white text-center mt-8">Checking access...</p>;
  }

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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
      <h1 className="text-3xl font-bold">Change Membership</h1>
      <p className="mt-4">
        Current Plan: <span className="font-semibold text-accent">{membership}</span>
      </p>

      {/* Membership Options */}
      <div className="mt-6 flex flex-col gap-4">
        {["Standard", "Ultimate", "Professional", "Guest Pass"].map((plan) => (
          <button
            key={plan}
            className={`px-6 py-2 rounded ${
              selectedPlan === plan ? "bg-green-500" : "bg-blue-600 hover:bg-blue-700"
            }`}
            onClick={() => setSelectedPlan(plan)}
          >
            {plan}
          </button>
        ))}
      </div>

      {/* Show Contract Length only if NOT Guest Pass */}
      {selectedPlan !== "Guest Pass" && (
        <>
          <label className="text-sm mt-4">Choose Contract Length:</label>
          <select
            value={contractLength}
            onChange={(e) => setContractLength(e.target.value)}
            className="p-2 bg-gray-700 rounded border border-gray-600 focus:outline-none mt-2"
          >
            <option value="Monthly">Monthly</option>
            <option value="3-Month">3-Month</option>
            <option value="6-Month">6-Month</option>
            <option value="Yearly">Yearly</option>
          </select>
        </>
      )}

      {/* Confirm Button */}
      <button
        className="mt-6 px-6 py-2 bg-yellow-500 hover:bg-yellow-600 rounded"
        onClick={handleMembershipChange}
        disabled={selectedPlan === membership || loading}
      >
        {loading ? "Updating..." : "Confirm Change"}
      </button>
    </div>
  );
};

export default withAuth(MembershipChange, "member");