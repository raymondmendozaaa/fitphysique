"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const withAuth = (WrappedComponent, requiredRole) => {
  return function AuthComponent() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [role, setRole] = useState(null);
    const [membership, setMembership] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const fetchUser = async () => {
        setLoading(true);

        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/");
          return;
        }

        setUser(user);

        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("role, onboarded, profile_url")
          .eq("id", user.id)
          .single();

        if (userError || !userData) {
          console.error("Error fetching user:", userError?.message);
          return;
        }

        const { role, onboarded, profile_url } = userData;
        setRole(role);

        const { data: membershipData, error: membershipError } = await supabase
          .from("memberships")
          .select("plan_duration_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (membershipError) {
          console.error("Error fetching membership:", membershipError.message);
        }

        const hasMembership = membershipData?.plan_duration_id != null;

        // ✅ Debug Logging
        console.log("🔍 Auth Check:", {
          onboarded,
          profile_url,
          hasMembership,
          role,
        });

        const isOnboardingPage =
          typeof window !== "undefined" &&
          window.location.pathname.startsWith("/onboarding");

        const needsOnboarding =
          role === "member" &&
          (!onboarded || !profile_url);

        if (needsOnboarding && !isOnboardingPage) {
          console.log("⏳ Redirecting to onboarding (webhook might still be processing)");
          setTimeout(() => {
            router.push("/onboarding");
          }, 1500);
          return;
        }

        if (requiredRole && role !== requiredRole) {
          router.push(role === "admin" ? "/admin" : "/dashboard");
          return;
        }

        if (role === "admin") {
          setLoading(false);
          return;
        }

        if (membershipData?.plan) {
          setMembership(membershipData.plan);
        }

        setLoading(false);
      };

      fetchUser();
    }, [router]);

    if (loading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
          <div className="text-center space-y-2">
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-yellow-400 border-opacity-75 mx-auto" />
            <p className="text-lg font-medium tracking-wide">Authenticating...</p>
          </div>
        </div>
      );
    }

    return <WrappedComponent user={user} role={role} membership={membership} />;
  };
};

export default withAuth;
