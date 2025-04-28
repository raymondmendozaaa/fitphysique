"use client";

import withAuth from "@/lib/withAuth";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchStripeSubscription } from "@/lib/helpers/fetchStripeSubscription"; // ✅ added this

const MemberDashboard = ({ user, role, membership }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [hasActiveContract, setHasActiveContract] = useState(false);
  const [membershipExpiresOn, setMembershipExpiresOn] = useState("N/A");
  const [currentPlan, setCurrentPlan] = useState("None");
  const [isExpired, setIsExpired] = useState(false);

  // ✅ First: Fetch membership details (Supabase)
  useEffect(() => {
    const fetchMembershipDetails = async () => {
      if (!user) return;

      const { data: membershipData, error } = await supabase
        .from("memberships")
        .select(`
          status,
          expires_at,
          plan_durations (
            plan_name,
            requires_contract
          )
        `)
        .eq("user_id", user.id)
        .single();

      if (error || !membershipData) {
        console.warn("No membership found.");
        return;
      }

      const planName = membershipData?.plan_durations?.plan_name || "None";
      const hasContract = !!membershipData?.plan_durations?.requires_contract;

      setCurrentPlan(planName);
      setHasActiveContract(hasContract);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let expirationDate = "N/A";
      let expired = false;
      const isGuestPass = membershipData.plan_durations?.plan_name === "Guest-Pass";
      const gracePeriodDays = isGuestPass ? 0 : 3;

      if (membershipData.expires_at) {
        const expiresAtDate = new Date(`${membershipData.expires_at}T00:00:00Z`);
        const localExpirationDate = new Date(expiresAtDate.getTime() + expiresAtDate.getTimezoneOffset() * 60000);

        const gracePeriodEnd = new Date(localExpirationDate);
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);

        if (gracePeriodDays === 0 && localExpirationDate <= today) {
          expired = true;
        } else if (gracePeriodEnd < today) {
          expired = true;
        }

        expirationDate = localExpirationDate.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }

      setMembershipExpiresOn(expirationDate);
      setIsExpired(expired);
    };

    fetchMembershipDetails();
  }, [user]);

  // ✅ Second: Try to overwrite with real Stripe next payment (optional)
  useEffect(() => {
    const fetchNextPaymentDate = async () => {
      if (!user) return;

      const subscription = await fetchStripeSubscription(user.id);

      if (subscription?.current_period_end) {
        const nextPaymentDate = new Date(subscription.current_period_end * 1000); // Stripe uses seconds
        console.log("✅ Stripe next payment:", nextPaymentDate.toISOString());

        setMembershipExpiresOn(nextPaymentDate.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }));
      }
    };

    fetchNextPaymentDate();
  }, [user]);

  useEffect(() => {
    if (isExpired) {
      console.log("User has an expired membership. Showing renewal button.");
    }
  }, [isExpired]);

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
      <p className="mt-2">
        Membership Level:{" "}
        <span className="font-semibold text-accent">
          {isExpired ? "Expired" : currentPlan || "None"}
        </span>
      </p>
      <p className="mt-2">
        Next Payment Date:{" "}
        <span className="font-semibold text-accent">
          {membershipExpiresOn}
        </span>
      </p>

      {hasActiveContract && !isExpired && (
        <p className="mt-2 text-sm text-yellow-400 italic">
          You are currently under contract. Contact an admin to make changes.
        </p>
      )}

      {/* Membership Actions */}
      {isExpired ? (
        <div className="mt-6 bg-red-800 p-4 rounded text-center">
          <p className="text-white font-semibold">
            ⚠️ Your membership expired on <span className="underline">{membershipExpiresOn}</span>. Renew now to regain access.
          </p>
          <button
            className="mt-4 px-6 py-2 bg-yellow-500 hover:bg-yellow-600 rounded"
            onClick={() => router.push("/membership/change")}
          >
            Renew Membership
          </button>
        </div>
      ) : (
        !hasActiveContract && (
          <>
            <button
              className="mt-8 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded"
              onClick={() => router.push("/membership/change")}
            >
              Change Membership
            </button>

            <button
              className="mt-4 px-6 py-2 bg-red-600 hover:bg-red-700 rounded"
              onClick={handleCancelMembership}
              disabled={loading}
            >
              {loading ? "Processing..." : "Cancel Membership"}
            </button>
          </>
        )
      )}

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