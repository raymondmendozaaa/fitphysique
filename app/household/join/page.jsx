"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { showError, showSuccess } from "@/lib/utils/toastUtils";

export default function HouseholdJoinPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token");

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!token) {
        showError("Missing invite token.");
        router.replace("/");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // not logged in – send to login but keep token in URL
        router.replace(`/auth/login?redirect=/household/join?token=${encodeURIComponent(token)}`);
        return;
      }

      try {
        const res = await fetch("/api/households/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, token }),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok || payload?.ok === false) {
          throw new Error(payload?.error || "Could not join household.");
        }

        showSuccess("You’ve joined the household.");
        // maybe send them to change membership
        router.replace("/membership/change");
      } catch (e) {
        console.error(e);
        showError(e.message || "Failed to join household.");
        router.replace("/");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, router]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
      <div className="rounded-xl border border-gray-700 bg-gray-800 px-6 py-4">
        {loading ? "Joining household..." : "Done"}
      </div>
    </div>
  );
}