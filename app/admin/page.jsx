"use client";

import withAuth from "@/lib/withAuth";

const AdminPage = ({ user, role }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
      <h1 className="text-3xl font-bold">Admin Panel</h1>
      <p className="mt-4">Logged in as: <span className="font-semibold">{user?.email}</span></p>
      <p>Role: <span className="font-semibold">{role}</span></p>

      {/* ✅ Admin Info Box (🟧 Orange) */}
      <div className="mt-6 p-4 border border-yellow-500 bg-yellow-700 text-black rounded">
        <h2 className="text-xl font-semibold">Admin Panel</h2>
        <p>Manage memberships, payments, and user accounts.</p>
      </div>
    </div>
  );
};

// ✅ Ensures only admins can access this page
export default withAuth(AdminPage, "admin");
