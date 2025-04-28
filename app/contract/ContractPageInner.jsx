import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createStripeSession } from "@/lib/utils/stripeSession";
import { supabase } from "@/lib/supabaseClient";
import { showSuccess, showError, showLoading, dismissToast } from "@/lib/utils/toastUtils";

export default function ContractPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [userId, setUserId] = useState("");
  const [planDurationId, setPlanDurationId] = useState("");
  const [agreeChecked, setAgreeChecked] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const uid = searchParams.get("user_id");
    const pid = searchParams.get("plan_duration_id");
    if (uid) setUserId(uid);
    if (pid) setPlanDurationId(pid);
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!agreeChecked || !typedName.trim()) {
      showError("You must agree and provide your signature.");
      return;
    }

    const toastId = showLoading("Saving signature...");
    setLoading(true);

    try {
      const { error } = await supabase.from("contract_signatures").insert({
        user_id: userId,
        plan_duration_id: planDurationId,
        signature: typedName,
        agreed: true,
      });

      if (error) throw error;

      dismissToast(toastId);
      showSuccess("Signature saved. Redirecting to payment...");

      const url = await createStripeSession({
        userId,
        planDurationId,
        requiresContract: true,
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

        <div className="text-sm text-gray-300">
          <p className="mb-4">
            By signing this contract, you acknowledge that you’ve read and agreed to our
            gym's terms of service, liability waiver, and membership obligations for the
            selected plan duration.
          </p>
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
          disabled={loading}
          className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-xl"
        >
          {loading ? "Saving..." : "Sign and Continue"}
        </button>
      </form>
    </div>
  );
}