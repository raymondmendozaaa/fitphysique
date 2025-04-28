import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { insertNewUser } from "@/lib/helpers/insertNewUser";
import { validateSignupForm } from "@/utils/validateSignupForm";
import { showSuccess, showError, showLoading } from "@/utils/toastUtils";

export default function useSignup() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const signup = async ({ fullName, email, password }) => {
    const { valid, message } = validateSignupForm({ fullName, email, password });
    if (!valid) {
      showError(message);
      return;
    }

    setLoading(true);
    const toastId = showLoading("Creating your account...");

    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw new Error(error.message);

      const user = data.user;
      if (!user) throw new Error("User registration failed. Try again.");

      await insertNewUser({
        id: user.id,
        email,
        full_name: fullName,
      });

      showSuccess("Account created! Check your email to verify.", toastId);
      router.push("/auth/login");
    } catch (err) {
      showError(err.message, toastId);
    } finally {
      setLoading(false);
    }
  };

  return { signup, loading };
}