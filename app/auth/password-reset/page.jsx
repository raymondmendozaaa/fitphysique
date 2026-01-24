"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  showError,
  showSuccess,
  showLoading,
  dismissToast,
} from "@/lib/utils/toastUtils";

const PASSWORD_REQUIREMENTS =
  "Password must be at least 8 characters and include a lowercase letter, uppercase letter, number, and symbol.";

// Individual rules for UI + validation
const PASSWORD_RULES = [
  {
    id: "minLength",
    label: "At least 8 characters",
    test: (password) => password && password.length >= 8,
  },
  {
    id: "lowercase",
    label: "At least one lowercase letter",
    test: (password) => /[a-z]/.test(password || ""),
  },
  {
    id: "uppercase",
    label: "At least one uppercase letter",
    test: (password) => /[A-Z]/.test(password || ""),
  },
  {
    id: "number",
    label: "At least one number",
    test: (password) => /[0-9]/.test(password || ""),
  },
  {
    id: "symbol",
    label: "At least one symbol (!@#$% etc.)",
    test: (password) =>
      /[!@#$%^&*()[\]{}.,?"'`~<>_\\\-+=/|]/.test(password || ""),
  },
];

function validateNewPassword(password) {
  if (!password) return PASSWORD_REQUIREMENTS;
  const allMet = PASSWORD_RULES.every((rule) => rule.test(password));
  return allMet ? null : PASSWORD_REQUIREMENTS;
}

export default function PasswordResetPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  // For showing/hiding the requirement list
  const [passwordFocused, setPasswordFocused] = useState(false);

  // Track which requirements are currently fading out / dismissed
  const [fading, setFading] = useState({});
  const [dismissed, setDismissed] = useState({});
  const fadeTimeoutsRef = useRef({});

  useEffect(() => {
    // When user clicks the recovery link, Supabase sets a "recovery" session
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user || null;
      if (!user) {
        setHasSession(false);
      } else {
        setHasSession(true);
      }
      setChecking(false);
    })();
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(fadeTimeoutsRef.current).forEach((id) => {
        clearTimeout(id);
      });
    };
  }, []);

  // Handle per-requirement fade-out as they get satisfied
  useEffect(() => {
    PASSWORD_RULES.forEach((rule) => {
      const met = rule.test(password);
      const isFading = fading[rule.id];
      const isDismissed = dismissed[rule.id];

      if (met) {
        // Start fade if not already fading or dismissed
        if (!isFading && !isDismissed) {
          setFading((prev) => ({ ...prev, [rule.id]: true }));

          const timeoutId = setTimeout(() => {
            // After fade duration, fully remove from view
            setDismissed((prev) => ({ ...prev, [rule.id]: true }));
            setFading((prev) => {
              const copy = { ...prev };
              delete copy[rule.id];
              return copy;
            });
            delete fadeTimeoutsRef.current[rule.id];
          }, 600); // match CSS duration-ish

          fadeTimeoutsRef.current[rule.id] = timeoutId;
        }
      } else {
        // If requirement becomes unmet again, bring it back (no fade)
        if (isFading || isDismissed) {
          if (fadeTimeoutsRef.current[rule.id]) {
            clearTimeout(fadeTimeoutsRef.current[rule.id]);
            delete fadeTimeoutsRef.current[rule.id];
          }
          setFading((prev) => {
            const copy = { ...prev };
            delete copy[rule.id];
            return copy;
          });
          setDismissed((prev) => {
            const copy = { ...prev };
            delete copy[rule.id];
            return copy;
          });
        }
      }
    });
  }, [password, fading, dismissed]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!password || !confirm) {
      showError("Please fill out both password fields.");
      return;
    }

    if (password !== confirm) {
      showError("Passwords do not match.");
      return;
    }

    const validationError = validateNewPassword(password);
    if (validationError) {
      showError(validationError);
      return;
    }

    setSaving(true);
    const toastId = showLoading("Updating your password...");

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        console.error("[password-reset] updateUser error:", error);
        throw new Error(error.message || "Failed to update password.");
      }

      dismissToast(toastId);
      showSuccess("Password updated successfully. Please log in again.");
      router.push("/auth/login");
    } catch (err) {
      console.error("[password-reset] handleSubmit error:", err);
      dismissToast(toastId);
      showError(
        err.message || "Something went wrong while updating password."
      );
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <p>Checking your reset link…</p>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <div className="bg-gray-900 p-6 rounded-xl shadow-lg max-w-md text-center">
          <h1 className="text-2xl font-bold mb-2">Invalid or expired link</h1>
          <p className="text-gray-400 mb-4">
            This password reset link is no longer valid. Please request a new
            one from your account page.
          </p>
        </div>
      </div>
    );
  }

  const shouldShowRequirements =
    (passwordFocused || password.length > 0) &&
    PASSWORD_RULES.some((rule) => !dismissed[rule.id]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-gray-900 p-8 rounded-2xl shadow-xl space-y-6"
      >
        <h1 className="text-2xl font-bold text-center">Reset Password</h1>
        <p className="text-center text-gray-400 text-sm">
          Enter a new password for your account.
        </p>

        <div>
          <label className="block text-sm font-medium mb-1">
            New Password
          </label>
          <input
            type="password"
            className="w-full bg-gray-800 p-3 rounded border border-gray-700"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            placeholder="Enter new password"
            autoComplete="new-password"
          />

          {shouldShowRequirements && (
            <div className="mt-2 text-xs text-gray-400 space-y-1">
              {PASSWORD_RULES.map((rule) => {
                if (dismissed[rule.id]) return null;
                const met = rule.test(password);
                const isFading = fading[rule.id];

                return (
                  <div
                    key={rule.id}
                    className={`flex items-center gap-2 transition-opacity duration-500 ${
                      met ? "text-green-400" : "text-red-400"
                    } ${isFading ? "opacity-0" : "opacity-100"}`}
                  >
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
                    <span>{rule.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Confirm New Password
          </label>
          <input
            type="password"
            className="w-full bg-gray-800 p-3 rounded border border-gray-700"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter new password"
            autoComplete="new-password"
          />
        </div>

        {/* Keep this as the generic error copy for toasts */}
        <p className="text-xs text-gray-500">{PASSWORD_REQUIREMENTS}</p>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-xl disabled:opacity-50"
        >
          {saving ? "Saving..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}