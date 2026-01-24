"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useUserData from "@/lib/hooks/useUserData";

const withAuth = (WrappedComponent, requiredRole) => {
  return function AuthComponent() {
    const router = useRouter();
    const {
      user,
      role,
      onboarded,
      profileUrl,
      hasRealPhoto,
      hasMembership,
      loading,
      membershipData,
    } = useUserData();

    const [ready, setReady] = useState(false);

    useEffect(() => {
      if (loading) return;

      // 1) Not logged in → go to login, preserve returnUrl
      if (!loading && !user) {
        const returnUrl =
          typeof window !== "undefined"
            ? window.location.pathname + window.location.search
            : "/";
        router.replace(
          `/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`
        );
        return;
      }

      const pathname =
        typeof window !== "undefined" ? window.location.pathname : "";

      const isOnboardingFlowPage =
        pathname.startsWith("/onboarding") ||
        pathname.startsWith("/contract");

      const isGuest =
        membershipData?.plan_name &&
        membershipData.plan_name.toLowerCase().includes("guest");

      // 2) Decide if user needs onboarding
      const needsOnboarding =
        role === "member" &&
        (
          !onboarded ||          // never completed onboarding
          (!hasRealPhoto && !isGuest) // no real photo & not a guest pass
        );

      if (needsOnboarding && !isOnboardingFlowPage) {
        console.log("⏳ Redirecting to onboarding (user not onboarded)");
        router.push("/onboarding");
        return;
      }

      // 3) Role-based protection
      if (requiredRole && role !== requiredRole) {
        router.push(role === "admin" ? "/admin" : "/member");
        return;
      }

      setReady(true);
    }, [
      loading,
      user,
      role,
      onboarded,
      profileUrl,
      hasRealPhoto,
      hasMembership,
      membershipData,
      router,
      requiredRole,
    ]);

    if (loading || !user || !ready) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
          <div className="text-center space-y-2">
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-yellow-400 border-opacity-75 mx-auto" />
            <p className="text-lg font-medium tracking-wide">
              Authenticating...
            </p>
          </div>
        </div>
      );
    }

    return (
      <WrappedComponent
        user={user}
        role={role}
        membership={membershipData}
        profileUrl={profileUrl}
      />
    );
  };
};

export default withAuth;