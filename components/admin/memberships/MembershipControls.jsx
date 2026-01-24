// components/admin/memberships/MembershipControls.jsx
'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function MembershipControls({ membershipId, onChanged }) {
  const [busy, setBusy] = useState(false);

  const [billingDate, setBillingDate] = useState('');
  const [pauseUntil, setPauseUntil] = useState('');
  const [pauseBilling, setPauseBilling] = useState(false);
  const [graceStart, setGraceStart] = useState(() => new Date().toISOString().slice(0,10));
  const [graceEnd, setGraceEnd] = useState('');

  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  async function call(path, body, successText) {
    setBusy(true); setMsg(''); setIsError(false);
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Request failed');
      setMsg(successText || 'Saved ✓');
      onChanged?.();
    } catch (e) {
      setMsg(String(e.message || e));
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  // helpers
  const billingAnchorDay = (() => {
    if (!billingDate) return null;
    const d = new Date(billingDate);
    if (Number.isNaN(d.getTime())) return null;
    return Math.max(1, Math.min(28, d.getDate()));
  })();
  const billingValid = billingAnchorDay !== null;
  const pauseValid = !pauseUntil || !Number.isNaN(new Date(pauseUntil).getTime());
  const graceValid = (() => {
    if (!graceStart || !graceEnd) return false;
    const s = new Date(graceStart);
    const e = new Date(graceEnd);
    return !Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && e > s;
  })();

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-6">
      <h3 className="text-lg font-semibold text-yellow-400">Billing & Access Controls</h3>

      <div className="grid sm:grid-cols-3 gap-3">
        {/* Billing anchor */}
        <div>
          <label className="block text-sm text-gray-300 mb-1">Billing anchor (pick a date)</label>
          <input
            type="date"
            value={billingDate}
            onChange={(e)=>setBillingDate(e.target.value)}
            className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700"
          />
          <div className="flex gap-2 mt-2">
            <button
              disabled={busy || !billingValid}
              onClick={() => {
                const day = billingAnchorDay;
                if (day == null) return;
                call(
                  `/api/admin/memberships/${membershipId}/change-billing-day`,
                  { new_day: day, notes: null, apply_immediately: false },
                  `Billing day set to ${day}. Applies at next renewal.`
                );
              }}
              className="px-3 py-2 rounded bg-yellow-500 text-black disabled:opacity-50"
            >
              Save
            </button>
            <button
              disabled={busy}
              onClick={() =>
                call(
                  `/api/admin/memberships/${membershipId}/change-billing-day`,
                  { clear: true },
                  'Billing anchor override cleared.'
                )
              }
              className="px-3 py-2 rounded bg-gray-700 border border-gray-600 hover:bg-gray-600"
            >
              Clear
            </button>
          </div>
          {!billingValid && (
            <p className="mt-1 text-xs text-red-300">Choose a valid date (we’ll use its day, capped at 28).</p>
          )}
        </div>

        {/* Pause until */}
        <div>
          <label className="block text-sm text-gray-300 mb-1">Pause until (date)</label>
          <input
            type="date"
            value={pauseUntil}
            onChange={(e)=>setPauseUntil(e.target.value)}
            className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700"
          />
          <label className="mt-2 flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={pauseBilling} onChange={e=>setPauseBilling(e.target.checked)} />
            Also pause billing in Stripe
          </label>
          <div className="flex gap-2 mt-2">
            <button
              disabled={busy || !pauseValid}
              onClick={async ()=>{
                await call(
                  `/api/admin/memberships/${membershipId}/pause`,
                  { until: pauseUntil || null, pause_billing: pauseBilling },
                  pauseUntil
                    ? `Paused until ${new Date(pauseUntil).toLocaleDateString()}${pauseBilling ? ' (billing paused)' : ''}.`
                    : 'Pause cleared.'
                );
              }}
              className="px-3 py-2 rounded bg-yellow-500 text-black disabled:opacity-50"
            >
              Save
            </button>
            <button
              disabled={busy}
              onClick={()=> call(
                `/api/admin/memberships/${membershipId}/pause`,
                { clear: true },            // also works with { until: null }
                'Pause cleared.'
              )}
              className="px-3 py-2 rounded bg-gray-700 border border-gray-600 hover:bg-gray-600"
            >
              Clear
            </button>
            <button
              disabled={busy}
              onClick={()=>{ setPauseUntil(''); setPauseBilling(false); }}
              className="px-3 py-2 rounded bg-gray-700"
            >
              Reset fields
            </button>
          </div>
          {!pauseValid && <p className="mt-1 text-xs text-red-300">Enter a valid date.</p>}
        </div>

        {/* Grace period */}
        <div>
          <label className="block text-sm text-gray-300 mb-1">Grace period</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="block text-xs text-gray-400 mb-1">Start</span>
              <input
                type="date"
                value={graceStart}
                onChange={(e)=>setGraceStart(e.target.value)}
                className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700"
              />
            </div>
            <div>
              <span className="block text-xs text-gray-400 mb-1">End</span>
              <input
                type="date"
                value={graceEnd}
                onChange={(e)=>setGraceEnd(e.target.value)}
                className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              disabled={busy || !graceValid}
              onClick={async ()=>{
                await call(
                  `/api/admin/memberships/${membershipId}/set-grace`,
                  { start: graceStart, end: graceEnd },
                  `Grace set: ${new Date(graceStart).toLocaleDateString()} → ${new Date(graceEnd).toLocaleDateString()}.`
                );
              }}
              className="px-3 py-2 rounded bg-yellow-500 text-black disabled:opacity-50"
            >
              Save
            </button>
            <button
              disabled={busy}
              onClick={()=> call(
                `/api/admin/memberships/${membershipId}/set-grace`,
                { clear: true },
                'Grace period cleared.'
              )}
              className="px-3 py-2 rounded bg-gray-700 border border-gray-600 hover:bg-gray-600"
            >
              Clear
            </button>
          </div>
          {!graceValid && (
            <p className="mt-1 text-xs text-red-300">Pick a start and an end date; end must be after start.</p>
          )}
        </div>
      </div>

      {msg && (
        <div className={`text-sm ${isError ? 'text-red-300' : 'text-emerald-300'}`}>
          {msg}
        </div>
      )}
    </div>
  );
}