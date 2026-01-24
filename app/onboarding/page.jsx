"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import useCurrentUser from "@/lib/hooks/useCurrentUser";
import uploadProfileImage from "@/lib/helpers/uploadProfileImage";
import markOnboarded from "@/lib/helpers/markOnboarded";
import {
  showError,
  showSuccess,
  showLoading,
  dismissToast,
} from "@/lib/utils/toastUtils";

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useCurrentUser();

  const [profileImage, setProfileImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [phone, setPhone] = useState("");

  const [needsPhoto, setNeedsPhoto] = useState(false);
  const [loading, setLoading] = useState(true);

  // 🔍 Helper: does this user have any entitlement (membership or unexpired guest pass)?
  async function checkEntitlement(userId) {
    const nowIso = new Date().toISOString();

    const [msQry, gpQry] = await Promise.all([
      supabase
        .from("memberships")
        .select("id,status,start_date,expires_at", { count: "exact" })
        .eq("user_id", userId)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("guest_passes")
        .select("id,expires_at,status", { count: "exact" })
        .eq("user_id", userId)
        .gte("expires_at", nowIso)
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const membership = msQry.data ?? null;
    const membershipErr = msQry.error ?? null;
    const guestPass = gpQry.data ?? null;
    const guestPassErr = gpQry.error ?? null;

    const hasMembership = !!membership;
    const hasGuestPass = !!guestPass;

    const result = {
      ok: (hasMembership || hasGuestPass) && !membershipErr && !guestPassErr,
      hasMembership,
      hasGuestPass,
      membership,
      guestPass,
      membershipErr,
      guestPassErr,
      nowIso,
    };

    console.log("[Onboarding] checkEntitlement result:", result);
    return result;
  }

  // 🔁 Main loader: membership, user profile, entitlement
  useEffect(() => {
    if (!user?.id) return;

    (async () => {
      setLoading(true);

      console.log("[Onboarding] useCurrentUser:", {
        id: user.id,
        email: user.email,
      });

      // 1) latest membership (no embedded join)
      const { data: membershipRow, error: mErr } = await supabase
        .from("memberships")
        .select(
          `
          id,
          status,
          plan_durations (
            id,
            plan_name,
            duration_label,
            is_promotional
          )
        `
        )
        .eq("user_id", user.id)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (mErr) {
        console.error(mErr);
        showError("Failed to load your membership.");
        setLoading(false);
        return;
      }

      // 2) user profile_url (separate, simple query)
      const { data: userRow, error: uErr } = await supabase
        .from("users")
        .select("id, profile_url, phone")
        .eq("id", user.id)
        .maybeSingle();

      if (uErr) {
        console.error(uErr);
        showError("Failed to load your account.");
        setLoading(false);
        return;
      }

      const planName = membershipRow?.plan_durations?.plan_name || "";
      const isGuestPass =
        planName === "Guest-Pass" || planName.startsWith("Guest Pass");
      const hasPhoto = !!userRow?.profile_url;

      // photo required for members; optional for guest pass
      setNeedsPhoto(!isGuestPass && !hasPhoto);

      // Prefill phone (optional)
      setPhone(userRow?.phone || "");

      // 3) Check entitlement (membership or guest pass)
      const entitled = await checkEntitlement(user.id);
      console.log("[Onboarding] entitlement (auto-complete check):", entitled);

      // If they have entitlement AND either:
      //  - they're guest pass, or
      //  - they already have a photo,
      // then we can skip showing the form and finish onboarding.
      if (
        (entitled.hasMembership || entitled.hasGuestPass) &&
        (isGuestPass || hasPhoto)
      ) {
        await markOnboarded(user.id);
        router.replace("/member");
        return;
      }

      setLoading(false);
    })();
  }, [user, router]);

  const handleImageChange = (e) => {
    const f = e.target.files?.[0];
    if (!f || !f.type?.startsWith("image/")) {
      showError("Only image files are allowed.");
      return;
    }
    setProfileImage(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.id) return;

    if (needsPhoto && !profileImage) {
      showError("Please upload a profile picture to continue.");
      return;
    }

    setLoading(true);
    const toastId = showLoading("Saving...");

    try {
      if (profileImage) {
        const profileUrl = await uploadProfileImage(profileImage, user.id);
        await supabase
          .from("users")
          .update({ profile_url: profileUrl })
          .eq("id", user.id);
      }

      // Save phone if provided (optional)
      if (phone && phone.trim()) {
        await supabase
          .from("users")
          .update({ phone: phone.trim() })
          .eq("id", user.id);
      }

      const info = await checkEntitlement(user.id);

      if (!info.hasMembership && !info.hasGuestPass) {
        console.group("[Onboarding] Entitlement check failed on submit");
        console.log("now", info.nowIso);
        console.log("membership", info.membership);
        console.log("guestPass", info.guestPass);
        console.log("membershipErr", info.membershipErr);
        console.log("guestPassErr", info.guestPassErr);
        console.groupEnd();

        let reason =
          "We're still finalizing your membership—please try again shortly.";
        if (info.membershipErr || info.guestPassErr) {
          reason =
            "We couldn’t check your account (temporary error). Please try again.";
        } else {
          reason =
            "No active membership or guest pass found. If you just created one, wait a moment and retry.";
        }

        dismissToast(toastId);
        showError(reason);
        setLoading(false);
        return;
      }

      await markOnboarded(user.id);

      dismissToast(toastId);
      showSuccess("All set—welcome!");
      router.replace("/member");
    } catch (err) {
      console.error(err);
      dismissToast(toastId);
      showError(err.message || "Failed to complete onboarding.");
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4 py-16">
        <div className="text-gray-300">Checking your account…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4 py-16 relative">
      {/* 🔍 Tiny visible debug overlay – remove when you're done debugging */}
      <div className="absolute top-2 left-2 text-[11px] bg-black/80 text-gray-200 border border-gray-700 rounded px-2 py-1 max-w-xs break-words">
        <div className="font-semibold">DEBUG (Onboarding)</div>
        <div>ID: {user?.id || "none"}</div>
        <div>Email: {user?.email || "none"}</div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-gray-900 p-8 rounded-2xl shadow-xl space-y-6"
      >
        <h2 className="text-3xl font-bold text-center mb-2">
          Finish Setting Up
        </h2>
        <p className="text-center text-gray-400 mb-4">
          We just need a profile picture and you’re done.
        </p>

        <div>
          <label className="block text-sm font-medium mb-1">
            Profile Picture
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="w-full bg-gray-800 p-2 rounded border border-gray-700"
            required={needsPhoto}
          />
          {needsPhoto ? (
            <p className="text-sm text-red-500 mt-1">*Required for members.</p>
          ) : (
            <p className="text-sm text-gray-400 mt-1">Optional.</p>
          )}
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Preview"
              className="w-24 h-24 mt-3 rounded-full object-cover border border-gray-600"
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Phone (optional)
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full bg-gray-800 p-3 rounded border border-gray-700"
            placeholder="Enter your phone number here"
          />
          <p className="text-sm text-gray-400 mt-1">
            Used for account/help if there’s an issue checking in. We won’t
            spam you.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-xl disabled:opacity-50"
        >
          {loading ? "Saving..." : "Finish"}
        </button>
      </form>
    </div>
  );
}