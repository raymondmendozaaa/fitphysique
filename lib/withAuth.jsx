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

<<<<<<< HEAD
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/");
=======
        // 🔹 Get user session
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/"); // Redirect if not logged in
>>>>>>> a13871cbcb0587d21345b91f28863c3e4151a8e6
          return;
        }

        setUser(user);

<<<<<<< HEAD
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

        const { data: membershipData } = await supabase
          .from("memberships")
          .select("plan_duration_id")
          .eq("user_id", user.id)
          .maybeSingle();

        const hasMembership = membershipData && membershipData.plan_duration_id;

        const needsOnboarding =
          role === "member" &&
          (!onboarded || !profile_url || !hasMembership);

        const isOnboardingPage =
          typeof window !== "undefined" &&
          window.location.pathname.startsWith("/onboarding");

        if (needsOnboarding && !isOnboardingPage) {
          console.log("⏳ Waiting briefly for webhook...");
          setTimeout(() => {
            router.push("/onboarding");
          }, 1500); // 1.5s delay to give webhook time to update
          return;
        }
          

        // Role-based route protection
        if (requiredRole && role !== requiredRole) {
          router.push(role === "admin" ? "/admin" : "/dashboard");
          return;
        }

        if (role === "admin") {
=======
        // 🔹 Fetch user role from "users" table
        const { data: userData, error: roleError } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single();

        if (roleError) {
          console.error("Error fetching role:", roleError.message);
          return;
        }

        setRole(userData.role);

        // 🔹 Redirect if user doesn't match the required role
        if (requiredRole && userData.role !== requiredRole) {
          router.push(userData.role === "admin" ? "/admin" : "/dashboard");
          return;
        }

        // 🚨 **Fix: Skip membership fetching for admins**
        if (userData.role === "admin") {
>>>>>>> a13871cbcb0587d21345b91f28863c3e4151a8e6
          setLoading(false);
          return;
        }

<<<<<<< HEAD
        // Store membership plan name if available
        if (membershipData?.plan) {
=======
        // 🔹 Fetch membership plan from "memberships" table for members only
        const { data: membershipData, error: membershipError } = await supabase
          .from("memberships")
          .select("plan")
          .eq("user_id", user.id)
          .single();

        if (membershipError) {
          console.warn("No membership found.");
        } else {
>>>>>>> a13871cbcb0587d21345b91f28863c3e4151a8e6
          setMembership(membershipData.plan);
        }

        setLoading(false);
      };

      fetchUser();
    }, [router]);

    if (loading) {
      return (
<<<<<<< HEAD
        <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
          <div className="text-center space-y-2">
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-yellow-400 border-opacity-75 mx-auto" />
            <p className="text-lg font-medium tracking-wide">Authenticating...</p>
          </div>
        </div>
      );
    }    
=======
        <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
          <p className="text-lg font-semibold">Loading...</p>
        </div>
      );
    }
>>>>>>> a13871cbcb0587d21345b91f28863c3e4151a8e6

    return <WrappedComponent user={user} role={role} membership={membership} />;
  };
};

<<<<<<< HEAD
export default withAuth;
=======
export default withAuth;
>>>>>>> a13871cbcb0587d21345b91f28863c3e4151a8e6
