"use client";

import withAuth from "@/lib/withAuth";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchStripeSubscription } from "@/lib/helpers/fetchStripeSubscription";
import { showSuccess, showError } from "@/lib/utils/toastUtils";

const MemberDashboard = ({ user, role }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [hasActiveContract, setHasActiveContract] = useState(false);
  const [contractEndDate, setContractEndDate] = useState("N/A");
  const [nextPaymentDate, setNextPaymentDate] = useState("N/A");
  const [currentPlan, setCurrentPlan] = useState("None");
  const [isExpired, setIsExpired] = useState(false);
  const [membershipStatus, setMembershipStatus] = useState("active");
  const [stripeSubId, setStripeSubId] = useState(null);
  const [promoDays, setPromoDays] = useState(null);
  const [autoRenewalEnabled, setAutoRenewalEnabled] = useState(false);

  const fetchDetails = async () => {
    if (!user) return;
    
    // Fetch membership details with contract_end_date and next_payment_date
    const { data: membershipData, error: membershipError } = await supabase
      .from("memberships")
      .select(`
        status,
        contract_end_date,
        next_payment_date,
        stripe_subscription_id,
        promo_start_date,
        promo_end_date,
        auto_renewal_enabled,
        plan_duration:plan_durations (
          plan_name,
          requires_contract
        )
      `)
      .eq("user_id", user.id)
      .maybeSingle();
      
    if (membershipError) {
      console.error("❌ Error fetching membership:", membershipError);
    }
    if (membershipData) {
      const planName = membershipData?.plan_duration?.plan_name || "None";
      const hasContract = !!membershipData?.plan_duration?.requires_contract;
      const subId = membershipData?.stripe_subscription_id || null;
      setMembershipStatus(membershipData.status || "unknown");
      setAutoRenewalEnabled(!!membershipData.auto_renewal_enabled);
      setCurrentPlan(planName);
      setHasActiveContract(hasContract);
      setStripeSubId(subId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // ✅ Set Contract End Date (for contract members)
      if (membershipData.contract_end_date) {
        const endDateRaw = new Date(membershipData.contract_end_date);
        const isValidDate = endDateRaw instanceof Date && !isNaN(endDateRaw);

        if (isValidDate) {
          setContractEndDate(endDateRaw.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }));
        } else {
          console.warn("⚠️ Invalid contract_end_date:", membershipData.contract_end_date);
          setContractEndDate("N/A");
        }
      } else {
        setContractEndDate("N/A");
      }

      // ✅ Set Next Payment Date (for subscription members)
      if (membershipData.next_payment_date) {
        setNextPaymentDate(new Date(membershipData.next_payment_date).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }));
      } else {
        setNextPaymentDate("N/A");
      }

      // ✅ Display Promotional Period (if exists)
      if (membershipData.promo_start_date && membershipData.promo_end_date) {
        const promoStart = new Date(membershipData.promo_start_date);
        const promoEnd = new Date(membershipData.promo_end_date);
        const promoDays = Math.ceil((promoEnd - promoStart) / (1000 * 60 * 60 * 24));
        setPromoDays(promoDays);
      } else {
        setPromoDays(null);
      }
    }
  };
  
  // ✅ First: Fetch membership details or guest pass fallback
  useEffect(() => {
    fetchDetails();
  }, [user]);

  // ✅ Second: Optional Stripe fetch
  useEffect(() => {
    if (!user || !stripeSubId) return;

    const fetchNextPaymentDate = async () => {
      const subscription = await fetchStripeSubscription(user.id);
      if (subscription?.current_period_end) {
        const next = new Date(subscription.current_period_end * 1000);
        setNextPaymentDate(next.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }));
      }
    };

    fetchNextPaymentDate();
  }, [user, stripeSubId]);

  const handleCancelMembership = async () => {
    if (hasActiveContract) {
      showError("You cannot cancel while under contract. Contact an admin.");
      return;
    }

    const confirmed = confirm(
      "Are you sure you want to cancel your membership? You’ll still have access until the end of your billing period."
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch("/api/membership/cancel", {
        method: "POST",
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancellation failed");

      showSuccess("✅ Membership cancellation scheduled.");
      await fetchDetails();
    } catch (err) {
      showError(err.message || "❌ Something went wrong.");
    } finally {
      setLoading(false);
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
          {isExpired ? "Expired" : currentPlan}
        </span>
      </p>
      {membershipStatus === "cancelled" && (
        <div
          className="mt-4 p-3 rounded bg-red-900 text-red-400 font-semibold transform transition-all duration-500 ease-out animate-fade-in-slide"
        >
          🚫 Membership cancellation is scheduled. You'll retain access until the end of your billing period.
        </div>
      )}
      {/* ✅ Contract-Based Display */}
      {hasActiveContract && (
        <>
          <p className="mt-2 text-sm text-green-400">
            📜 Contract Active Until: <span className="font-semibold">{contractEndDate || "N/A"}</span>
          </p>
          {nextPaymentDate && (
            <p className="mt-2 text-sm text-accent">
              💳 Next Payment Date: <span className="font-semibold">{nextPaymentDate}</span>
            </p>
          )}
        </>
      )}
  
      {/* ✅ Non-Contract or Guest Pass Display */}
      {!hasActiveContract && currentPlan === "Guest Pass" ? (
        <p className="mt-2">
          Valid Until:{" "}
          <span className="font-semibold text-accent">
            {contractEndDate}
          </span>
          <span className="text-sm text-muted ml-1"> (expires at midnight)</span>
        </p>
      ) : !hasActiveContract && (
        <p className="mt-2">
          Next Payment Date:{" "}
          <span className="font-semibold text-accent">
            {nextPaymentDate || "N/A"}
          </span>
        </p>
      )}
    
      {/* ✅ Promo Days Display */}
      {promoDays && promoDays > 0 && (
        <p className="mt-2 text-green-500 font-semibold">
          🎉 You received {promoDays} additional day(s) from your Guest Pass!
        </p>
      )}
  
      {hasActiveContract && !isExpired && (
        <p className="mt-2 text-sm text-yellow-400 italic">
          You are currently under contract. Contact an admin to make changes.
        </p>
      )}
  
      {/* ✅ Change Membership or Reactivate/Purchase Button */}
      {isExpired && currentPlan !== "Guest Pass" ? (
        <div className="mt-6 bg-red-800 p-4 rounded text-center">
          <p className="text-white font-semibold">
            ⚠️ Your membership expired on <span className="underline">{contractEndDate || "N/A"}</span>. Renew now to regain access.
          </p>
          <button
            className="mt-4 px-6 py-2 bg-yellow-500 hover:bg-yellow-600 rounded"
            onClick={() => router.push("/membership/change")}
          >
            Renew Membership
          </button>
        </div>
      ) : (
        <>
          {currentPlan === "Guest Pass" ? (
            <button
              className="mt-8 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded"
              onClick={() => router.push("/membership/change")}
            >
              {isExpired ? "Reactivate or Purchase Full Membership" : "Purchase Full Membership"}
            </button>
          ) : (
            !hasActiveContract && (
              <button
                className="mt-8 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                onClick={() => router.push("/membership/change")}
              >
                Change Membership
              </button>
            )
          )}
  
          {/* ✅ Cancel Button only for Non-Guest, Non-Contract Users */}
          {!hasActiveContract && currentPlan !== "Guest Pass" && membershipStatus !== "cancelled" && (
            <button
              className="mt-4 px-6 py-2 bg-red-600 hover:bg-red-700 rounded"
              onClick={handleCancelMembership}
              disabled={loading}
            >
              {loading ? "Processing..." : "Cancel Membership"}
            </button>
          )}
        </>
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
  )
};

export default withAuth(MemberDashboard, "member");