"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import { supabase } from "@/lib/supabaseClient";
import useCurrentUser from "@/lib/hooks/useCurrentUser";
import uploadProfileImage from "@/lib/helpers/uploadProfileImage";
import updateUserAndMembership from "@/lib/helpers/updateUserAndMembership";
import { groupPlanDurationsByName } from "@/lib/utils/planGrouping";
import { createStripeSession } from "@/lib/utils/stripeSession";
import { validateOnboardingForm } from "@/lib/utils/validateOnboardingForm";
import {
  showError,
  showSuccess,
  showLoading,
  dismissToast,
} from "@/lib/utils/toastUtils";

export default function OnboardingPage() {
  const router = useRouter();
  const supabaseClient = createClientComponentClient();
  const { user } = useCurrentUser();
  const [profileImage, setProfileImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [plansWithDurations, setPlansWithDurations] = useState({});
  const [selectedPlan, setSelectedPlan] = useState("");
  const [selectedDurationId, setSelectedDurationId] = useState("");
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDurations = async () => {
      const { data, error } = await supabase
        .from("plan_durations")
        .select("id, plan_name, duration_label, requires_contract, is_promotional");

      if (error) {
        showError("Failed to load plan durations");
      } else {
        setPlansWithDurations(groupPlanDurationsByName(data));
      }
    };

    fetchDurations();
  }, []);

  useEffect(() => {
    if (!user) return;

    const userChannel = supabaseClient
      .channel(`onboarding-user-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const newOnboarded = payload.new.onboarded;
          if (newOnboarded) {
            console.log("🎉 Realtime onboarded = true");
            router.push("/dashboard");
          }
        }
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(userChannel);
    };
  }, [user, supabaseClient, router]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith("image/")) {
      showError("Only image files are allowed.");
      return;
    }

    setProfileImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;

    const isValid = validateOnboardingForm({
      profileImage,
      selectedPlan,
      selectedDurationId,
    });

    if (!isValid) return;
    setLoading(true);
    const toastId = showLoading("Submitting...");

    try {
      const profileUrl = await uploadProfileImage(profileImage, user.id);

      if (!selectedDuration) {
        showError("Invalid plan selected.", toastId);
        setLoading(false);
        return;
      }

      await updateUserAndMembership({
        userId: user.id,
        profileUrl,
        planDurationId: selectedDuration.id,
      });

      if (selectedDuration.plan_name === "Guest Pass" && selectedDuration.is_promotional) {
        showSuccess("Promotional Guest Pass activated!", toastId);
        router.push("/dashboard");
        return;
      }

      if (selectedDuration.requires_contract) {
        showSuccess("Redirecting to contract...", toastId);
        router.push(`/contract?user_id=${user.id}&plan_duration_id=${selectedDuration.id}`);
        return;
      }

      const planKey = selectedDuration.plan_name.toUpperCase().replace(/\s/g, "_");
      const durationKey = selectedDuration.duration_label.toUpperCase().replace(/\s/g, "");

      const url = await createStripeSession({
        userId: user.id,
        planDurationId: selectedDuration.id,
        planKey,
        durationKey,
        requiresContract: selectedDuration.requires_contract || false,
      });

      showSuccess("Redirecting to payment...", toastId);
      window.location.href = url;
    } catch (err) {
      console.error("Onboarding Error:", err);
      showError(err.message || "Something went wrong.", toastId);
      setLoading(false);
    } finally {
      dismissToast(toastId);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4 py-16">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-gray-900 p-8 rounded-2xl shadow-xl space-y-6"
      >
        <h2 className="text-3xl font-bold text-center mb-4">Complete Your Profile</h2>

        <div>
          <label className="block text-sm font-medium mb-1">Profile Picture</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="w-full bg-gray-800 p-2 rounded border border-gray-700"
            required
          />
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Preview"
              className="w-24 h-24 mt-3 rounded-full object-cover border border-gray-600"
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Membership Plan</label>
          <select
            value={selectedPlan}
            onChange={(e) => {
              setSelectedPlan(e.target.value);
              setSelectedDurationId("");
              setSelectedDuration(null);
            }}
            required
            className="w-full bg-gray-800 p-3 rounded border border-gray-700"
          >
            <option value="">Select a Plan</option>
            {Object.keys(plansWithDurations).map((plan) => (
              <option key={plan} value={plan}>
                {plan}
              </option>
            ))}
          </select>
        </div>

        {selectedPlan && selectedPlan !== "Guest Pass" && (
          <div>
            <label className="block text-sm font-medium mb-1">Duration</label>
            <select
              value={selectedDurationId}
              onChange={(e) => {
                const selected = plansWithDurations[selectedPlan].find(
                  (p) => p.id === e.target.value
                );
                setSelectedDurationId(e.target.value);
                setSelectedDuration(selected);
                if (selected?.requires_contract) {
                  showSuccess("Note: This duration requires a contract.");
                }
              }}
              required
              className="w-full bg-gray-800 p-3 rounded border border-gray-700"
            >
              <option value="">Select Duration</option>
              {plansWithDurations[selectedPlan]?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.duration_label}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-xl"
        >
          {loading ? "Submitting..." : "Finish Onboarding"}
        </button>
      </form>
    </div>
  );
}