"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchUserByIdClient } from "@/lib/queries/users.client";

const ProtectedRoute = ({ children, roleRequired }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (!user || error) {
        router.push("/auth"); // Redirect to login if not logged in
        return;
      }

      setUser(user);

      // Fetch the user's role from the users table
      let userRow = null;

      try {
        userRow = await fetchUserByIdClient(user.id, "role");
      } catch (roleError) {
        console.error("Error fetching role:", roleError);
        return;
      }

      if (!userRow) {
        console.error("No user profile found for authenticated user.");
        return;
      }

      setRole(userRow.role);

      // Redirect if user role does not match
      if (roleRequired && userRow.role !== roleRequired) {
        router.push("/"); // Redirect to homepage or another page
      }
    };

    fetchUser();
  }, [router, roleRequired]);

  if (!user || !role) return <p className="text-center text-white">Loading...</p>;

  return children;
};

export default ProtectedRoute;