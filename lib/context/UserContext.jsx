// lib/context/UserContext.jsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchLatestMembershipClient } from "@/lib/queries/memberships.client";
import { fetchUserByIdClient } from "@/lib/queries/users.client";

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [onboarded, setOnboarded] = useState(false);
  const [profileUrl, setProfileUrl] = useState(null);
  const [hasRealPhoto, setHasRealPhoto] = useState(false);
  const [hasMembership, setHasMembership] = useState(false);
  const [membershipData, setMembershipData] = useState(null);
  const [loading, setLoading] = useState(true);

  const DEFAULT_AVATAR =
    "https://zfhcsoopaaixotxbopoi.supabase.co/storage/v1/object/public/profile-pictures/default_silhouette.png";

  const resetState = () => {
    setUser(null);
    setRole(null);
    setOnboarded(false);
    setProfileUrl(null);
    setHasRealPhoto(false);
    setHasMembership(false);
    setMembershipData(null);
  };

  const fetchUserData = async () => {
    setLoading(true);

    // 1) Auth user from Supabase
    const { data: authData } = await supabase.auth.getUser();
    const currentUser = authData.user;

    if (!currentUser) {
      resetState();
      setLoading(false);
      return;
    }

    setUser(currentUser);

    // 2) App-level user record
    let userData = null;

    try {
      userData = await fetchUserByIdClient(
        currentUser.id,
        "role, onboarded, profile_url"
      );
    } catch (userError) {
      console.error("❌ Failed to fetch user context data:", userError);
    }

    if (userData) {
      setRole(userData.role);
      setOnboarded(userData.onboarded);

      const realPhoto = !!userData.profile_url;
      setHasRealPhoto(realPhoto);
      setProfileUrl(userData.profile_url || DEFAULT_AVATAR);
    } else {
      setRole(null);
      setOnboarded(false);
      setProfileUrl(null);
      setHasRealPhoto(false);
    }

  // 3) Latest membership (if any)
    let membershipRow = null;

    try {
      membershipRow = await fetchLatestMembershipClient(currentUser.id);
    } catch (membershipError) {
      console.error("❌ Failed to fetch latest membership:", membershipError);
    }

    if (membershipRow) {
      setHasMembership(true);
      setMembershipData({
        id: membershipRow.id,
        status: membershipRow.status,
        start_date: membershipRow.start_date,
        expires_at: membershipRow.expires_at,
        grace_ends_at: membershipRow.grace_ends_at,
        plan_name: membershipRow.plan_duration?.plan_name ?? null,
        duration_label: membershipRow.plan_duration?.duration_label ?? null,
        is_promotional: membershipRow.plan_duration?.is_promotional ?? false,
      });
    } else {
      setHasMembership(false);
      setMembershipData(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    // initial load
    fetchUserData();

    // keep in sync with auth events
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!session?.user) {
          resetState();
          setLoading(false);
        } else {
          // re-fetch full user + membership on login / token refresh
          fetchUserData();
        }
      }
    );

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // 🔧 Let components patch parts of the user state optimistically
  const updateUser = (partial) => {
    if ("user" in partial) setUser(partial.user);
    if ("role" in partial) setRole(partial.role);
    if ("onboarded" in partial) setOnboarded(partial.onboarded);
    if ("profileUrl" in partial) setProfileUrl(partial.profileUrl);
    if ("hasRealPhoto" in partial) setHasRealPhoto(partial.hasRealPhoto);
    if ("hasMembership" in partial) setHasMembership(partial.hasMembership);
    if ("membershipData" in partial) setMembershipData(partial.membershipData);
  };

  const value = {
    user,
    role,
    onboarded,
    profileUrl,
    hasRealPhoto,
    hasMembership,
    membershipData,
    loading,
    updateUser,
    refreshUser: fetchUserData,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUserContext() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUserContext must be used within a UserProvider");
  }
  return ctx;
}