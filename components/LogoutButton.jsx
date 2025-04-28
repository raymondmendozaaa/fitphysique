"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const LogoutButton = () => {
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth"); // Redirect to login page
  };

  return (
    <button
      onClick={handleLogout}
      className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600 transition"
    >
      Logout
    </button>
  );
};

export default LogoutButton;