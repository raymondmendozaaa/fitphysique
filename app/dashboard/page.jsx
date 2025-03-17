"use client";

import withAuth from "@/lib/withAuth";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const MemberDashboard = ({ user, role, membership }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [hasActiveContract, setHasActiveContract] = useState(false);
  const [membershipExpiresOn, setMembershipExpiresOn] = useState("N/A");
  const [currentPlan, setCurrentPlan] = useState(membership);

  useEffect(() => {
    const fetchMembershipDetails = async () => {
      if (!user) return;

      const { data: membershipData, error } = await supabase
        .from("memberships")
        .select("plan, has_active_contract, next_bill_date, contract_end_date")
        .eq("user_id", user.id)
        .single();

      if (error || !membershipData) {
        console.warn("No membership found.");
        return;
      }

      setHasActiveContract(membershipData.has_active_contract);
      setCurrentPlan(membershipData.plan);

      // ✅ Determine Expiration Date
      let expirationDate = "N/A";
      if (membershipData.has_active_contract && membershipData.contract_end_date) {
        expirationDate = new Date(membershipData.contract_end_date).toLocaleDateString();
      } else if (!membershipData.has_active_contract && membershipData.next_bill_date) {
        expirationDate = new Date(membershipData.next_bill_date).toLocaleDateString();
      }

      setMembershipExpiresOn(expirationDate);
    };

    fetchMembershipDetails();
  }, [user]);

  const handleCancelMembership = async () => {
    if (hasActiveContract) {
      alert("You cannot cancel your membership while under contract. Please contact an admin.");
      return;
    }

    setLoading(true);

    const response = await fetch("/api/cancel-membership", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id }),
    });

    const data = await response.json();
    setLoading(false);

    if (response.ok) {
      alert("Membership canceled successfully.");
      router.push("/dashboard");
    } else {
      alert(data.error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
      <h1 className="text-3xl font-bold">Welcome to Your Dashboard</h1>
      <p className="mt-4">Logged in as: <span className="font-semibold">{user?.email}</span></p>
      <p>Role: <span className="font-semibold">{role}</span></p>
      <p className="mt-2">Membership Level: <span className="font-semibold text-accent">{currentPlan || "None"}</span></p>

      {/* Active Contract Status */}
      <p className="mt-2">
        <strong>Active Contract:</strong> 
        <span className={`font-semibold ${hasActiveContract ? "text-green-500" : "text-red-500"}`}>
          {hasActiveContract ? "Yes" : "No"}
        </span>
      </p>

      {/* Membership Expiration Date */}
      <p className="mt-2">
        <strong>Membership Expires On:</strong> 
        <span className="font-semibold text-accent">{membershipExpiresOn}</span>
      </p>

      {/* Change Membership Button (Disabled for Contracts) */}
      {!hasActiveContract && (
        <button
          className="mt-8 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded"
          onClick={() => router.push("/membership/change")}
        >
          Change Membership
        </button>
      )}

      {/* Cancel Membership Button (Disabled for Contracts) */}
      {!hasActiveContract && (
        <button
          className="mt-4 px-6 py-2 bg-red-600 hover:bg-red-700 rounded"
          onClick={handleCancelMembership}
          disabled={loading}
        >
          {loading ? "Processing..." : "Cancel Membership"}
        </button>
      )}

      {/* Logout Button */}
      <button
        className="mt-4 px-6 py-2 bg-gray-700 hover:bg-gray-800 rounded"
        onClick={async () => {
          await supabase.auth.signOut();
          router.push("/auth/login");
        }}
      >
        Logout
      </button>
    </div>
  );
};

export default withAuth(MemberDashboard, "member");