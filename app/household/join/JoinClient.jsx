"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { showError, showSuccess } from "@/lib/utils/toastUtils";

export default function JoinClient() {
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
        data: { session },
      } = await supabase.auth.getSession();
      
      if (!session?.user || !session?.access_token) {
        const returnUrl = `/household/join?token=${encodeURIComponent(token)}`;
      
        router.replace(
          `/auth/login?redirect=${encodeURIComponent(returnUrl)}`
        );
      
        return;
      }
      
      try {
        const res = await fetch("/api/households/join", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ token }),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok || payload?.ok === false) {
          throw new Error(payload?.error || "Could not join household.");
        }

        showSuccess("You’ve joined the household.");
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