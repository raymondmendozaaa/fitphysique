'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  formatAdminDateTime,
  getStartOfDayUtcIso,
  getStartOfNextDayUtcIso,
  getTodayDateInputValue,
} from '@/lib/utils/dateTime';

const CHECKINS_SELECT = `
  id,
  checkin_time,
  user_id,
  full_name,
  email,
  location_id,
  location_name,
  geofence_radius_m,
  cooldown_seconds,
  max_accuracy_meters,
  conservative_geofence,
  checkin_type,
  distance_meters,
  accuracy_meters,
  guest_pass_id,
  membership_id,
  membership_status,
  membership_expires_at
`;

function distanceBadgeMeta(distance, radius) {
  if (typeof distance !== 'number' || !Number.isFinite(distance)) {
    return { text: '—', className: 'bg-gray-700 text-gray-300 border border-gray-600', title: 'No distance' };
  }
  if (typeof radius !== 'number' || !Number.isFinite(radius) || radius <= 0) {
    // no radius known — neutral
    return {
      text: `${Math.round(distance)}m`,
      className: 'bg-gray-700 text-gray-300 border border-gray-600',
      title: `${Math.round(distance)}m from center (no geofence radius set)`,
    };
  }

  const pct = distance / radius; // 1.0 = exactly at the fence
  const pctText = Math.round(pct * 100);

  // outside current fence (possible if radius was reduced after this check-in)
  if (distance > radius) {
    return {
      text: `${Math.round(distance)}m`,
      className: 'bg-red-900/50 text-red-300 border border-red-700',
      title: `${Math.round(distance)}m from center • exceeds fence (${radius}m, ${pctText}%)`,
    };
  }

  // snug on the center
  if (distance <= 5) {
    return {
      text: `${Math.round(distance)}m`,
      className: 'bg-green-900/50 text-green-300 border border-green-700',
      title: `${Math.round(distance)}m from center (${radius}m fence)`,
    };
  }

  // near the edge (>=80% of radius)
  if (pct >= 0.8) {
    return {
      text: `${Math.round(distance)}m`,
      className: 'bg-yellow-900/50 text-yellow-300 border border-yellow-700',
      title: `${Math.round(distance)}m from center • near fence (${radius}m, ${pctText}%)`,
    };
  }
  
  // normal, inside fence
  return {
    text: `${Math.round(distance)}m`,
    className: 'bg-gray-700 text-gray-200 border border-gray-600',
    title: `${Math.round(distance)}m from center (${radius}m, ${pctText}%)`,
  };
}

function accuracyBadgeMeta(accuracy, maxAccuracy) {
  if (typeof accuracy !== "number" || !Number.isFinite(accuracy)) {
    return {
      text: "—",
      className: "bg-gray-700 text-gray-300 border border-gray-600",
      title: "No accuracy data",
    };
  }
  
  if (typeof maxAccuracy !== "number" || !Number.isFinite(maxAccuracy) || maxAccuracy <= 0) {
    return {
      text: `${Math.round(accuracy)}m`,
      className: "bg-gray-700 text-gray-300 border border-gray-600",
      title: `${Math.round(accuracy)}m accuracy`,
    };
  }

  if (accuracy > maxAccuracy) {
    return {
      text: `${Math.round(accuracy)}m`,
      className: "bg-red-900/50 text-red-300 border border-red-700",
      title: `Accuracy exceeds allowed threshold (${maxAccuracy}m)`,
    };
  }

  if (accuracy >= maxAccuracy * 0.8) {
    return {
      text: `${Math.round(accuracy)}m`,
      className: "bg-yellow-900/50 text-yellow-300 border border-yellow-700",
      title: `Accuracy near threshold (${maxAccuracy}m)`,
    };
  }

  return {
    text: `${Math.round(accuracy)}m`,
    className: "bg-green-900/50 text-green-300 border border-green-700",
    title: `Accuracy within threshold (${maxAccuracy}m)`,
  };
}

function prettyMethod(method) {
  if (!method) return "—";
  if (method === "geolocation") return "Geolocation";
  if (method === "qr") return "QR";
  if (method === "manual") return "Manual";
  return method;
}

