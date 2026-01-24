// app/admin/customers/page.jsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import withAuth from "@/lib/withAuth";

const DEFAULT_PAGE_SIZE = 25;

function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

function roleBadge(role) {
  const map = {
    admin:   "bg-purple-600/30 text-purple-200 border-purple-500/40",
    manager: "bg-blue-600/30 text-blue-200 border-blue-500/40",
    staff:   "bg-sky-600/30 text-sky-200 border-sky-500/40",
    member:  "bg-green-600/30 text-green-200 border-green-500/40",
    guest:   "bg-yellow-600/30 text-yellow-200 border-yellow-500/40",
  };
  const cls = map[role] || "bg-gray-700 text-gray-200 border-gray-600";
  return <span className={`text-xs px-2 py-1 rounded border ${cls}`}>{role || "unknown"}</span>;
}

function statusBadge(label) {
  const map = {
    "Active · membership":      "border-green-500 text-green-300",
    "Suspended · membership":   "border-orange-500 text-orange-300",
    "Expired · membership":     "border-yellow-500 text-yellow-300",
    "Active · guest pass":      "border-blue-500 text-blue-300",
    "Expired · guest pass":     "border-slate-500 text-slate-300",
    "None":                     "border-gray-600 text-gray-300",
  };
  const cls = map[label] || map["None"];
  return <span className={`text-xs px-2 py-1 rounded border ${cls} bg-transparent`}>{label}</span>;
}

function CustomersHub() {
  const router = useRouter();

  const searchParams = useSearchParams();
  const pathname = usePathname();

  const initialQ            = searchParams.get("q") ?? "";
  const initialPage         = Math.max(1, Number(searchParams.get("page") ?? 1));
  const initialSortKey      = searchParams.get("sortKey") ?? "status";
  const initialSortDir      = (searchParams.get("sortDir") ?? "asc") === "desc" ? "desc" : "asc";
  const initialIncludeAdmins= (searchParams.get("includeAdmins") ?? "false") === "true";
  const initialIncludeStaff = (searchParams.get("includeStaff")  ?? "false") === "true"; 
  
  const initialPageSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE))
  );

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(initialQ);
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState(initialSortKey);
  const [sortDir, setSortDir] = useState(initialSortDir);

  const [includeAdmins, setIncludeAdmins] = useState(initialIncludeAdmins);
  const [includeStaff, setIncludeStaff]   = useState(initialIncludeStaff);

  const dq = useDebounced(q, 450);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [total, page, pageSize]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (page !== 1) params.set("page", String(page));
    if (sortKey !== "status") params.set("sortKey", sortKey);
    if (sortDir !== "asc") params.set("sortDir", sortDir);
    if (includeAdmins) params.set("includeAdmins", "true");
    if (includeStaff) params.set("includeStaff", "true");
    if (pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(pageSize));

    const qs = params.toString();
    // avoid full-page nav; this just updates the URL
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [q, page, sortKey, sortDir, includeAdmins, includeStaff, pageSize, pathname, router]);

  // Server-driven search/sort/pagination
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          q: dq,
          page: String(page),
          pageSize: String(pageSize),
          sortKey,
          sortDir,
          includeAdmins: String(includeAdmins),
          includeStaff: String(includeStaff),
        });
        const res = await fetch(`/api/admin/customers?${params.toString()}`, { 
          cache: "no-store",
          signal: ctrl.signal, 
        });
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        setRows(json.rows || []);
        setTotal(json.total || 0);
      } catch (e) {
        if (e.name !== "AbortError") {
          setError(e.message || "Failed to load customers.");
          console.error(e);
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [dq, page, sortKey, sortDir, includeAdmins, includeStaff, pageSize]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  function openCustomer(id) {
    router.push(`/admin/customers/${id}`);
  }

  const COLS = 6;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold text-yellow-400 mr-auto">Customers</h1>

        <div className="relative">
          <input
            className="pl-3 pr-8 py-2 rounded-md bg-gray-800 border border-gray-700"
            placeholder="Search name, email, phone…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          {q && (
            <button
              type="button"
              title="Clear search"
              onClick={() => {
                setQ("");
                setPage(1);
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 px-2 py-1 text-gray-300 hover:text-white"
              aria-label="Clear search"
              >
                ✕
              </button>
          )}
        </div>

        {/* Include staff toggle */}
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={includeStaff}
            onChange={(e) => {
              setIncludeStaff(e.target.checked);
              setPage(1);
            }}
          />
          Include staff (manager/staff)
        </label>

        {/* Include admins toggle */}
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={includeAdmins}
            onChange={(e) => {
              setIncludeAdmins(e.target.checked);
              setPage(1);
            }}
          />
          Include admins
        </label>

        <label className="flex items-center gap-2 text-sm text-gray-300">
          Rows per page
          <select
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100"
            value={pageSize}
            onChange={(e) => {
              const next = Number(e.target.value);
              setPageSize(next);
              setPage(1); // reset when page size changes
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-900/40 border border-red-700 text-red-300">
          {error}
        </div>
      )}

      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-700 text-gray-300">
            <tr>
              <th
                className="px-4 py-3 w-24 cursor-pointer"
                onClick={() => toggleSort("customer_no")}
                title="Sort by customer number"
              >
                #
                {sortKey === "customer_no" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
              </th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort("full_name")}>
                Name {sortKey === "full_name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort("email")}>
                Email {sortKey === "email" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort("status")}>
                Status {sortKey === "status" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {loading ? (
              <tr>
                <td colSpan={COLS} className="px-4 py-6 text-center text-yellow-400">Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={COLS} className="px-4 py-6 text-center text-gray-400">No customers found.</td>
              </tr>
            ) : (
              rows.map((u) => {
                const label = u.status_label || "None";
                return (
                  <tr
                    key={u.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openCustomer(u.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openCustomer(u.id);
                      }
                    }}
                    className="cursor-pointer hover:bg-yellow-900/10 focus-visible:bg-yellow-900/15 focus-visible:outline-none"
                    title="Open customer"
                  >
                    <td className="px-4 py-3 font-mono text-sm text-gray-300">{u.customer_no ?? "—"}</td>
                    <td className="px-4 py-3">{u.full_name || "—"}</td>
                    <td className="px-4 py-3 break-words">{u.email || "—"}</td>
                    <td className="px-4 py-3">{u.phone || "—"}</td>
                    <td className="px-4 py-3">{roleBadge(u.role)}</td>
                    <td className="px-4 py-3">{statusBadge(label)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-400">
          {total} total • Page {page} of {pageCount} • {pageSize}/page
        </div>
        <div className="flex gap-2">
          <button
            className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700 disabled:opacity-50"
            onClick={() => !loading && setPage((p) => Math.max(1, p - 1))}
            disabled={loading || page <= 1}
          >
            Prev
          </button>
          <button
            className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700 disabled:opacity-50"
            onClick={() => !loading && setPage((p) => Math.min(pageCount, p + 1))}
            disabled={loading || page >= pageCount}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default withAuth(CustomersHub, "admin");