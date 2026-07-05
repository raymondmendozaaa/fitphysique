"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchUserByIdClient } from "@/lib/queries/users.client";

export default function FinishClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/member"; // fallback
  const mode = sp.get("mode"); // 'magiclink' | 'signup' | 'recovery'
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);

  useEffect(() => {
    // If link type needs password, show form; else try to route
    if (mode === "signup" || mode === "recovery") {
      setNeedsPassword(true);
    } else {
      // magic login: just route based on onboarded
      (async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return; // user not authed yet, supabase will hydrate after hash parsed
        const userRow = await fetchUserByIdClient(user.id, "onboarded");
        router.replace(userRow?.onboarded ? "/member" : "/onboarding");
      })();
    }
  }, [mode, router]);

  async function handleSetPassword(e) {
    e.preventDefault();
    if (!pw) return;
    try {
      setBusy(true);
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userRow = await fetchUserByIdClient(user.id, "onboarded");
      router.replace(next || (userRow?.onboarded ? "/member" : "/onboarding"));
    } catch (err) {
      alert(err.message || "Failed to set password");
    } finally {
      setBusy(false);
    }
  }

  if (!needsPassword) {
    return (
      <div className="min-h-screen grid place-items-center text-white">
        <p className="text-sm text-gray-300">Signing you in…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gray-950 text-white p-6">
      <form
        onSubmit={handleSetPassword}
        className="w-full max-w-sm bg-gray-900 p-6 rounded-xl border border-gray-800 space-y-4"
      >
        <h1 className="text-lg font-semibold">
          {mode === "signup" ? "Create a password" : "Reset your password"}
        </h1>

        <input
          type="password"
          className="w-full bg-gray-800 p-3 rounded border border-gray-700 outline-none"
          placeholder="New password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
        />

        <button
          disabled={busy}
          className="w-full h-11 rounded-lg bg-yellow-500 text-black font-semibold disabled:opacity-60"
        >
          {busy ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}