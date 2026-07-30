"use client";

import withAuth from "@/lib/withAuth";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchUserByIdClient } from "@/lib/queries/users.client";
import { fetchStripeSubscription } from "@/lib/helpers/fetchStripeSubscription";
import { fetchMembershipEntitlementClient } from "@/lib/queries/memberships.client";
import { handleCheckIn } from "@/lib/utils/checkIn";
import { showSuccess, showError } from "@/lib/utils/toastUtils";
import { 
  APP_TIMEZONE, 
  formatDateInTimeZone, 
  getNowUtcIso,
  toValidDate
} from "@/lib/utils/dateTime";

const MemberDashboard = ({ user, role, profileUrl }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [hasActiveContract, setHasActiveContract] = useState(false);
  const [contractEndDateValue, setContractEndDateValue] = useState(null);
  const [nextPaymentDateValue, setNextPaymentDateValue] = useState(null);
  const [graceEndsAtValue, setGraceEndsAtValue] = useState(null);
  const [cancelReasonValue, setCancelReasonValue] = useState(null);
  const [currentPlan, setCurrentPlan] = useState("None");
  const [isExpired, setIsExpired] = useState(false);
  const [membershipStatus, setMembershipStatus] = useState("inactive");
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
      const userRow = await fetchUserByIdClient(
        user.id,
        "timezone, preferred_location_id"
      );

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

    // 2) Fetch membership details
    let membershipData = null;
    let latestMembership = null;
    let guestPass = null;

    try {
      const entitlement = await fetchMembershipEntitlementClient(user.id);
      membershipData = entitlement.membership;
      latestMembership = entitlement.latestMembership;
      guestPass = entitlement.guestPass;
    } catch (membershipError) {
      console.error("❌ Error fetching membership entitlement:", membershipError);
    }

    if (membershipData) {
      const planName = membershipData?.plan_duration?.plan_name || "None";
      const hasContract = !!membershipData?.plan_duration?.requires_contract;
      const subId = membershipData?.stripe_subscription_id || null;

      setIsExpired(false);
      setMembershipStatus(membershipData.status || "unknown");
      setAutoRenewalEnabled(!!membershipData.auto_renewal_enabled);
      setCurrentPlan(planName);
      setHasActiveContract(hasContract);
      setStripeSubId(subId);
      setCancelReasonValue(membershipData.cancel_reason || null);

      // ✅ Contract End Date
      const contractEndDate = toValidDate(membershipData.contract_end_date);

      if (membershipData.contract_end_date && !contractEndDate) {
        console.warn(
          "⚠️ Invalid contract_end_date:",
          membershipData.contract_end_date
        );
      }
      
      setContractEndDateValue(contractEndDate);
      setGraceEndsAtValue(toValidDate(membershipData.grace_ends_at));

      // ✅ Next Payment Date
      setNextPaymentDateValue(toValidDate(membershipData.next_payment_date));

      // ✅ Promo display
      const promoStart = toValidDate(membershipData.promo_start_date);
      const promoEnd = toValidDate(membershipData.promo_end_date);
          
      if (promoStart && promoEnd) {
        const promoDaysVal = Math.ceil(
          (promoEnd.getTime() - promoStart.getTime()) / (1000 * 60 * 60 * 24)
        );
      
        setPromoDays(Math.max(0, promoDaysVal));
      } else {
        setPromoDays(null);
      }
    } else if (guestPass) {
      const expiresDate = toValidDate(guestPass.expires_at);
      const nowDate = toValidDate(getNowUtcIso());
      const expired =
        !expiresDate || !nowDate || expiresDate.getTime() < nowDate.getTime();

      setIsExpired(expired);
      setCurrentPlan("Guest Pass");
      setHasActiveContract(false);
      setMembershipStatus(expired ? "expired" : "active");
      setContractEndDateValue(expiresDate);
      setGraceEndsAtValue(null);
      setNextPaymentDateValue(null);
      setStripeSubId(null);
      setAutoRenewalEnabled(false);
      setCancelReasonValue(null);
    } else if (latestMembership) {
      const latestStatus = String(latestMembership.status || "").toLowerCase();
      const latestExpiresAt = toValidDate(latestMembership.expires_at);
      const latestGraceEndsAt = toValidDate(latestMembership.grace_ends_at);
      const nowDate = toValidDate(getNowUtcIso());

      const isActuallyExpired =
        latestStatus === "expired" ||
        latestStatus === "terminated" ||
        latestStatus === "suspended" ||
        (!!latestExpiresAt &&
          !!nowDate &&
          latestExpiresAt.getTime() <= nowDate.getTime());

      setIsExpired(!!isActuallyExpired);
      setCurrentPlan(latestMembership?.plan_duration?.plan_name || "None");
      setHasActiveContract(!!latestMembership?.plan_duration?.requires_contract);
      setMembershipStatus(latestMembership.status || "inactive");
      setContractEndDateValue(latestExpiresAt || null);
      setGraceEndsAtValue(latestGraceEndsAt || null);
      setNextPaymentDateValue(null);
      setStripeSubId(null);
      setAutoRenewalEnabled(!!latestMembership.auto_renewal_enabled);
      setCancelReasonValue(latestMembership.cancel_reason || null);
    } else {
      setIsExpired(true);
      setCurrentPlan("None");
      setHasActiveContract(false);
      setMembershipStatus("inactive");
      setContractEndDateValue(null);
      setGraceEndsAtValue(null);
      setNextPaymentDateValue(null);
      setStripeSubId(null);
      setAutoRenewalEnabled(false);
      setCancelReasonValue(null);
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
        const next = toValidDate(subscription.current_period_end * 1000);
        setNextPaymentDateValue(next);
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
      "Are you sure you want to cancel your membership? You’ll keep access until your current access period ends."
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch("/api/membership/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancellation failed");

      showSuccess("✅ Your membership will not renew. Access remains until your current access period ends.");
      await fetchDetails();
    } catch (err) {
      showError(err.message || "❌ Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const formattedContractEndDate = contractEndDateValue
    ? formatDateInTimeZone(contractEndDateValue, timezone || APP_TIMEZONE)
    : "N/A";

  const formattedMembershipEndDate = contractEndDateValue
    ? formatDateInTimeZone(contractEndDateValue, timezone || APP_TIMEZONE)
    : "N/A";

  const formattedGraceEndsAt = graceEndsAtValue
    ? formatDateInTimeZone(graceEndsAtValue, timezone || APP_TIMEZONE)
    : "N/A";

  const formattedNextPaymentDate = nextPaymentDateValue
    ? formatDateInTimeZone(nextPaymentDateValue, timezone || APP_TIMEZONE)
    : "N/A";

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

      <p className="mt-1 text-xs text-gray-500 text-center">
        Billing, renewals, and access cutoffs are based on{" "}
        <span className="font-mono font-semibold">{APP_TIMEZONE}</span>.
      </p>

      <p className="mt-4">
        Membership Level:{" "}
        <span className="font-semibold text-accent">
          {isExpired ? "Expired" : currentPlan}
        </span>
      </p>

      {membershipStatus === "cancelled" && !isExpired && (
        <div className="mt-4 p-3 rounded bg-yellow-900/40 text-yellow-300 border border-yellow-700 font-semibold text-center">
          ⚠️ Your membership will not renew. Access remains until{" "}
          <span className="underline">
            {graceEndsAtValue ? formattedGraceEndsAt : formattedContractEndDate}
          </span>.

          {cancelReasonValue && (
            <div className="mt-2 text-xs text-yellow-200/80 font-normal">
              Reason: {cancelReasonValue}
            </div>
          )}
        </div>
      )}

      {/* Contract-based display */}
      {hasActiveContract && (
        <>
          <p className="mt-2 text-sm text-green-400">
            📜 Contract Active Until:{" "}
            <span className="font-semibold">{formattedContractEndDate}</span>
          </p>
          {graceEndsAtValue && (
            <p className="mt-2 text-sm text-yellow-300">
              ⏳ Grace Period Ends:{" "}
              <span className="font-semibold">{formattedGraceEndsAt}</span>
            </p>
          )}
          {nextPaymentDateValue && (
            <p className="mt-2 text-sm text-accent">
              💳 Next Payment Date:{" "}
              <span className="font-semibold">{formattedNextPaymentDate}</span>
            </p>
          )}
          {currentPlan !== "None" && currentPlan !== "Guest Pass" && (
            <p className="mt-2 text-sm text-gray-300">
              Auto-Renew:{" "}
              <span className="font-semibold">
                {autoRenewalEnabled ? "Enabled" : "Disabled"}
              </span>
            </p>
          )}
        </>
      )}

      {/* Non-Contract or Guest Pass Display */}
      {!hasActiveContract && currentPlan === "Guest Pass" ? (
        <p className="mt-2">
          Valid Until:{" "}
          <span className="font-semibold text-accent">
            {formattedContractEndDate}
          </span>
          <span className="text-sm text-muted ml-1">
            {" "}
            (cutoff based on {APP_TIMEZONE})
          </span>
        </p>
      ) : (
        !hasActiveContract && (
          <>
            <p className="mt-2">
              {membershipStatus === "cancelled" ? "Access Until:" : "Next Payment Date:"}{" "}
              <span className="font-semibold text-accent">
                {membershipStatus === "cancelled"
                  ? graceEndsAtValue
                    ? formattedGraceEndsAt
                    : formattedContractEndDate
                  : formattedNextPaymentDate}
              </span>
            </p>
                
            {currentPlan !== "Guest Pass" && graceEndsAtValue && (
              <p className="mt-2 text-sm text-yellow-300">
                ⏳ Grace Period Ends:{" "}
                <span className="font-semibold">{formattedGraceEndsAt}</span>
              </p>
            )}
          </>
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
            ⚠️ Your membership ended on{" "}
            <span className="underline">{formattedMembershipEndDate}</span>
            {graceEndsAtValue && (
              <>
                {" "}
                and your grace period ended on{" "}
                <span className="underline">{formattedGraceEndsAt}</span>
              </>
            )}
            . Renew now to regain access.
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