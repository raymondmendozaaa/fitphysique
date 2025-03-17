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

        // 🔹 Get user session
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/"); // Redirect if not logged in
          return;
        }

        setUser(user);

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
          setLoading(false);
          return;
        }

        // 🔹 Fetch membership plan from "memberships" table for members only
        const { data: membershipData, error: membershipError } = await supabase
          .from("memberships")
          .select("plan")
          .eq("user_id", user.id)
          .single();

        if (membershipError) {
          console.warn("No membership found.");
        } else {
          setMembership(membershipData.plan);
        }

        setLoading(false);
      };

      fetchUser();
    }, [router]);

    if (loading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
          <p className="text-lg font-semibold">Loading...</p>
        </div>
      );
    }

    return <WrappedComponent user={user} role={role} membership={membership} />;
  };
};

export default withAuth;
