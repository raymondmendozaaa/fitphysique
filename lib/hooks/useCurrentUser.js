"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function useCurrentUser() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [onboarded, setOnboarded] = useState(false);
  const [profileUrl, setProfileUrl] = useState(null);

  useEffect(() => {
    const fetchUserData = async () => {
      setLoading(true);

      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData.user;
      if (!currentUser) {
        setLoading(false);
        return;
      }

      setUser(currentUser);

      const { data: userData, error } = await supabase
        .from("users")
        .select("role, onboarded, profile_url")
        .eq("id", currentUser.id)
        .single();

      if (!error && userData) {
        setRole(userData.role);
        setOnboarded(userData.onboarded);
        setProfileUrl(userData.profile_url);
      }

      setLoading(false);
    };

    fetchUserData();
  }, []);

  return {
    user,
    role,
    onboarded,
    profileUrl,
    loading,
  };
}