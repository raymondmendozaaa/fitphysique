'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

function formatDT(d) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d ?? '—';
  }
}

export default function AdminCheckinsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // filters
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [method, setMethod] = useState('');
  const [search, setSearch] = useState('');
  const [start, setStart] = useState(() => {
    const d = new Date(); d.setHours(0,0,0,0);
    return d.toISOString().slice(0,10);
  });
  const [end, setEnd] = useState(() => {
    const d = new Date(); d.setHours(23,59,59,999);
    return d.toISOString().slice(0,10);
  });

  // pagination (client-side for MVP)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null);
      try {
        // Load locations for dropdown
        const { data: locs } = await supabase
          .from('locations')
          .select('id, name')
          .order('name', { ascending: true });
        setLocations(locs || []);

        // Build query with server-side filters where possible
        let q = supabase
          .from('v_checkins_enriched')
          .select('id, checkin_time, user_id, full_name, email, location_id, location_name, geofence_radius_m, cooldown_seconds, max_accuracy_meters, conservative_geofence, checkin_type, distance_meters, accuracy_meters, guest_pass_id, membership_id, membership_status, membership_expires_at')
          .order('checkin_time', { ascending: false });

        // Date range (inclusive for the day)
        if (start) q = q.gte('checkin_time', new Date(`${start}T00:00:00`).toISOString());
        if (end)   q = q.lte('checkin_time', new Date(`${end}T23:59:59.999`).toISOString());

        if (locationId) q = q.eq('location_id', locationId);
        if (method) q = q.eq('checkin_type', method);
        if (search?.trim()) {
          const term = `%${search.trim()}%`;
          // supabase needs separate ilike calls combined via or()
          q = q.or(`full_name.ilike.${term},email.ilike.${term}`);
        }

        const { data, error } = await q;
        if (error) throw error;
        setRows(data || []);
        setPage(1); // reset page when filter changes
      } catch (e) {
        console.error(e);
        setErr('Failed to load check-ins.');
      } finally {
        setLoading(false);
      }
    })();
  }, [start, end, locationId, method, search]);

  const paged = useMemo(() => {
    const s = (page - 1) * pageSize;
    return rows.slice(s, s + pageSize);
  }, [rows, page, pageSize]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));

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
          <option value="qr_magic_link">qr_magic_link</option>
          <option value="barcode">barcode</option>
          <option value="nfc">nfc</option>
          <option value="pin">pin</option>
          <option value="kiosk">kiosk</option>
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
          onClick={() => { setStart(''); setEnd(''); setLocationId(''); setMethod(''); setSearch(''); }}
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

      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-gray-300">
          {loading ? 'Loading…' : `Total: ${rows.length.toLocaleString()}`}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-300">Page size</label>
          <select
            className="px-2 py-1 rounded bg-gray-800 border border-gray-700"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {[10,25,50,100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 bg-gray-800 border border-gray-700 rounded disabled:opacity-50"
              onClick={() => setPage(p => Math.max(1, p-1))}
              disabled={page<=1}
            >Prev</button>
            <span className="text-sm text-gray-300">Page {page} / {pageCount}</span>
            <button
              className="px-2 py-1 bg-gray-800 border border-gray-700 rounded disabled:opacity-50"
              onClick={() => setPage(p => Math.min(pageCount, p+1))}
              disabled={page>=pageCount}
            >Next</button>
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
              const access =
                r.membership_id ? 'Membership' :
                r.guest_pass_id ? 'Guest Pass' : '—';
              return (
                <tr key={r.id}>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDT(r.checkin_time)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.full_name || '—'}</div>
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
                    <div className="flex items-center gap-2">
                      <span>{r.checkin_type || '—'}</span>
                      {(() => {
                        const { text, className, title } = distanceBadgeMeta(r.distance_meters, r.geofence_radius_m);
                        return (
                          <span
                            className={`text-xs px-2 py-0.5 rounded border ${className}`}
                            title={title}
                          >
                            {text}
                          </span>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="px-4 py-3">{typeof r.distance_meters === 'number' ? Math.round(r.distance_meters) : '—'}</td>
                  <td className="px-4 py-3">{typeof r.accuracy_meters === 'number' ? Math.round(r.accuracy_meters) : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-sm ${
                      access === 'Membership' ? 'bg-green-900/50 text-green-300 border border-green-700' :
                      access === 'Guest Pass' ? 'bg-blue-900/50 text-blue-300 border border-blue-700' :
                      'bg-gray-700 text-gray-300 border border-gray-600'
                    }`}>
                      {access}
                    </span>
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
