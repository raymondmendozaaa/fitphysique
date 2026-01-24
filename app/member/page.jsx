"use client";

import withAuth from "@/lib/withAuth";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchStripeSubscription } from "@/lib/helpers/fetchStripeSubscription";
import { handleCheckIn } from "@/lib/utils/checkIn";
import { showSuccess, showError } from "@/lib/utils/toastUtils";

const MemberDashboard = ({ user, role, profileUrl }) => {
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
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // 🔹 New: timezone + home gym label
  const [timezone, setTimezone] = useState("America/Chicago");
  const [homeLocationLabel, setHomeLocationLabel] = useState("");

  const fetchDetails = async () => {
    if (!user) return;

    // 1) Load user prefs (timezone + preferred_location_id)
    let memberTimezone = "America/Chicago";
    let homeLabel = "";

    try {
      const { data: userRow, error: userErr } = await supabase
        .from("users")
        .select("timezone, preferred_location_id")
        .eq("id", user.id)
        .maybeSingle();

      if (userErr) {
        console.error("❌ Error fetching user prefs:", userErr);
      }

      if (userRow) {
        if (userRow.timezone) {
          memberTimezone = userRow.timezone;
        }
        setTimezone(memberTimezone);

        if (userRow.preferred_location_id) {
          const { data: loc, error: locErr } = await supabase
            .from("locations")
            .select("name, city, state")
            .eq("id", userRow.preferred_location_id)
            .maybeSingle();

          if (locErr) {
            console.error("❌ Error fetching home location:", locErr);
          }

          if (loc) {
            homeLabel = `${loc.name}${
              loc.city ? ` — ${loc.city}` : ""
            }${loc.state ? `, ${loc.state}` : ""}`;
            setHomeLocationLabel(homeLabel);
          } else {
            setHomeLocationLabel("");
          }
        } else {
          setHomeLocationLabel("");
        }
      }
    } catch (err) {
      console.error("❌ Unexpected error loading user prefs:", err);
    }

    const dateFormatter = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: memberTimezone,
    });

    // 2) Fetch membership details
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

      // ✅ Contract End Date
      if (membershipData.contract_end_date) {
        const endDateRaw = new Date(membershipData.contract_end_date);
        const isValidDate =
          endDateRaw instanceof Date && !isNaN(endDateRaw.getTime());

        if (isValidDate) {
          setContractEndDate(dateFormatter.format(endDateRaw));
        } else {
          console.warn(
            "⚠️ Invalid contract_end_date:",
            membershipData.contract_end_date
          );
          setContractEndDate("N/A");
        }
      } else {
        setContractEndDate("N/A");
      }

      // ✅ Next Payment Date
      if (membershipData.next_payment_date) {
        const next = new Date(membershipData.next_payment_date);
        setNextPaymentDate(dateFormatter.format(next));
      } else {
        setNextPaymentDate("N/A");
      }

      // ✅ Promo display
      if (membershipData.promo_start_date && membershipData.promo_end_date) {
        const promoStart = new Date(membershipData.promo_start_date);
        const promoEnd = new Date(membershipData.promo_end_date);
        const promoDaysVal = Math.ceil(
          (promoEnd - promoStart) / (1000 * 60 * 60 * 24)
        );
        setPromoDays(promoDaysVal);
      } else {
        setPromoDays(null);
      }
    } else {
      // 3) Fallback: guest pass
      const { data: guestPass, error: guestError } = await supabase
        .from("guest_passes")
        .select("expires_at")
        .eq("user_id", user.id)
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (guestError && guestError.code !== "PGRST116") {
        console.error("❌ Error fetching guest pass:", guestError);
      }

      if (guestPass) {
        const expiresDate = new Date(guestPass.expires_at);
        const nowDate = new Date();
        const expired = expiresDate < nowDate;

        setIsExpired(expired);
        setCurrentPlan("Guest Pass");
        setHasActiveContract(false);
        setMembershipStatus(expired ? "expired" : "active");
        setContractEndDate(dateFormatter.format(expiresDate));
        setNextPaymentDate("N/A");
      } else {
        // 🚨 Neither membership nor guest pass found
        setIsExpired(true);
        setCurrentPlan("None");
        setHasActiveContract(false);
        setMembershipStatus("inactive");
        setContractEndDate("N/A");
        setNextPaymentDate("N/A");
      }
    }
  };

  // ✅ First: fetch membership/guest pass + prefs
  useEffect(() => {
    fetchDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ✅ Second: Optional Stripe fetch, using timezone
  useEffect(() => {
    if (!user || !stripeSubId) return;

    const fetchNextPaymentDate = async () => {
      const subscription = await fetchStripeSubscription(user.id);
      if (subscription?.current_period_end) {
        const next = new Date(subscription.current_period_end * 1000);
        const formatter = new Intl.DateTimeFormat("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: timezone || "America/Chicago",
        });
        setNextPaymentDate(formatter.format(next));
      }
    };

    fetchNextPaymentDate();
  }, [user, stripeSubId, timezone]);

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

  const onCheckInClick = async () => {
    if (isCheckingIn) return;
    setIsCheckingIn(true);
    try {
      await handleCheckIn(router);
    } finally {
      setIsCheckingIn(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white px-4 py-16">
      {/* Simple top nav / actions */}
      <div className="absolute top-4 right-4 flex items-center gap-3 text-sm">
        <span className="hidden sm:inline text-gray-300">
          Signed in as <span className="font-semibold">{user?.email}</span>
        </span>
        <Link
          href="/member/account"
          className="px-3 py-1 rounded-full border border-gray-600 bg-gray-800 hover:bg-gray-700 text-xs sm:text-sm"
        >
          Account Settings
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-center">
        Welcome to Your Dashboard
      </h1>
      <p className="mt-4 text-center">
        Logged in as: <span className="font-semibold">{user?.email}</span>
      </p>
      <p className="text-center">
        Role: <span className="font-semibold">{role}</span>
      </p>

      {homeLocationLabel && (
        <p className="mt-2 text-sm text-gray-300 text-center">
          Home Gym: <span className="font-semibold">{homeLocationLabel}</span>
        </p>
      )}

      {timezone && (
        <p className="mt-1 text-xs text-gray-400 text-center">
          Times shown in{" "}
          <span className="font-mono font-semibold">{timezone}</span>
        </p>
      )}

      <p className="mt-4">
        Membership Level:{" "}
        <span className="font-semibold text-accent">
          {isExpired ? "Expired" : currentPlan}
        </span>
      </p>

      {membershipStatus === "cancelled" && (
        <div className="mt-4 p-3 rounded bg-red-900 text-red-400 font-semibold transform transition-all duration-500 ease-out animate-fade-in-slide text-center">
          🚫 Membership cancellation is scheduled. You'll retain access until
          the end of your billing period.
        </div>
      )}

      {/* Contract-based display */}
      {hasActiveContract && (
        <>
          <p className="mt-2 text-sm text-green-400">
            📜 Contract Active Until:{" "}
            <span className="font-semibold">{contractEndDate || "N/A"}</span>
          </p>
          {nextPaymentDate && (
            <p className="mt-2 text-sm text-accent">
              💳 Next Payment Date:{" "}
              <span className="font-semibold">{nextPaymentDate}</span>
            </p>
          )}
        </>
      )}

      {/* Non-Contract or Guest Pass Display */}
      {!hasActiveContract && currentPlan === "Guest Pass" ? (
        <p className="mt-2">
          Valid Until:{" "}
          <span className="font-semibold text-accent">{contractEndDate}</span>
          <span className="text-sm text-muted ml-1"> (expires at 12 a.m.)</span>
        </p>
      ) : (
        !hasActiveContract && (
          <p className="mt-2">
            Next Payment Date:{" "}
            <span className="font-semibold text-accent">
              {nextPaymentDate || "N/A"}
            </span>
          </p>
        )
      )}

      {/* Promo Days Display */}
      {promoDays && promoDays > 0 && (
        <p className="mt-2 text-green-500 font-semibold">
          🎉 You received {promoDays} additional day(s) from your Guest Pass!
        </p>
      )}

      {hasActiveContract && !isExpired && (
        <p className="mt-2 text-sm text-yellow-400 italic text-center">
          You are currently under contract. Contact an admin to make changes.
        </p>
      )}

      {hasActiveContract && (
        <button
          className="mt-4 px-6 py-2 bg-yellow-600 hover:bg-yellow-700 rounded text-black font-semibold"
          onClick={() => router.push("/contract/view")}
        >
          View My Signed Contract
        </button>
      )}

      {/* Change Membership or Reactivate/Purchase Button */}
      {isExpired && currentPlan !== "Guest Pass" ? (
        <div className="mt-6 bg-red-800 p-4 rounded text-center">
          <p className="text-white font-semibold">
            ⚠️ Your membership expired on{" "}
            <span className="underline">{contractEndDate || "N/A"}</span>.
            Renew now to regain access.
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
              {isExpired
                ? "Reactivate or Purchase Full Membership"
                : "Purchase Full Membership"}
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

          {!hasActiveContract &&
            currentPlan !== "Guest Pass" &&
            membershipStatus !== "cancelled" && (
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
        onClick={onCheckInClick}
        disabled={isCheckingIn}
        className={`bg-green-500 hover:bg-green-600 text-white mt-4 px-6 py-3 rounded font-semibold ${
          isCheckingIn ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {isCheckingIn ? "Checking in..." : "Check In"}
      </button>

      <button
        className="mt-4 px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded font-semibold"
        onClick={() => router.push("/member/account")}
      >
        Account Settings
      </button>

      <button
        className={`mt-4 px-6 py-2 bg-gray-700 hover:bg-gray-800 rounded ${
          isLoggingOut ? "opacity-50 cursor-not-allowed" : ""
        }`}
        onClick={async () => {
          if (isLoggingOut) return;
          setIsLoggingOut(true);
          try {
            await supabase.auth.signOut();
            router.push("/auth/login");
          } catch (err) {
            console.error("Logout error:", err);
            showError("❌ Failed to logout.");
          } finally {
            setIsLoggingOut(false);
          }
        }}
        disabled={isLoggingOut}
      >
        {isLoggingOut ? "Logging out..." : "Logout"}
      </button>
    </div>
  );
};

export default withAuth(MemberDashboard, "member");