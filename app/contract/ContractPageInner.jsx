import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createStripeSession } from "@/lib/utils/stripeSession";
import { supabase } from "@/lib/supabaseClient";
import {
  showSuccess,
  showError,
  showLoading,
  dismissToast,
} from "@/lib/utils/toastUtils";
import useCurrentUser from "@/lib/hooks/useCurrentUser";

export default function ContractPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // 🔹 SIMPLIFIED: just user + loading, no role/effectiveRole
  const { user, loading: userLoading } = useCurrentUser();

  const source = searchParams.get("source") || "member";
  const isAdminMode = source === "admin";

  const [userId, setUserId] = useState("");
  const [planDurationId, setPlanDurationId] = useState("");
  const [agreeChecked, setAgreeChecked] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [paidInFull, setPaidInFull] = useState(false);
  const [autoRenewal, setAutoRenewal] = useState(false);
  const [renewAtDiscountedRate, setRenewAtDiscountedRate] = useState(false);
  const [contractText, setContractText] = useState("");
  const [contractId, setContractId] = useState("");
  const [contractVersion, setContractVersion] = useState("");
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [ipAddress, setIpAddress] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [planName, setPlanName] = useState("");
  const [durationLabel, setDurationLabel] = useState("");

  // 🔹 Simple "must be logged in" guard
  useEffect(() => {
    if (userLoading) return;

    if (!user) {
      console.warn("[Contract] No logged-in user; redirecting to login.");
      if (typeof window !== "undefined") {
        const returnUrl = window.location.pathname + window.location.search;
        router.replace(`/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`);
      }
    }
  }, [userLoading, user, router]);

  useEffect(() => {
    const fetchLocations = async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name");
      if (error) {
        console.error("❌ Failed to fetch locations", error);
      } else {
        setLocations(data);
      }
    };
    fetchLocations();
  }, []);

  useEffect(() => {
    fetch("https://api.ipify.org?format=json")
      .then((res) => res.json())
      .then((data) => {
        setIpAddress(data.ip);
      })
      .catch((err) => {
        console.warn("⚠️ Failed to get IP address:", err);
      });
  }, []);

  useEffect(() => {
    const uid = searchParams.get("user_id");
    const pid = searchParams.get("plan_duration_id");

    console.log("🧠 useEffect - uid from URL:", uid);
    console.log("🧠 useEffect - pid from URL:", pid);

    if (uid) setUserId(uid);
    if (pid) setPlanDurationId(pid);

    const paidParam =
      searchParams.get("paid_in_full") ?? searchParams.get("pif");
    const autoRenewParam =
      searchParams.get("auto_renewal_enabled") ??
      searchParams.get("auto_renew");
    const discountRenewParam =
      searchParams.get("renew_at_discounted_rate") ??
      searchParams.get("discounted");

    const paid = paidParam === "true" || paidParam === "1";
    const autoRenew = autoRenewParam === "true" || autoRenewParam === "1";
    const discountRenew =
      discountRenewParam === "true" || discountRenewParam === "1";

    console.log("🚀 Params:", { uid, pid, paid, autoRenew, discountRenew });

    setPaidInFull(paid);
    setAutoRenewal(autoRenew);
    setRenewAtDiscountedRate(discountRenew);

    if (pid) {
      const fetchContract = async () => {
        const [{ data: contract }, { data: pd }] = await Promise.all([
          supabase
            .from("contracts")
            .select("*")
            .eq("plan_duration_id", pid)
            .order("version", { ascending: false })
            .limit(1)
            .single(),
          supabase
            .from("plan_durations")
            .select("plan_name, duration_label")
            .eq("id", pid)
            .single(),
        ]);

        if (contract) {
          setContractText(contract.content);
          setContractId(contract.id);
          setContractVersion(contract.version);
        } else {
          console.error("No contract found for this plan.");
        }

        if (pd) {
          setPlanName(pd.plan_name || "");
          setDurationLabel(pd.duration_label || "");
        }

        if (uid && pid) setReady(true);
      };

      fetchContract();
    }
  }, [searchParams]);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitude(position.coords.latitude);
          setLongitude(position.coords.longitude);
          setAccuracy(position.coords.accuracy);
          console.log("📍 Location:", position.coords);
        },
        (err) => {
          console.error("❌ Location error:", err);
          if (err.code === 1) {
            console.warn("📵 User denied location access.");
          }
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      console.warn("Geolocation not available.");
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("🚨 handleSubmit triggered");
    console.log("ready:", ready, "loading:", loading);

    if (!ready) {
      showError("Still loading. Please wait a moment...");
      return;
    }

    if (!agreeChecked || !typedName.trim()) {
      showError("You must agree and provide your signature.");
      return;
    }

    const uid = userId;
    const pid = planDurationId;

    console.log("🧪 handleSubmit - userId:", uid);
    console.log("🧪 handleSubmit - planDurationId:", pid);
    console.log("🧪 handleSubmit - contractId:", contractId);

    if (!uid || !pid || !contractId) {
      showError(
        "Missing user, plan, or contract info. Please wait for everything to load."
      );
      return;
    }

    const toastId = showLoading("Saving signature...");
    setLoading(true);

    try {
      const sigRes = await fetch("/api/sign-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: uid,
          planDurationId: pid,
          contractId: contractId,
          signature: typedName,
          agreed: agreeChecked,
          contractVersion: contractVersion,
          latitude,
          longitude,
          accuracy,
          ipAddress,
          location_id: selectedLocation,
        }),
      });

      if (!sigRes.ok) {
        throw new Error("Signature API failed");
      }

      dismissToast(toastId);
      showSuccess("Signature saved. Redirecting to payment...");

      console.log("🔑 Submitting with:", {
        user_id: uid,
        plan_duration_id: pid,
        contract_id: contractId,
        paid_in_full: paidInFull,
        auto_renewal_enabled: autoRenewal,
        renew_at_discounted_rate: renewAtDiscountedRate,
      });

      const url = await createStripeSession({
        userId: uid,
        planDurationId: pid,
        requiresContract: true,
        paidInFull: paidInFull,
        autoRenewalEnabled: autoRenewal,
        renewAtDiscountedRate,
        typedName,
        agreeChecked,
        contractId: contractId,
        contractVersion,
        ipAddress,
        locationId: selectedLocation || null,
        source,
      });

      window.location.href = url;
    } catch (err) {
      dismissToast(toastId);
      showError("Failed to save signature.");
      console.error("Signature error:", err);
    } finally {
      setLoading(false);
    }
  };

  const subtitle = [
    planName && durationLabel ? `${planName} — ${durationLabel}` : null,
    contractVersion ? `v${contractVersion}` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
<div className="min-h-screen bg-gray-950 text-white flex items-start md:items-center justify-center px-4 pt-36 pb-16">
      <form onSubmit={handleSubmit} className="w-full max-w-2xl">
        <div
          className="w-full bg-gray-900 rounded-2xl shadow-xl border border-gray-800 grid"
          style={{ gridTemplateRows: "auto 1fr auto", height: "calc(100vh - 160px" }}
        >
          {/* Header */}
          <div className="p-6 border-b border-gray-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">
                  Waiver &amp; Contract Agreement
                </h2>
                {(planName || durationLabel || contractVersion) && (
                  <p className="text-xs text-gray-400 mt-1 truncate">
                    {subtitle}
                  </p>
                )}
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-400/30">
                Unsigned
              </span>
            </div>

            {/* Tiny meta chips like dashboard (optional) */}
            <div className="flex flex-wrap gap-2 mt-3">
              {userId && (
                <span className="text-[11px] px-2 py-1 rounded-md border border-gray-700 text-gray-300">
                  <span className="text-gray-500">User:</span> {userId}
                </span>
              )}
              {ipAddress && (
                <span className="text-[11px] px-2 py-1 rounded-md border border-gray-700 text-gray-300">
                  <span className="text-gray-500">IP:</span> {ipAddress}
                </span>
              )}
            </div>
          </div>

          {/* Scrollable contract body */}
          <div className="min-h-0 overflow-y-auto px-6 py-4">
            <div className="text-sm text-gray-200 whitespace-pre-wrap leading-6 contract-text">
              {contractText || "Loading contract..."}
            </div>
          </div>

          {/* Footer with signature form */}
          <div className="p-6 border-t border-gray-800 space-y-5">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={agreeChecked}
                onChange={(e) => setAgreeChecked(e.target.checked)}
                className="mt-1 accent-yellow-400"
                required
              />
              <span>I agree to the terms above.</span>
            </label>

            <div>
              <label className="block text-sm font-medium mb-1">
                Full Name (Signature)
              </label>
              <input
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                className="w-full bg-gray-800 p-3 rounded border border-gray-700 outline-none focus:border-gray-500"
                placeholder="Type your full name"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Select Gym Location
              </label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full bg-gray-800 p-3 rounded border border-gray-700 outline-none focus:border-gray-500"
                required
              >
                <option value="" disabled>
                  Select a location
                </option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || !ready}
              className="w-full h-12 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-xl disabled:opacity-60"
            >
              {loading ? "Saving..." : "Sign and Continue"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}