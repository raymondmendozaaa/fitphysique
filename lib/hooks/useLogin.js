import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { validateLoginForm } from "@/lib/utils/validateLoginForm";
import { showSuccess, showError, showLoading } from "@/lib/utils/toastUtils";

export default function useLogin() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const handleLogin = async (email, password) => {
    const { valid, message } = validateLoginForm({ email, password });
    if (!valid) {
      showError(message);
      return;
    }

    const toastId = showLoading("Logging in...");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      showError(`Login failed: ${error.message}`, toastId);
    } else {
      showSuccess("Login successful!", toastId);
      router.push("/dashboard");
    }
  };

  const handleResendConfirmation = async (email) => {
    if (!email) {
      showError("Please enter your email first.");
      return;
    }

    setResendLoading(true);

    const { data, error: fetchError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (fetchError || !data) {
      showError(fetchError?.message || "No account found with this email.");
      setResendLoading(false);
      return;
    }

    const { error } = await supabase.auth.resend({ type: "signup", email });
    setResendLoading(false);

    if (error) {
      showError(error.message);
    } else {
      showSuccess("A new confirmation email has been sent!");
    }
  };

  return {
    handleLogin,
    handleResendConfirmation,
    loading,
    resendLoading,
  };
}