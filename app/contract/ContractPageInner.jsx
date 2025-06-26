import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { createStripeSession } from "@/lib/utils/stripeSession";
import { supabase } from "@/lib/supabaseClient";
import { showSuccess, showError, showLoading, dismissToast } from "@/lib/utils/toastUtils";

export default function ContractPageInner() {
  const searchParams = useSearchParams();

  const [userId, setUserId] = useState("");
  const [planDurationId, setPlanDurationId] = useState("");
  const [agreeChecked, setAgreeChecked] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [paidInFull, setPaidInFull] = useState(false);
  const [autoRenewal, setAutoRenewal] = useState(false);
  const [renewAtDiscountedRate, setRenewAtDiscountedRate] = useState(false);
  const [contractText, setContractText] = useState("");
  const [contractId, setContractId] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const uid = searchParams.get("user_id");
    const pid = searchParams.get("plan_duration_id");

    console.log("🧠 useEffect - uid from URL:", uid);
    console.log("🧠 useEffect - pid from URL:", pid);

    if (uid) setUserId(uid);
    if (pid) setPlanDurationId(pid);
    const paid = searchParams.get("paid_in_full") === "true";
    const autoRenew = searchParams.get("auto_renewal_enabled") === "true";
    const discountRenew = searchParams.get("renew_at_discounted_rate") === "true";

    console.log("🚀 Params:", { uid, pid, paid, autoRenew, discountRenew });

    if (uid) setUserId(uid);
    if (pid) setPlanDurationId(pid);
    setPaidInFull(paid);
    setAutoRenewal(autoRenew);
    setRenewAtDiscountedRate(discountRenew);

    if (pid) {
      const fetchContract = async () => {
        const { data: contract, error } = await supabase
          .from("contracts")
          .select("*")
          .eq("plan_duration_id", pid)
          .order("version", { ascending: false })
          .limit(1)
          .single();
      
        if (contract) {
          setContractText(contract.content);
          setContractId(contract.id);
          if (uid && pid) {
            setReady(true); // ✅ only mark ready *after* contract is loaded
          }
        } else {
          console.error("No contract found for this plan.");
        }
      };
    
      fetchContract();
    }
  }, [searchParams]);
  
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

    // ✅ Use state values, not searchParams
    const uid = userId;
    const pid = planDurationId;

    console.log("🧪 handleSubmit - userId:", uid);
    console.log("🧪 handleSubmit - planDurationId:", pid);
    console.log("🧪 handleSubmit - contractId:", contractId);

    if (!uid || !pid || !contractId) {
      showError("Missing user, plan, or contract info. Please wait for everything to load.");
      return;
    }
    
    const toastId = showLoading("Saving signature...");
    setLoading(true);

    try {
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

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4 py-16">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xl bg-gray-900 p-8 rounded-2xl shadow-xl space-y-6"
      >
        <h2 className="text-2xl font-bold text-center">Waiver & Contract Agreement</h2>

        <div className="text-sm text-gray-300 whitespace-pre-wrap max-h-64 overflow-y-auto border border-gray-700 rounded p-4 mb-4 bg-gray-800">
          {contractText || "Loading contract..."}
        </div>
          
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={agreeChecked}
            onChange={(e) => setAgreeChecked(e.target.checked)}
            className="mr-2"
          />
          <span>I agree to the terms above.</span>
        </label>

        <div>
          <label className="block text-sm font-medium mb-1">Full Name (Signature)</label>
          <input
            type="text"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            className="w-full bg-gray-800 p-3 rounded border border-gray-700"
            placeholder="Type your full name"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading || !ready}
          className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-xl"
        >
          {loading ? "Saving..." : "Sign and Continue"}
        </button>
        <div className="text-xs mt-4 text-gray-400">
          <div>User ID: {userId || "N/A"}</div>
          <div>Plan Duration ID: {planDurationId || "N/A"}</div>
          <div>Contract ID: {contractId || "N/A"}</div>
        </div>
      </form>
    </div>
  );
}