function isCheckinFlagged(row) {
  const accuracyFlagged =
    typeof row.accuracy_meters === 'number' &&
    typeof row.max_accuracy_meters === 'number' &&
    row.accuracy_meters > row.max_accuracy_meters;

  const distanceFlagged =
    typeof row.distance_meters === 'number' &&
    typeof row.geofence_radius_m === 'number' &&
    row.distance_meters > row.geofence_radius_m;

  return accuracyFlagged || distanceFlagged;
}

function getAccessLabel(row) {
  if (row.membership_id) {
    return `Membership${row.membership_status ? ` • ${row.membership_status}` : ''}`;
  }

  if (row.guest_pass_id) {
    return 'Guest Pass';
  }

  return '—';
}

function renderBadge(meta) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded border ${meta.className}`}
      title={meta.title}
    >
      {meta.text}
    </span>
  );
}

export default function AdminCheckinsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [start, setStart] = useState(() => getTodayDateInputValue());
  const [end, setEnd] = useState(() => getTodayDateInputValue());
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [method, setMethod] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  function handleClearFilters() {
    const today = getTodayDateInputValue();

    setStart(today);
    setEnd(today);
    setLocationId('');
    setMethod('');
    setSearch('');
    setPage(1);
  }

  const paged = useMemo(() => {
    const s = (page - 1) * pageSize;
    return rows.slice(s, s + pageSize);
  }, [rows, page, pageSize]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));

  const summaryStats = useMemo(() => {
    let membershipCheckins = 0;
    let guestPassCheckins = 0;
    let flaggedCheckins = 0;

    for (const row of rows) {
      if (row.membership_id) membershipCheckins += 1;
      if (row.guest_pass_id) guestPassCheckins += 1;

      if (isCheckinFlagged(row)) {
        flaggedCheckins += 1;
      }
    }

    return {
      membershipCheckins,
      guestPassCheckins,
      flaggedCheckins,
    };
  }, [rows]);

  useEffect(() => {
    (async () => {
      try {
        const { data: locs, error } = await supabase
          .from('locations')
          .select('id, name')
          .order('name', { ascending: true });

        if (error) throw error;
        setLocations(locs || []);
      } catch (e) {
        console.error('Failed to load locations:', e);
      }
    })();
  }, []);

  useEffect(() => {
    let isActive = true;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        if (start && end && start > end) {
          if (!isActive) return;
          setRows([]);
          setErr('Start date cannot be after end date.');
          return;
        }

        const startUtc = start ? getStartOfDayUtcIso(start) : null;
        const endUtcExclusive = end ? getStartOfNextDayUtcIso(end) : null;

        let q = supabase
          .from('v_checkins_enriched')
          .select(CHECKINS_SELECT)
          .order('checkin_time', { ascending: false });

        if (startUtc) q = q.gte('checkin_time', startUtc);
        if (endUtcExclusive) q = q.lt('checkin_time', endUtcExclusive);

        if (locationId) q = q.eq('location_id', locationId);
        if (method) q = q.eq('checkin_type', method);

        const trimmedSearch = search.trim();
        if (trimmedSearch) {
          const term = `%${trimmedSearch}%`;
          q = q.or(`full_name.ilike.${term},email.ilike.${term}`);
        }

        const { data, error } = await q;
        if (error) throw error;

        if (!isActive) return;
        setRows(data || []);
        setPage(1);
      } catch (e) {
        if (!isActive) return;
        console.error('Failed to load check-ins:', e);
        setErr('Failed to load check-ins.');
      } finally {
        if (isActive) setLoading(false);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [start, end, locationId, method, search]);

  return (
    <div className="p-8 min-h-screen bg-gray-900 text-white">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-3xl font-bold text-yellow-400 mr-auto">Check-ins</h1>

        <input
          type="date"
          className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          title="Start date"
        />
        <input
          type="date"
          className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          title="End date"
        />

        <select
          className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          title="Location"
        >
          <option value="">All locations</option>
          {locations.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>

        <select
          className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          title="Method"
        >
          <option value="">All methods</option>
          <option value="geolocation">geolocation</option>
          <option value="qr">qr</option>
          <option value="manual">manual</option>
        </select>

        <input
          type="text"
          placeholder="Search name/email..."
          className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <button
          className="px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600"
          onClick={handleClearFilters}
          title="Clear filters"
        >
          Clear
        </button>
      </div>

      {err && (
        <div className="mb-4 p-3 rounded bg-red-900/40 border border-red-700 text-red-300">
          {err}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3">
          <div className="text-xs text-gray-400">Membership check-ins</div>
          <div className="text-lg font-semibold text-green-300">
            {summaryStats.membershipCheckins}
          </div>
        </div>

        <div className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3">
          <div className="text-xs text-gray-400">Guest pass check-ins</div>
          <div className="text-lg font-semibold text-blue-300">
            {summaryStats.guestPassCheckins}
          </div>
        </div>

        <div className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3">
          <div className="text-xs text-gray-400">Low-accuracy / flagged</div>
          <div className="text-lg font-semibold text-red-300">
            {summaryStats.flaggedCheckins}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-gray-300">
          {loading ? 'Loading…' : `Total: ${rows.length.toLocaleString()}`}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-300">Page size</label>
          <select
            className="px-2 py-1 rounded bg-gray-800 border border-gray-700"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 bg-gray-800 border border-gray-700 rounded disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Prev
            </button>
            <span className="text-sm text-gray-300">
              Page {page} / {pageCount}
            </span>
            <button
              className="px-2 py-1 bg-gray-800 border border-gray-700 rounded disabled:opacity-50"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto bg-gray-800 rounded-lg shadow border border-gray-700">
        <table className="min-w-full table-auto text-left">
          <thead className="bg-gray-700 text-gray-300">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Distance (m)</th>
              <th className="px-4 py-3">Accuracy (m)</th>
              <th className="px-4 py-3">Access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-yellow-400">
                  Loading check-ins…
                </td>
              </tr>
            )}

            {!loading && paged.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  No check-ins found for the selected filters.
                </td>
              </tr>
            )}

            {!loading && paged.map(r => {
              const access = getAccessLabel(r);

              const flagged = isCheckinFlagged(r);
                    
              return (
                <tr
                  key={r.id}
                  className={flagged ? "bg-red-950/20" : ""}
                >
                  <td className="px-4 py-3 whitespace-nowrap">{formatAdminDateTime(r.checkin_time)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {r.user_id ? (
                        <a
                          href={`/admin/customers/${encodeURIComponent(r.user_id)}`}
                          className="text-yellow-300 hover:underline"
                        >
                          {r.full_name || '—'}
                        </a>
                      ) : (
                        r.full_name || '—'
                      )}
                    </div>
                    <div className="text-gray-300 text-sm">{r.email || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                        <span>{r.location_name || '-'}</span>
                        {r.location_id && (
                            <a
                              href={`/admin/locations?focus=${encodeURIComponent(r.location_id)}`}
                              title={`Geofence: ${r.geofence_radius_m ?? '-'}m • Cooldown: ${r.cooldown_seconds ?? '-'}s • Max accuracy: ${r.max_accuracy_meters ?? '-'}m${r.conservative_geofence ? ' • Conservative' : ''}`}
                              className="text-xs px-2 py-1 rounded bg-gray-700 border border-gray-600 hover:bg-gray-600"
                            >
                                ⚙️
                            </a>
                        )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {prettyMethod(r.checkin_type)}
                  </td>
                  <td className="px-4 py-3">
                    {renderBadge(distanceBadgeMeta(r.distance_meters, r.geofence_radius_m))}
                  </td>
                  <td className="px-4 py-3">
                    {renderBadge(accuracyBadgeMeta(r.accuracy_meters, r.max_accuracy_meters))}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className={`px-2 py-1 rounded text-sm w-fit ${
                        r.membership_id
                          ? 'bg-green-900/50 text-green-300 border border-green-700'
                          : r.guest_pass_id
                            ? 'bg-blue-900/50 text-blue-300 border border-blue-700'
                            : 'bg-gray-700 text-gray-300 border border-gray-600'
                      }`}>
                        {access}
                      </span>
                    
                      {r.membership_id && r.membership_expires_at && (
                        <span className="text-xs text-gray-400">
                          Expires: {formatAdminDateTime(r.membership_expires_at)}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}