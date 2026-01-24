'use client';

import withAuth from "@/lib/withAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { name: "Dashboard", href: "/admin" },
  { name: "Memberships", href: "/admin/memberships" },
  { name: "Guest Passes", href: "/admin/guest-passes" },
  { name: "Contracts", href: "/admin/contracts" },
  { name: "Users", href: "/admin/users" },
  { name: "Check-ins", href: "/admin/checkins" },
  { name: "Locations", href: "/admin/locations" },
  { name: "Payments", href: "/admin/payments" },
  { name: "Analytics", href: "/admin/analytics" },
  { name: "Settings", href: "/admin/settings" },
];

const AdminPage = ({ user, role }) => {
  const pathname = usePathname();
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
    <main className="flex-1 p-8 pt-8">
      <h2 className="text-3xl font-bold mb-2 text-center">Admin Dashboard</h2>
      <p className="text-center">
        Logged in as: <span className="font-semibold">{user?.email}</span>
      </p>
      <p className="text-center mb-6">
        Role: <span className="font-semibold">{role}</span>
      </p>
      <div className="p-4 border border-yellow-500 bg-yellow-700 text-black rounded mb-10">
        <h3 className="text-xl font-semibold">Overview</h3>
        <p>Manage memberships, payments, users, and more from this panel.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <MetricCard label="Total Members" value={metrics.total} />
        <MetricCard label="Active" value={metrics.active} />
        <MetricCard label="Expired" value={metrics.expired} />
        <MetricCard label="Guest Passes" value={metrics.guestPass} />
        <MetricCard label="Promotional Passes" value={metrics.promotional} />
      </div>

      <div className="mt-10">
        <RecentAdminActivityCard />
      </div>
    </main>
  );
};

const MetricCard = ({ label, value }) => (
  <div className="bg-gray-800 p-6 rounded-xl shadow text-center">
    <p className="text-xl font-semibold">{label}</p>
    <p className="text-4xl font-bold mt-2 text-yellow-400">{value}</p>
  </div>
);

// --- Recent Admin Activity Card (paste-and-go) ---
function DiffChips({ details }) {
  const changed = details?.changed_fields || {};
  const keys = Object.keys(changed);
  if (!keys.length) return <span className="text-gray-400 text-xs">no_change</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {keys.map((k) => {
        const c = changed[k];
        return (
          <span key={k} className="text-xs px-2 py-1 rounded bg-gray-700 border border-gray-600">
            <strong>{k}:</strong> {String(c.old)} → {String(c.new)}
          </span>
        );
      })}
    </div>
  );
}

function RecentAdminActivityCard() {
  const [rows, setRows] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load({ cursor } = {}) {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const url = new URL('/api/admin/audit/recent', window.location.origin);
    url.searchParams.set('limit', '25');
    if (cursor) url.searchParams.set('cursorBefore', cursor);

    const res = await fetch(url.toString(), {
      headers: {
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
    });
    const json = await res.json();
    if (res.ok) {
      if (cursor) setRows((prev) => [...prev, ...json.rows]);
      else setRows(json.rows);
      setNextCursor(json.nextCursor || null);
    } else {
      console.error('❌ Failed to load admin activity:', json);
    }
    setLoading(false);
  }

  useEffect(() => { load({}); }, []);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 shadow">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-yellow-400">Recent Admin Activity</h2>
        <a
          href="/api/admin/audit/export"
          className="text-xs text-blue-400 hover:underline"
          title="Download CSV (last 500)"
        >
          Export CSV
        </a>
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="p-3 rounded-lg bg-gray-900 border border-gray-700">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <div>
                <span className="text-gray-400">When:</span>{' '}
                {new Date(r.created_at).toLocaleString()}
              </div>
              <div>
                <span className="text-gray-400">Action:</span> {r.action}
              </div>
            </div>

            <div className="mt-1 text-sm">
              <span className="text-gray-400">Admin:</span>{' '}
              {r.admin_name || '—'} <span className="text-gray-500">({r.admin_email || '—'})</span>
            </div>

            <div className="text-sm">
              <span className="text-gray-400">Target:</span>{' '}
              {r.target_name || '—'} <span className="text-gray-500">({r.target_email || '—'})</span>
            </div>

            <div className="mt-2">
              <DiffChips details={r.details} />
            </div>

            <div className="mt-1 text-xs text-gray-500">
              <span className="mr-3">result: {r.details?.result || 'unknown'}</span>
              {r.details?.reason ? <span className="mr-3">reason: {r.details.reason}</span> : null}
              {r.details?.auth_email_updated ? <span>auth_email_updated</span> : null}
            </div>
          </div>
        ))}

        {!rows.length && !loading && (
          <div className="text-sm text-gray-400">No admin activity yet.</div>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          className="px-3 py-2 text-sm bg-gray-700 rounded text-gray-200 disabled:text-gray-400 disabled:opacity-50 enabled:hover:bg-gray-600"
          onClick={() => load({ cursor: nextCursor })}
          disabled={loading || !nextCursor || rows.length === 0}
        >
          {loading
            ? 'Loading…'
            : nextCursor
            ? 'Load more'
            : rows.length === 0
            ? 'No activity'
            : 'No more'}
        </button>
      </div>
    </div>
  );
}

export default withAuth(AdminPage, "admin");