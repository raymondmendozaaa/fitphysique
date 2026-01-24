import { supabase } from "@/lib/supabaseClient";

export default async function markOnboarded() {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/onboarding/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || "Failed to mark onboarding complete");
  }
  return true;
}