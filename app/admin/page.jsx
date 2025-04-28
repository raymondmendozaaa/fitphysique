'use client';

import withAuth from "@/lib/withAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const AdminPage = ({ user, role }) => {
  const [metrics, setMetrics] = useState({
    total: 0,
    active: 0,
    expired: 0,
    guestPass: 0,
    promotional: 0,
  });

  useEffect(() => {
    const fetchMetrics = async () => {
      const { data: allMembers, error } = await supabase
        .from("memberships")
        .select("status, pass_source, is_promotional, plan_durations(plan_name)");

      if (error) {
        console.error("❌ Error fetching metrics:", error);
        return;
      }

      console.log("📋 All Membership Records:", allMembers);
      console.log(
        "📋 All Plan Names:", 
        allMembers.map((m) => m.plan_durations?.plan_name)
      );

      const total = allMembers.length;
      const active = allMembers.filter((m) => m.status === "active").length;
      const expired = allMembers.filter((m) => m.status === "expired").length;
      const guestPass = allMembers.filter((m) =>
        m.status === "active" &&
        (m.plan_durations?.plan_name || "").toLowerCase().includes("guest pass")
      ).length;
      const promotional = allMembers.filter((m) => m.is_promotional).length;

      setMetrics({ total, active, expired, guestPass, promotional });
    };

    fetchMetrics();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold text-center">Admin Dashboard</h1>
      <p className="mt-4 text-center">
        Logged in as: <span className="font-semibold">{user?.email}</span>
      </p>
      <p className="text-center">
        Role: <span className="font-semibold">{role}</span>
      </p>

      {/* Admin Info Box ( 🟧 Orange ) */}
      <div className="mt-6 p-4 border border-yellow-500 bg-yellow-700 text-black rounded">
        <h2 className="text-xl font-semibold">Admin Panel</h2>
        <p>Manage memberships, payments, and user accounts.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-10">
        <MetricCard label="Total Members" value={metrics.total} />
        <MetricCard label="Active" value={metrics.active} />
        <MetricCard label="Expired" value={metrics.expired} />
        <MetricCard label="Guest Passes" value={metrics.guestPass} />
        <MetricCard label="Promotional Passes" value={metrics.promotional} />
      </div>
    </div>
  );
};

const MetricCard = ({ label, value }) => (
  <div className="bg-gray-800 p-6 rounded-xl shadow text-center">
    <p className="text-xl font-semibold">{label}</p>
    <p className="text-4xl font-bold mt-2 text-yellow-400">{value}</p>
  </div>
);

// Ensures only admins can access this page
export default withAuth(AdminPage, "admin");
