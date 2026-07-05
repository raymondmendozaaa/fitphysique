import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchUserByEmailClient, } from "@/lib/queries/users.client";
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
      router.push("/member");
    }
  };

  const handleResendConfirmation = async (email) => {
    if (!email) {
      showError("Please enter your email first.");
      return;
    }

    setResendLoading(true);

    let userRow = null;

    try {
      userRow = await fetchUserByEmailClient(email, "id");
    } catch (fetchError) {
      showError(fetchError?.message || "Failed to check your account.");
      setResendLoading(false);
      return;
    }

    if (!userRow) {
      showError("No account found with this email.");
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