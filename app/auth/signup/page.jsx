"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { upsertUserClient } from "@/lib/queries/users.client";
import { createStripeSession } from "@/lib/utils/stripeSession";
import { groupPlanDurationsByName } from "@/lib/utils/planGrouping";
import { showError, showSuccess, showLoading, dismissToast } from "@/lib/utils/toastUtils";
import { fetchAllPlanDurationsClient } from "@/lib/queries/planDurations.client";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const [plansByName, setPlansByName] = useState({});
  const [selectedPlan, setSelectedPlan] = useState("");
  const [selectedDurationId, setSelectedDurationId] = useState("");
  const [selectedDuration, setSelectedDuration] = useState(null);

  const [autoRenewal, setAutoRenewal] = useState(false);
  const [renewAtDiscountedRate, setRenewAtDiscountedRate] = useState(false);
  const [loading, setLoading] = useState(false);

  // derived
  const isGuestPass = useMemo(() => {
    const n = selectedDuration?.plan_name || "";
    return n === "Guest-Pass" || n.startsWith("Guest Pass");
  }, [selectedDuration]);

  const isPaidInFull = useMemo(() => {
    const label = (selectedDuration?.duration_label || "").toLowerCase();
    return label.includes("paid in full") || label.includes("paid-in-full") || label.includes("pif");
  }, [selectedDuration]);

  useEffect(() => {
    const loadDurations = async () => {
      try {
        const data = await fetchAllPlanDurationsClient();
        setPlansByName(groupPlanDurationsByName(data || []));
      } catch (error) {
        console.error(error);
        showError("Failed to load plans");
      }
    };

    loadDurations();
  }, []);

  useEffect(() => {
    if (!selectedPlan || !selectedDurationId) {
      setSelectedDuration(null);
      return;
    }
    const d = (plansByName[selectedPlan] || []).find((x) => x.id === selectedDurationId);
    setSelectedDuration(d || null);
  }, [plansByName, selectedPlan, selectedDurationId]);

  const handleSignup = async (e) => {
    e.preventDefault();

    if (!selectedPlan || !selectedDurationId) {
      showError("Please choose a plan and duration.");
      return;
    }

    setLoading(true);
    const toastId = showLoading("Creating your account...");

    try {
      // 1) Create auth user
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName }, // metadata in auth
        },
      });
      if (error) throw error;
      const authUser = data?.user;
      if (!authUser?.id) throw new Error("Sign up succeeded but no user was returned.");

      // 2) Ensure row in public.users
      try {
        await upsertUserClient({
          id: authUser.id,
          email,
          full_name: fullName,
          role: "member",
          onboarded: false, // new users start not onboarded
        });
      } catch (upsertUserErr) {
        throw upsertUserErr;
      }

      // 3) If the duration requires a contract, go to /contract first
      if (selectedDuration?.requires_contract) {
        dismissToast(toastId);
        showSuccess("Almost there—please sign the contract.");
        const qs = new URLSearchParams({
          user_id: authUser.id,
          plan_duration_id: selectedDuration.id,
          paid_in_full: String(isPaidInFull),
          auto_renewal_enabled: String(autoRenewal),
          renew_at_discounted_rate: String(renewAtDiscountedRate && autoRenewal),
        }).toString();

        router.push(`/contract?${qs}`);
        return;
      }

      // 4) Otherwise, create Stripe Checkout and send them to pay
      const checkoutUrl = await createStripeSession({
        userId: authUser.id,
        planDurationId: selectedDuration.id,
        requiresContract: false,
        paidInFull: isPaidInFull,
        autoRenewalEnabled: autoRenewal,
        renewAtDiscountedRate: renewAtDiscountedRate && autoRenewal,
      });

      dismissToast(toastId);
      showSuccess("Redirecting to payment...");
      window.location.href = checkoutUrl;
    } catch (err) {
      console.error(err);
      dismissToast();
      showError(err.message || "Sign up failed.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 py-20 px-4 mt-20">
      <form
        onSubmit={handleSignup}
        className="w-full max-w-md bg-gray-900 p-6 rounded-xl shadow-xl space-y-4 text-white"
      >
        <h2 className="text-2xl font-bold text-center">Create Account</h2>

        <input
          type="text"
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full p-3 bg-gray-800 rounded"
          required
        />

        <input
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 bg-gray-800 rounded"
          required
        />

        <input
          type="password"
          placeholder="Create Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-3 bg-gray-800 rounded"
          required
        />

        {/* Plan */}
        <select
          value={selectedPlan}
          onChange={(e) => {
            setSelectedPlan(e.target.value);
            setSelectedDurationId("");
            setSelectedDuration(null);
            setAutoRenewal(false);
            setRenewAtDiscountedRate(false);
          }}
          className="w-full p-3 bg-gray-800 rounded"
          required
        >
          <option value="">Select Membership Plan</option>
          {Object.keys(plansByName).map((plan) => (
            <option key={plan} value={plan}>
              {plan}
            </option>
          ))}
        </select>

        {/* Duration */}
        {selectedPlan && (
          <select
            value={selectedDurationId}
            onChange={(e) => setSelectedDurationId(e.target.value)}
            className="w-full p-3 bg-gray-800 rounded"
            required
          >
            <option value="">Select Duration</option>
            {(plansByName[selectedPlan] || []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.duration_label}
              </option>
            ))}
          </select>
        )}

        {/* Auto-renew + discounted rate (only for members, not guest passes; ignore for promo) */}
        {!!selectedDuration && !isGuestPass && !selectedDuration.is_promotional && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="form-checkbox text-yellow-500"
                checked={autoRenewal}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAutoRenewal(checked);
                  if (!checked) setRenewAtDiscountedRate(false);
                }}
              />
              Enable Auto-Renewal
            </label>

            {selectedDuration.requires_contract && isPaidInFull && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="form-checkbox text-yellow-500"
                  checked={renewAtDiscountedRate}
                  onChange={(e) => setRenewAtDiscountedRate(e.target.checked)}
                  disabled={!autoRenewal}
                />
                Renew at Discounted Rate (Paid-in-Full Contracts Only)
              </label>
            )}
          </div>
        )}

        <button
          type="submit"
          className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded disabled:opacity-50"
          disabled={loading || !selectedPlan || !selectedDurationId}
        >
          {loading ? "Creating Account..." : "Sign Up"}
        </button>
      </form>
    </div>
  );
}