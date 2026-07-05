// app/admin/memberships/[membershipId]/page.jsx
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import withAuth from '@/lib/withAuth';
import { supabase } from '@/lib/supabaseClient';
import MembershipControls from '@/components/admin/memberships/MembershipControls';
import Link from 'next/link';
import { 
  formatAdminDate, 
  formatAdminDateTime,
  getNowUtcIso,
  toValidDate,
} from '@/lib/utils/dateTime';

function MembershipDetailPage() {
  const { membershipId } = useParams();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [row, setRow] = useState(null);
  const [override, setOverride] = useState(null);

  const load = useCallback(async () => {
    if (!membershipId) return;
    setLoading(true);
    setErr(null);
    try {
      // main row
      const { data, error } = await supabase
        .from('v_memberships_with_flags')
        .select('*')
        .eq('membership_id', membershipId)
        .maybeSingle();
      if (error) throw error;
      setRow(data);

      // overrides (fetch once)
      const { data: ov, error: oe } = await supabase
        .from('membership_overrides')
        .select('desired_billing_day, pause_until, grace_start, grace_end, notes, updated_at')
        .eq('membership_id', membershipId)
        .maybeSingle();
      if (oe) throw oe;
      setOverride(ov || null);
    } catch (e) {
      console.error('membership detail load error:', e);
      setErr('Failed to load membership.');
    } finally {
      setLoading(false);
    }
  }, [membershipId]);

  useEffect(() => { load(); }, [load]);

  // helpers for badges
  const hasBillingDayOverride = !!override?.desired_billing_day;
  const hasGrace = !!override?.grace_start && !!override?.grace_end;
  const isPaused = useMemo(() => {
    const until = toValidDate(override?.pause_until);
    if (!until) return false;
    
    const now = toValidDate(getNowUtcIso());
    if (!now) return false;
    
    return until.getTime() > now.getTime();
  }, [override?.pause_until]);

  return (
    <div className="p-8 min-h-screen bg-gray-900 text-white">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-yellow-400">Membership Details</h1>
        <Link
          href="/admin/memberships"
          className="px-3 py-2 rounded bg-gray-800 border border-gray-700 hover:bg-gray-700"
        >
          ← Back to Memberships
        </Link>
      </div>

      {err && (
        <div className="mb-4 p-3 rounded bg-red-900/40 border border-red-700 text-red-300">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-gray-300">Loading…</div>
      ) : !row ? (
        <div className="text-gray-300">Not found.</div>
      ) : (
        <>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-6">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-gray-400">Member</div>
                <div className="font-medium">
                  {row.full_name || '—'}{' '}
                  <span className="text-gray-400">({row.email || '—'})</span>
                </div>
              </div>

              <div>
                <div className="text-gray-400">Status</div>
                <div className="font-medium">{row.status || '—'}</div>
              </div>

              <div>
                <div className="text-gray-400">Plan</div>
                <div className="font-medium">
                  {row.plan_name ? `${row.plan_name} — ${row.duration_label}` : '—'}
                </div>
              </div>

              <div>
                <div className="text-gray-400">Requires Contract</div>
                <div className="font-medium">{row.requires_contract ? 'Yes' : 'No'}</div>
              </div>

              <div>
                <div className="text-gray-400">Next Payment</div>
                <div className="font-medium flex flex-wrap items-center gap-2">
                  {row.next_payment_date ? formatAdminDate(row.next_payment_date) : '—'}

                  {hasBillingDayOverride && (
                    <span
                      className="text-xs px-2 py-1 rounded-full bg-blue-900/40 border border-blue-700 text-blue-200"
                      title="Billing-day change will apply at the next renewal."
                    >
                      Billing day → {override.desired_billing_day}
                    </span>
                  )}

                  {hasGrace && (
                    <span
                      className="text-xs px-2 py-1 rounded-full bg-emerald-900/40 border border-emerald-700 text-emerald-200"
                      title="Temporary grace access window"
                    >
                      Grace {formatAdminDate(override.grace_start)}–{formatAdminDate(override.grace_end)}
                    </span>
                  )}

                  {isPaused && (
                    <span
                      className="text-xs px-2 py-1 rounded-full bg-yellow-900/40 border border-yellow-700 text-yellow-200"
                      title="Membership is paused until this date"
                    >
                      Paused until {formatAdminDate(override.pause_until)}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-gray-400">Contract Ends</div>
                <div className="font-medium">
                  {row.contract_end_date ? formatAdminDate(row.contract_end_date) : '—'}
                </div>
              </div>

              <div>
                <div className="text-gray-400">Stripe Sub</div>
                <div className="font-medium">{row.stripe_subscription_id || '—'}</div>
              </div>

              <div>
                <div className="text-gray-400">Period End</div>
                <div className="font-medium">
                  {row.current_period_end ? formatAdminDateTime(row.current_period_end) : '—'}
                </div>
              </div>
            </div>

            {/* One clear overrides panel */}
            {override &&
              (override.desired_billing_day ||
                override.pause_until ||
                (override.grace_start && override.grace_end)) && (
                <div className="mt-4 p-3 rounded bg-blue-900/40 border border-blue-700 text-blue-200 text-sm">
                  <div className="font-semibold mb-1">Membership Overrides</div>
                  <ul className="list-disc ml-5 space-y-1">
                    {override.desired_billing_day && (
                      <li>
                        Billing anchor will move to day {override.desired_billing_day} on next renewal.
                      </li>
                    )}
                    {override.pause_until && (
                      <li>
                        Access paused until {formatAdminDate(override.pause_until)}.
                      </li>
                    )}
                    {override.grace_start && override.grace_end && (
                      <li>
                        Grace: {formatAdminDate(override.grace_start)} → {formatAdminDate(override.grace_end)}.
                      </li>
                    )}
                  </ul>
                </div>
              )}
          </div>

          <MembershipControls membershipId={membershipId} onChanged={load} />
        </>
      )}
    </div>
  );
}

export default withAuth(MembershipDetailPage, 'admin');