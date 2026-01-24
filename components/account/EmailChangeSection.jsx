// components/account/EmailChangeSection.jsx
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  showError,
  showSuccess,
  showLoading,
  dismissToast,
} from "@/lib/utils/toastUtils";

export default function EmailChangeSection() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!isMounted) return;

        if (error) {
          console.error("[account] getUser error:", error);
          setUser(null);
        } else {
          setUser(data?.user || null);
        }
      } catch (err) {
        if (!isMounted) return;
        console.error("[account] getUser unexpected error:", err);
        setUser(null);
      } finally {
        if (isMounted) setLoadingUser(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const currentEmail = user?.email || "";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    if (!newEmail || newEmail.trim() === "") {
      showError("Please enter a new email.");
      return;
    }

    if (newEmail.trim() === currentEmail) {
      showError("New email must be different from your current email.");
      return;
    }

    const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!basicEmailRegex.test(newEmail.trim())) {
      showError("Please enter a valid email address.");
      return;
    }

    if (!currentPassword) {
      showError("Please enter your current password to confirm this change.");
      return;
    }

    setSaving(true);
    const toastId = showLoading("Verifying your password...");

    try {
      // Step 1: re-authenticate with current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentEmail,
        password: currentPassword,
      });

      if (signInError) {
        console.error("[account] signInWithPassword error:", signInError);
        throw new Error("Current password is incorrect.");
      }

      // Step 2: actually update the email
      dismissToast(toastId);
      const toastId2 = showLoading("Updating your email...");

      const { error: updateError } = await supabase.auth.updateUser({
        email: newEmail.trim(),
      });

      if (updateError) {
        console.error("[account] updateUser email error:", updateError);
        throw new Error(updateError.message || "Failed to update email.");
      }

      showSuccess(
        "We sent a confirmation link to your new email. Click it to finish updating."
      );
      setNewEmail("");
      setCurrentPassword("");
      dismissToast(toastId2);
    } catch (err) {
      console.error("[account] email change error:", err);
      dismissToast(toastId);
      showError(err.message || "Something went wrong updating your email.");
    } finally {
      setSaving(false);
    }
  };

  if (loadingUser) {
    return (
      <div className="bg-gray-900 p-4 rounded-2xl text-sm text-gray-400 border border-gray-800">
        Loading account info...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bg-gray-900 p-4 rounded-2xl text-sm text-red-400 border border-gray-800">
        You must be logged in to change your email.
      </div>
    );
  }

  return (
    <div className="bg-gray-900 p-6 rounded-2xl shadow-md border border-gray-800">
      <h2 className="text-lg font-semibold mb-1">Email</h2>
      <p className="text-xs text-gray-400 mb-4">
        Update the email associated with your account. We&apos;ll send a
        confirmation link to the new address.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm mb-1 text-gray-300">
            Current email
          </label>
          <input
            type="email"
            value={currentEmail}
            disabled
            className="w-full bg-gray-800 p-3 rounded border border-gray-700 text-gray-400 cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-sm mb-1 text-gray-300">
            New email
          </label>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="w-full bg-gray-800 p-3 rounded border border-gray-700"
            placeholder="Enter new email"
          />
        </div>

        <div>
          <label className="block text-sm mb-1 text-gray-300">
            Current password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full bg-gray-800 p-3 rounded border border-gray-700"
            placeholder="Enter your current password"
            autoComplete="current-password"
          />
          <p className="mt-1 text-[11px] text-gray-500">
            This is required to prevent someone from changing your email if
            you&apos;re left logged in.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-xl disabled:opacity-50"
        >
          {saving ? "Saving..." : "Update email"}
        </button>
      </form>
    </div>
  );
}