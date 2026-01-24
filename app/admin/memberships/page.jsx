'use client';

import React from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import withAuth from '@/lib/withAuth';
import RowActions from '@/components/admin/memberships/RowActions';
import SaveViewModal from '@/components/admin/memberships/SaveViewModal';
import MagicLinkQrModal from '@/components/admin/memberships/MagicLinkQrModal';
import EditContactModal from '@/components/admin/memberships/EditContactModal';
import BulkSuspendModal from '@/components/admin/memberships/BulkSuspendModal';
import ModifyMembershipModal from '@/components/admin/memberships/ModifyMembershipModal';
import { presetViews } from '@/lib/admin/memberships/views';
import KpiStrip from '@/components/admin/memberships/KpiStrip';
import FiltersPanel from '@/components/admin/memberships/FiltersPanel';
import PaginationBar from '@/components/admin/memberships/PaginationBar';
import SelectionBar from '@/components/admin/memberships/SelectionBar';
import CreateMembershipSlideOver from '@/components/admin/memberships/CreateMembershipSlideOver';
import { exportCsv as exportCsvUtil } from '@/lib/admin/memberships/exportCsv';
import { showSuccess, showError, showInfo, askConfirm } from '@/lib/utils/toastUtils';

const MembershipsPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [contractFilter, setContractFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [memberships, setMemberships] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [cancelAction, setCancelAction] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [suspendedUntil, setSuspendedUntil] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createUserId, setCreateUserId] = useState('');
  const [createPlan, setCreatePlan] = useState('');
  const [createDurationId, setCreateDurationId] = useState('');
  const [planGroups, setPlanGroups] = useState({});
  const [availableUsers, setAvailableUsers] = useState([]);
  const [createStartDate, setCreateStartDate] = useState('');
  const [paymentMode, setPaymentMode] = useState('checkout');
  const [offlineMethod, setOfflineMethod] = useState('cash');
  const [offlineAmount, setOfflineAmount] = useState('');
  const [offlineNotes, setOfflineNotes] = useState('');
  const [checkoutBehavior, setCheckoutBehavior] = useState('bill_today_start_today');
  const [createAutoRenewalEnabled, setCreateAutoRenewalEnabled] = useState(true);
  const [createRenewAtDiscountedRate, setCreateRenewAtDiscountedRate] = useState(false);
  const [showUserCreateModal, setShowUserCreateModal] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [pendingNewUser, setPendingNewUser] = useState(null);
  const [newPhone, setNewPhone] = useState("");
  const [newSmsOptIn, setNewSmsOptIn] = useState(false);
  const [showEditContact, setShowEditContact] = useState(false);
  const [editContactUser, setEditContactUser] = useState(null); // { id, full_name, email, phone, sms_opt_in }
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editSmsOptIn, setEditSmsOptIn] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [qrLink, setQrLink] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [activeView, setActiveView] = useState(null);
  const [savedViews, setSavedViews] = useState([]);
  const [showSaveViewModal, setShowSaveViewModal] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // Bulk selection + suspend modal state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkSuspend, setShowBulkSuspend] = useState(false);
  const [bulkSuspendUntil, setBulkSuspendUntil] = useState('');
  const [bulkSuspendReason, setBulkSuspendReason] = useState('');

  // ---- fast-copy cache + session reuse ----
  const linkCache = React.useRef(new Map()); // key: `${userId}:${purpose}` -> string
  const [sessionToken, setSessionToken] = useState(null);

  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount =
    (searchQuery ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (contractFilter ? 1 : 0) +
    (planFilter ? 1 : 0);

  // grab the session once and reuse it
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionToken(session?.access_token || null);
    });
  }, []);

  async function getMagicLinkCached(userId, purpose) {
    const key = `${userId}:${purpose}`;
    if (linkCache.current.has(key)) return linkCache.current.get(key);

    // Just-in-time token refresh if we don't have one yet
    let token = sessionToken;
    if (!token) {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token || null;
      if (token && !sessionToken) setSessionToken(token);
    }

    const next = purpose === 'signup' ? '/onboarding' : '/member';

    // Optional: short timeout so a stuck request doesn't hang UX
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 7000);

    const res = await fetch('/api/admin/users/magic-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ userId, purpose, channel: 'copy', next }),
      signal: ac.signal,
    });

    clearTimeout(t);

    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || 'Failed to create link');

    linkCache.current.set(key, data.magicLink);
    return data.magicLink;
  }

  function flashCopied(key) {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 900);
  }

  const hasMember = (createUserId && createUserId !== "__new__") || !!pendingNewUser;

  const fetchMemberships = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('v_memberships_with_flags')
      .select('*');

    if (error) {
      console.error('❌ Error fetching memberships:', error);
    } else {
      setMemberships((data || []).map((row) => ({
        id: row.membership_id,
        user_id: row.user_id,
        full_name: row.full_name,
        email: row.email,
        onboarded: row.onboarded,
        phone: row.phone,
        sms_opt_in: row.sms_opt_in,
        status: row.status,
        start_date: row.start_date,
        expires_at: row.expires_at,
        next_payment_date: row.next_payment_date,
        contract_end_date: row.contract_end_date,
        plan_duration_id: row.plan_duration_id,
        auto_renewal_enabled: row.auto_renewal_enabled,
        renewal_pending: row.renewal_pending,
        renewal_attempt_count: row.renewal_attempt_count,
        last_renewal_attempt: row.last_renewal_attempt,
        paid_in_full: row.paid_in_full,
        renew_at_discounted_rate: row.renew_at_discounted_rate,
        inactive_since: row.inactive_since,
        suspended_until: row.suspended_until,
        cancelled_on: row.cancelled_on,
        cancelled_by_user_id: row.cancelled_by_user_id,
        cancelled_by_role: row.cancelled_by_role,
        location_id: row.location_id,
        plan_name: row.plan_name,
        duration_label: row.duration_label,
        requires_contract: row.requires_contract,
        needs_contract: row.needs_contract,
        days_since_start: row.days_since_start,
        last_payment_status: row.last_payment_status,
        last_payment_date: row.last_payment_date,
        trial_type: row.trial_type,
        pass_source: row.pass_source,
        promo_start_date: row.promo_start_date,
        promo_end_date: row.promo_end_date,
        stripe_session_id: row.stripe_session_id,
        stripe_subscription_id: row.stripe_subscription_id,
        stripe_payment_intent: row.stripe_payment_intent,
      })));
    }
    setLoading(false);
  };

  async function adminCreateMembership({ mode }) {
    if (!hasMember || !createDurationId) {
      showError('Member (existing or new) and duration are required.');
      return;
    }

    const { data: auth } = await supabase.auth.getUser();
    const adminId = auth?.user?.id || null;

    const payload = {
      userId: createUserId && createUserId !== "__new__" ? createUserId : null,
      planDurationId: createDurationId,
      paymentMode: mode, // 'checkout' | 'comped'
      paidInFull: false,
      autoRenewalEnabled: !!createAutoRenewalEnabled,
      renewAtDiscountedRate: !!(createAutoRenewalEnabled && isPaidInFullSelected && createRenewAtDiscountedRate),
      isRenewal: false,
      startDate: createStartDate || new Date().toISOString(),
      locationId: null,
      createdBy: { role: 'admin', id: adminId },
      checkoutBehavior,
      offlinePayment: {
        method: offlineMethod,
        amount: offlineMethod === "comp" ? 0 : Number(offlineAmount),
        notes: offlineNotes || null,
      },
      newUser:
        createUserId === "__new__" && pendingNewUser
          ? {
              full_name: pendingNewUser.full_name || null,
              email: pendingNewUser.email,
              phone: pendingNewUser.phone || null,
              sms_opt_in: !!pendingNewUser.sms_opt_in,
              role: "member",
            }
          : null,
    };

    if (mode === 'comped') {
      if ((offlineMethod === 'cash' || offlineMethod === 'check') && !(Number(offlineAmount) > 0)) {
        showError('Amount must be greater than 0 for cash/check.');
        return;
      }
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/memberships/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error('❌ create failed:', data);
        showError(data?.message || 'Failed to create membership.');
        return;
      }

      if (data.signUrl) {
        window.open(data.signUrl, "_blank", "noopener,noreferrer");
        showInfo('Contract link opened in a new tab. Have the member sign to continue.');
        try { await navigator.clipboard.writeText(data.signUrl); } catch {}
        return; // stop here — user is signing a contract
      }

      if (data.checkoutUrl) {
        showSuccess('Redirecting to checkout…');
        window.location.href = data.checkoutUrl;
        return; // stop here — browser leaves the page
      }

      // ✅ If we reach here, treat as successful offline creation
      await fetchMemberships();
      setShowCreateModal(false);
      resetCreateModalFields();
      showSuccess('Membership created.');
    } catch (e) {
      console.error(e);
      showError('Unexpected error while creating membership.');
    }
  }

  async function showQrForUser(userId) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/users/magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          userId,
          channel: 'qr',
          purpose: 'login',
          next: '/member',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to create QR login link');

      const dataUrl = await QRCode.toDataURL(data.magicLink, {
        width: 300,
        margin: 1,
        errorCorrectionLevel: 'M',
      });

      setQrLink(dataUrl);
      setShowQr(true);
      showInfo('QR code ready.');
    } catch (err) {
      console.error(err);
      showError(err.message || 'Failed to create QR link');
    }
  }

    async function sendLink(userId, purpose, delivery = 'email') {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const next = purpose === 'signup' ? '/onboarding' : '/member';

      const res = await fetch('/api/admin/users/magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ userId, purpose, channel: delivery, next }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to create link');

      if (delivery === 'email') {
        showSuccess(`${purpose} link emailed to ${data.email}`);
      } else {
        await navigator.clipboard.writeText(data.magicLink);
        flashCopied(`${userId}:${purpose}`);
        showSuccess('Link copied to clipboard.');
      }
    } catch (err) {
      console.error(err);
      showError(err.message || 'Failed to create/send link.');
    }
  }

  async function smsMagicLink({ user }) {
    try {
      let override = false;
      let override_reason;
      if (!user?.sms_opt_in) {
        const ok = await askConfirm('This member has not opted into SMS. Send anyway?');
        if (!ok) return;
        override = true;
        override_reason = 'Admin override from Memberships > Actions';
      }

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/users/magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          userId: user.id,
          purpose: 'login',
          channel: 'sms',
          next: '/member',
          override,
          override_reason,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to create link');

      const body = encodeURIComponent(`Tap to sign in: ${data.magicLink}`);
      const phone = user?.phone ? encodeURIComponent(user.phone) : '';
      const smsHref = phone ? `sms:${phone}?&body=${body}` : `sms:&body=${body}`;
      window.location.href = smsHref;
      showSuccess('Opened SMS composer.');
    } catch (err) {
      console.error(err);
      showError(err.message || 'Failed to send SMS link.');
    }
  }


  async function copyLinkOnly(userId, purpose) {
    try {
      const link = await getMagicLinkCached(userId, purpose);
      await navigator.clipboard.writeText(link);
      flashCopied(`${userId}:${purpose}`);
      showSuccess('Link copied to clipboard.');
    } catch (err) {
      console.error(err);
      showError(err.message || 'Failed to copy link');
    }
  }

  function openEditContact(user) {
    if (!user?.id) return;
    setEditContactUser(user); // { id, full_name, email, phone, sms_opt_in }
    setEditFullName(user.full_name || "");
    setEditEmail(user.email || "");
    setEditPhone(user.phone || "");
    setEditSmsOptIn(!!user.sms_opt_in);
    setEditReason('');
    setShowEditContact(true);
  }

  async function saveEditContact() {
    if (!editContactUser?.id) return;

    if (!editEmail) {
      showError('Email is required');
      return;
    }
    if (willEmailChange && !editReason?.trim()) {
      showError('Reason is required when changing email.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail.trim())) {
      showError('Please enter a valid email address.');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch('/api/admin/users/update-contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          userId: editContactUser.id,
          full_name: editFullName?.trim() || null,
          email: editEmail?.trim(),
          phone: editPhone?.trim() || null,
          sms_opt_in: !!editSmsOptIn,
          reason: editReason?.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error('❌ Update contact failed:', data);
        showError(data?.message || 'Failed to update contact.');
        return;
      }

      await fetchMemberships();
      setShowEditContact(false);
      setEditContactUser(null);
      setEditFullName('');
      setEditEmail('');
      setEditPhone('');
      setEditSmsOptIn(false);
      setEditReason('');
      showSuccess('Contact updated.');
    } catch (e) {
      console.error(e);
      showError('Unexpected error while updating contact.');
    }
  }

  async function toggleAutoRenew(m) {
    try {
      const before = !!m.auto_renewal_enabled;
      const after = !before;

      const { error: updErr } = await supabase
        .from('memberships')
        .update({ auto_renewal_enabled: after })
        .eq('id', m.id);
      if (updErr) throw updErr;

      const { data: auth } = await supabase.auth.getUser();
      const actorId = auth?.user?.id || null;

      await supabase.from('admin_actions_log').insert({
        actor_user_id: actorId,
        actor_role: 'admin',
        target_user_id: m.user_id,
        target_membership_id: m.id,
        action: 'TOGGLE_AUTORENEW',
        reason: null,
        diff: { before: { auto_renewal_enabled: before }, after: { auto_renewal_enabled: after } },
      });

      setMemberships((prev) =>
        prev.map((row) => (row.id === m.id ? { ...row, auto_renewal_enabled: after } : row))
      );
      showSuccess(after ? 'Auto-renew enabled.' : 'Auto-renew disabled.');
    } catch (e) {
      console.error('Toggle auto-renew failed:', e);
      showError('Failed to toggle auto-renew. Please try again.');
    }
  }

  function selectAllInView() {
    setSelectedIds(new Set(idsInView));
  }

  async function applyBulkSuspend() {
    if (!bulkSuspendUntil) {
      showError('Pick a "suspended until" date.');
    return;
    }

    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    try {
      const { error } = await supabase
        .from('memberships')
        .update({
          status: 'suspended',
          suspended_until: bulkSuspendUntil,
          cancel_reason: bulkSuspendReason || null,
        })
        .in('id', ids);

      if (error) throw error;

      showSuccess(`Suspended ${ids.length} membership${ids.length > 1 ? 's' : ''}.`);
      setShowBulkSuspend(false);
      setBulkSuspendUntil('');
      setBulkSuspendReason('');
      setSelectedIds(new Set());
      await fetchMemberships();
    } catch (e) {
      console.error(e);
      showError('Bulk suspend failed.');
    }
  }

  function resetCreateModalFields() {
    setCreateUserId('');
    setCreatePlan('');
    setCreateDurationId('');
    setCreateStartDate('');
    setPaymentMode('checkout');
    setOfflineMethod('cash');
    setOfflineAmount('');
    setOfflineNotes('');
    setCheckoutBehavior('bill_today_start_today');
    setPendingNewUser(null);
    setNewFullName('');
    setNewEmail('');
    setNewPhone('');
    setNewSmsOptIn(false);
    setShowUserCreateModal(false);
    setCreateAutoRenewalEnabled(true);
    setCreateRenewAtDiscountedRate(false);
  }

  // ---------- Saved Views storage ----------
  const VIEWS_KEY = 'admin_memberships_saved_views_v1';

  function loadSavedViews() {
    try {
      const raw = localStorage.getItem(VIEWS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function persistSavedViews(next) {
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    } catch {}
    setSavedViews(next);
  }

  // Run once to load saved views
  useEffect(() => {
    setSavedViews(loadSavedViews());
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchQuery, statusFilter, contractFilter, planFilter, activeView, page, pageSize]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setSelectedIds(new Set()); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function exportCsv(rows) {
    exportCsvUtil(rows, activeView || 'current-filter');
  }

  useEffect(() => {
    fetchMemberships();
  }, []);

  useEffect(() => {
    const fetchFormData = async () => {
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, email, role')
        .neq('role', 'admin');
      setAvailableUsers(users || []);
    
      const { data: durations } = await supabase.from('plan_durations').select('*');
      const grouped = durations?.reduce((acc, pd) => {
        if (!acc[pd.plan_name]) acc[pd.plan_name] = [];
        acc[pd.plan_name].push(pd);
        return acc;
      }, {});
      setPlanGroups(grouped || {});
    };
  
    fetchFormData();
  }, []);

  // figure out if the selected duration is a paid-in-full contract
  const selectedDuration = createPlan
    ? (planGroups[createPlan] || []).find((d) => d.id === createDurationId)
    : null;
  const isPaidInFullSelected = !!selectedDuration?.duration_label
    ?.toLowerCase()
    .includes("paid in full");

  // 1) Base filtering from the top controls (search/status/contract/plan)
  const filtered = memberships.filter((m) => {
    const nameMatch = `${m.full_name ?? ''} ${m.email ?? ''}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase());

    const statusMatch = statusFilter ? m.status === statusFilter : true;

    const contractValue = m.requires_contract
      ? (m.needs_contract ? 'unsigned' : 'signed')
      : 'na';
    const contractMatch = contractFilter ? contractValue === contractFilter : true;

    const planMatch = planFilter
      ? (m.plan_name || '').toLowerCase() === planFilter.toLowerCase()
      : true;

    return nameMatch && statusMatch && contractMatch && planMatch;
  });

  // 2) Optional overlay from an active preset/saved view
  let viewFiltered = filtered;
  if (activeView) {
    const preset = presetViews.find(p => p.name === activeView);
    if (preset) {
      viewFiltered = filtered.filter(preset.apply);
    } else {
      const sv = savedViews.find(v => v.name === activeView);
      if (sv?.config) {
        const { status, contract, plan, search } = sv.config;
        viewFiltered = filtered.filter((m) => {
          const searchOk = search ? (`${m.full_name ?? ''} ${m.email ?? ''}`.toLowerCase().includes(search.toLowerCase())) : true;
          const statusOk = status ? m.status === status : true;
          const contractVal = m.requires_contract ? (m.needs_contract ? 'unsigned' : 'signed') : 'na';
          const contractOk = contract ? (contractVal === contract) : true;
          const planOk = plan ? ((m.plan_name || '').toLowerCase() === plan.toLowerCase()) : true;
          return searchOk && statusOk && contractOk && planOk;
        });
      }
    }
  }

  // --- pagination derived values for current view ---
  const total = viewFiltered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const startIdx = (page - 1) * pageSize;
  const endIdx = Math.min(total, startIdx + pageSize);
  const pageRows = viewFiltered.slice(startIdx, endIdx);

  // --- selection helpers derived from current view/page ---
  const idsInView = React.useMemo(() => viewFiltered.map(r => r.id), [viewFiltered]);
  const idsOnPage = React.useMemo(() => pageRows.map(r => r.id), [pageRows]);
  const pageAllSelected =
    idsOnPage.length > 0 && idsOnPage.every(id => selectedIds.has(id));

  // reset to page 1 whenever filters/view change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, contractFilter, planFilter, activeView]);

  // clamp if page is out of range (e.g., pageSize changed)
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [pageCount, page]);

  // -------- KPIs for current view --------
  const kpis = React.useMemo(() => {
    const rows = viewFiltered;
    const today = new Date();
    const in7 = new Date(); in7.setDate(today.getDate() + 7);

    const count = rows.length;
    const active = rows.filter(r => r.status === 'active').length;
    const needsContract = rows.filter(r => r.requires_contract && r.needs_contract).length;
    const renewals7d = rows.filter(r => {
      if (!r.next_payment_date) return false;
      const d = new Date(r.next_payment_date);
      return d >= new Date(today.toDateString()) && d <= in7;
    }).length;
    const dunning = rows.filter(r => (r.last_payment_status === 'failed') || !!r.renewal_pending).length;
    const suspended = rows.filter(r => r.status === 'suspended').length;
    const cancelled = rows.filter(r => r.status === 'cancelled').length;
    const pif = rows.filter(r => !!r.paid_in_full).length;

    return [
      { label: 'In View', value: count },
      { label: 'Active', value: active },
      { label: 'Needs Contract', value: needsContract },
      { label: 'Renewals (7d)', value: renewals7d },
      { label: 'Dunning', value: dunning },
      { label: 'Suspended', value: suspended },
      { label: 'Cancelled', value: cancelled },
      { label: 'Paid-in-Full', value: pif },
    ];
  }, [viewFiltered]);

  const willEmailChange =
    (editEmail?.trim().toLowerCase() || '') !== ((editContactUser?.email || '').toLowerCase());

  return (
    <div className="p-8 min-h-screen bg-gray-900 text-white">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h1 className="text-3xl font-bold text-yellow-400 mr-auto">Manage Memberships</h1>

        <div className="w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-72 px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-white placeholder-gray-400"
          />
        </div>

        <button
          onClick={() => setShowFilters(true)}
          className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700"
          title="Show filters"
        >
          Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
        </button>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-yellow-500 text-black font-semibold rounded-md hover:bg-yellow-400 transition-all"
        >
          ➕ Create Membership
        </button>

        <button
          className="px-3 py-2 rounded-md bg-gray-200 text-black hover:bg-white disabled:opacity-50"
          onClick={() => exportCsv(viewFiltered)}
          disabled={loading || viewFiltered.length === 0}
          title="Export the current list to CSV"
        >
          Export CSV
        </button>
      </div>

      {/* Active filter chips (optional but nice) */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {searchQuery && (
            <span className="inline-flex items-center gap-2 px-2 py-1 text-sm rounded bg-gray-800 border border-gray-700">
              Search: “{searchQuery}”
              <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-white">×</button>
            </span>
          )}
          {statusFilter && (
            <span className="inline-flex items-center gap-2 px-2 py-1 text-sm rounded bg-gray-800 border border-gray-700">
              Status: {statusFilter}
              <button onClick={() => setStatusFilter('')} className="text-gray-400 hover:text-white">×</button>
            </span>
          )}
          {contractFilter && (
            <span className="inline-flex items-center gap-2 px-2 py-1 text-sm rounded bg-gray-800 border border-gray-700">
              Contract: {contractFilter}
              <button onClick={() => setContractFilter('')} className="text-gray-400 hover:text-white">×</button>
            </span>
          )}
          {planFilter && (
            <span className="inline-flex items-center gap-2 px-2 py-1 text-sm rounded bg-gray-800 border border-gray-700">
              Plan: {planFilter}
              <button onClick={() => setPlanFilter('')} className="text-gray-400 hover:text-white">×</button>
            </span>
          )}
          <button
            className="ml-2 text-sm text-gray-300 hover:text-white underline"
            onClick={() => { setSearchQuery(''); setStatusFilter(''); setContractFilter(''); setPlanFilter(''); }}
          >
            Clear all
          </button>
        </div>
      )}

      <KpiStrip kpis={kpis} />

      <FiltersPanel
        open={showFilters}
        onClose={() => setShowFilters(false)}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        contractFilter={contractFilter}
        setContractFilter={setContractFilter}
        planFilter={planFilter}
        setPlanFilter={setPlanFilter}
        presetViews={presetViews}
        savedViews={savedViews}
        activeView={activeView}
        setActiveView={setActiveView}
        onOpenSaveView={() => setShowSaveViewModal(true)}
        onClearAll={() => { setSearchQuery(''); setStatusFilter(''); setContractFilter(''); setPlanFilter(''); }}
      />

      <PaginationBar
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        total={total}
        startIdx={startIdx}
        endIdx={endIdx}
        setPage={setPage}
        setPageSize={setPageSize}
      />

      {selectedIds.size > 0 && (
        <SelectionBar
          countSelected={selectedIds.size}
          pageAllSelected={pageAllSelected}
          idsOnPage={idsOnPage}
          onTogglePage={() => {
            const next = new Set(selectedIds);
            if (pageAllSelected) idsOnPage.forEach(id => next.delete(id));
            else idsOnPage.forEach(id => next.add(id));
            setSelectedIds(next);
          }}
          onSelectAllInView={selectAllInView}
          onExportSelected={() => {
            const selectedRows = viewFiltered.filter(r => selectedIds.has(r.id));
            if (selectedRows.length === 0) return;
            exportCsv(selectedRows);
          }}
          onEmailLoginsSelected={async () => {
            const selectedRows = viewFiltered.filter(r => selectedIds.has(r.id));
            for (const r of selectedRows) {
              if (!r.user_id) continue;
              try { await sendLink(r.user_id, 'login', 'email'); } catch {}
            }
            showSuccess('Login links queued for selected members.');
          }}
          onEnableAutorenewSelected={async () => {
            const selectedRows = viewFiltered.filter(r => selectedIds.has(r.id));
            for (const r of selectedRows) {
              if (!r.auto_renewal_enabled) {
                await toggleAutoRenew(r);
              }
            }
            showSuccess('Auto-renew enabled for selected.');
          }}
          onOpenBulkSuspend={() => setShowBulkSuspend(true)}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      )}

      {/* Member Table */}
      <div className="bg-gray-800 rounded-lg shadow border border-gray-700">
        <table className="w-full table-fixed text-left">
          <thead className="bg-gray-700 text-gray-300">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  ref={(el) => {
                    if (!el) return;
                    const selectedOnPage = idsOnPage.filter(id => selectedIds.has(id)).length;
                    el.indeterminate = selectedOnPage > 0 && selectedOnPage < idsOnPage.length;
                  }}
                  checked={pageAllSelected}
                  onChange={(e) => {
                    const next = new Set(selectedIds);
                    if (e.target.checked) idsOnPage.forEach(id => next.add(id));
                    else idsOnPage.forEach(id => next.delete(id));
                    setSelectedIds(next);
                  }}
                  className="h-4 w-4"
                  aria-label="Select page"
                />
              </th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Contract</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Auto-Renew</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Next Payment</th>
              <th className="px-4 py-3">Paid In Full</th>
              <th className="px-4 py-3">Renewal Discount</th>
              <th className="px-4 py-3 text-center w-40 sm:w-48">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {loading && (
              <tr>
                <td colSpan="12" className="px-4 py-6 text-center text-yellow-400">
                  Loading memberships...
                </td>
              </tr>
            )}

            {!loading && viewFiltered.length === 0 && (
              <tr>
                <td colSpan="12" className="px-4 py-6 text-center text-gray-400">
                  No memberships found.
                </td>
              </tr>
            )}

            {!loading &&
              pageRows.length > 0 &&
              pageRows.map((m) => {
                const isExpanded = expandedId === m.id;
                return (
                  <React.Fragment key={m.id}>
                    <tr>
                      <td className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(m.id)}
                          onChange={(e) => {
                            const next = new Set(selectedIds);
                            if (e.target.checked) next.add(m.id); else next.delete(m.id);
                            setSelectedIds(next);
                          }}
                          className="h-4 w-4"
                          aria-label={`Select ${m.full_name ?? m.email ?? m.id}`}
                        />
                      </td>
                      <td className="px-4 py-3">{m.full_name ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-normal break-words">{m.email ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-normal break-words">
                        {m.plan_name ? `${m.plan_name} - ${m.duration_label}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-sm font-medium ${
                            !m.requires_contract
                              ? 'text-gray-400'
                              : !m.needs_contract
                              ? 'text-green-400'
                              : 'text-yellow-400'
                          }`}
                        >
                          {!m.requires_contract ? 'N/A' : !m.needs_contract ? 'Signed' : 'Unsigned'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-sm font-medium ${
                            m.status === 'active'
                              ? 'text-green-400'
                              : m.status === 'cancelled'
                              ? 'text-yellow-400'
                              : m.status === 'expired'
                              ? 'text-gray-400'
                              : m.status === 'suspended'
                              ? 'text-orange-400'
                              : m.status === 'terminated'
                              ? 'text-red-500'
                              : 'text-white'
                          }`}
                        >
                          {m.status === 'active' && '✅ Active'}
                          {m.status === 'cancelled' && '⚠️ Cancelled'}
                          {m.status === 'expired' && '⏳ Expired'}
                          {m.status === 'suspended' && '🕒 Suspended'}
                          {m.status === 'terminated' && '❌ Terminated'}
                          {!['active', 'cancelled', 'expired', 'suspended', 'terminated'].includes(m.status) &&
                            (m.status || '—')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {m.auto_renewal_enabled ? 'Enabled' : 'Disabled'}
                      </td>
                      <td className="px-4 py-3">
                        {m.expires_at ? new Date(m.expires_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {m.next_payment_date
                          ? new Date(m.next_payment_date).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="px-4 py-3">{m.paid_in_full ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-3">
                        {m.renew_at_discounted_rate ? 'Yes' : 'No'}
                      </td>
                      <td className="px-4 py-3 text-center align-middle whitespace-normal break-words w-40 sm:w-48 lg:w-56">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <RowActions
                            m={m}
                            isExpanded={isExpanded}
                            onToggleDetails={() => setExpandedId(isExpanded ? null : m.id)}
                            openEditContact={openEditContact}
                            setSelectedMember={setSelectedMember}
                            setShowCancelModal={setShowCancelModal}
                            toggleAutoRenew={toggleAutoRenew}
                            sendLink={sendLink}
                            getMagicLinkCached={getMagicLinkCached}
                            copyLinkOnly={copyLinkOnly}
                            showQrForUser={showQrForUser}
                            smsMagicLink={smsMagicLink}
                            copiedKey={copiedKey}
                            setCopiedKey={setCopiedKey}
                          />
                          <Link
                            href={`/admin/memberships/${m.id}`}
                            className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 border border-gray-600"
                            title="Open membership management"
                          >
                            Manage
                          </Link>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-gray-700 text-sm text-gray-200">
                        <td colSpan="12" className="px-6 py-4">
                          {m.requires_contract && m.needs_contract && (
                            <div className="mb-3 p-3 rounded bg-yellow-900/40 border border-yellow-700 text-yellow-300 flex items-center justify-between">
                              <div>
                                <strong>Contract Status:</strong>{' '}
                                {m.days_since_start >= 7 ? `Unsigned (${m.days_since_start}d overdue)` : 'Unsigned'}
                              </div>
                              <button
                                className="px-3 py-1 rounded bg-yellow-500 text-black hover:bg-yellow-400"
                                onClick={() => {
                                  const url = `/contract?user_id=${m.user_id}&plan_duration_id=${m.plan_duration_id}&redirect=/admin/memberships&source=admin`;
                                  window.open(url, '_blank', 'noopener,noreferrer');
                                }}
                                title="Open contract signing link"
                              >
                                Resend Contract
                              </button>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-4">
                            <div><strong>Trial Type:</strong> {m.trial_type || '—'}</div>
                            <div><strong>Pass Source:</strong> {m.pass_source || '—'}</div>
                            <div>
                              <strong>Promo Period:</strong>{' '}
                              {m.promo_start_date
                                ? new Date(m.promo_start_date).toLocaleDateString()
                                : '—'}{' '}
                              →{' '}
                              {m.promo_end_date
                                ? new Date(m.promo_end_date).toLocaleDateString()
                                : '—'}
                            </div>
                            <div>
                              <strong>Contract End:</strong>{' '}
                              {m.contract_end_date
                                ? new Date(m.contract_end_date).toLocaleDateString()
                                : '—'}
                            </div>
                            <div><strong>Renewal Pending:</strong> {m.renewal_pending ? 'Yes' : 'No'}</div>
                            <div><strong>Attempts:</strong> {m.renewal_attempt_count}</div>
                            <div>
                              <strong>Last Attempt:</strong>{' '}
                              {m.last_renewal_attempt
                                ? new Date(m.last_renewal_attempt).toLocaleDateString()
                                : '—'}
                            </div>
                            <div><strong>Stripe Session:</strong> {m.stripe_session_id || '—'}</div>
                            <div><strong>Stripe Sub ID:</strong> {m.stripe_subscription_id || '—'}</div>
                            <div><strong>Payment Intent:</strong> {m.stripe_payment_intent || '—'}</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
          </tbody>
        </table>
      </div>

      <SaveViewModal
        open={showSaveViewModal}
        newViewName={newViewName}
        setNewViewName={setNewViewName}
        onCancel={() => { setShowSaveViewModal(false); setNewViewName(''); }}
        onSave={() => {
          const config = {
            search: searchQuery || '',
            status: statusFilter || '',
            contract: contractFilter || '',
            plan: planFilter || '',
          };
          const next = [
            ...savedViews.filter(v => v.name !== newViewName.trim()),
            { name: newViewName.trim(), config },
          ].sort((a,b) => a.name.localeCompare(b.name));
          persistSavedViews(next);
          setActiveView(newViewName.trim());
          setNewViewName('');
          setShowSaveViewModal(false);
        }}
      />

      <CreateMembershipSlideOver
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}

        availableUsers={availableUsers}
        planGroups={planGroups}

        createUserId={createUserId}              setCreateUserId={setCreateUserId}
        pendingNewUser={pendingNewUser}          setPendingNewUser={setPendingNewUser}

        paymentMode={paymentMode}                setPaymentMode={setPaymentMode}
        checkoutBehavior={checkoutBehavior}      setCheckoutBehavior={setCheckoutBehavior}

        createPlan={createPlan}                  setCreatePlan={setCreatePlan}
        createDurationId={createDurationId}      setCreateDurationId={setCreateDurationId}
        createStartDate={createStartDate}        setCreateStartDate={setCreateStartDate}

        createAutoRenewalEnabled={createAutoRenewalEnabled}
        setCreateAutoRenewalEnabled={setCreateAutoRenewalEnabled}
        createRenewAtDiscountedRate={createRenewAtDiscountedRate}
        setCreateRenewAtDiscountedRate={setCreateRenewAtDiscountedRate}

        offlineMethod={offlineMethod}            setOfflineMethod={setOfflineMethod}
        offlineAmount={offlineAmount}            setOfflineAmount={setOfflineAmount}
        offlineNotes={offlineNotes}              setOfflineNotes={setOfflineNotes}

        showUserCreateModal={showUserCreateModal} setShowUserCreateModal={setShowUserCreateModal}
        newFullName={newFullName}                 setNewFullName={setNewFullName}
        newEmail={newEmail}                       setNewEmail={setNewEmail}
        newPhone={newPhone}                       setNewPhone={setNewPhone}
        newSmsOptIn={newSmsOptIn}                 setNewSmsOptIn={setNewSmsOptIn}

        isPaidInFullSelected={isPaidInFullSelected}
        hasMember={hasMember}

        onStartCheckout={() => adminCreateMembership({ mode: 'checkout' })}
        onCreateOffline={() => adminCreateMembership({ mode: 'comped' })}
      />

      <MagicLinkQrModal
        open={showQr}
        qrLink={qrLink}
        onClose={() => setShowQr(false)}
      />

      <EditContactModal
        open={showEditContact && !!editContactUser}
        editFullName={editFullName} setEditFullName={setEditFullName}
        editEmail={editEmail} setEditEmail={setEditEmail}
        editPhone={editPhone} setEditPhone={setEditPhone}
        editSmsOptIn={editSmsOptIn} setEditSmsOptIn={setEditSmsOptIn}
        editReason={editReason} setEditReason={setEditReason}
        willEmailChange={willEmailChange}
        onCancel={() => {
          setShowEditContact(false);
          setEditContactUser(null);
          setEditFullName('');
          setEditEmail('');
          setEditPhone('');
          setEditSmsOptIn(false);
          setEditReason('');
        }}
        onSave={saveEditContact}
        disableSave={!editEmail || (willEmailChange && !editReason?.trim())}
      />

      <BulkSuspendModal
        open={showBulkSuspend}
        countSelected={selectedIds.size}
        suspendedUntil={bulkSuspendUntil}
        setSuspendedUntil={setBulkSuspendUntil}
        reason={bulkSuspendReason}
        setReason={setBulkSuspendReason}
        onCancel={() => {
          setShowBulkSuspend(false);
          setBulkSuspendUntil('');
          setBulkSuspendReason('');
        }}
        onApply={applyBulkSuspend}
        disableApply={!bulkSuspendUntil || selectedIds.size === 0}
      />

      <ModifyMembershipModal
        open={showCancelModal}
        member={selectedMember}
        action={cancelAction}
        setAction={setCancelAction}
        reason={cancelReason}
        setReason={setCancelReason}
        suspendedUntil={suspendedUntil}
        setSuspendedUntil={setSuspendedUntil}
        onCancel={() => {
          setShowCancelModal(false);
          setCancelAction('');
          setCancelReason('');
          setSuspendedUntil('');
          setSelectedMember(null);
        }}
        onApply={async () => {
          if (!cancelAction) return;
          const updates = {};
        
          if (cancelAction === 'cancel') {
            updates.status = 'cancelled';
            updates.auto_renewal_enabled = false;
            updates.cancel_reason = cancelReason;
          }
        
          if (cancelAction === 'suspend') {
            if (!suspendedUntil) {
              showError('Please choose a suspension end date.');
              return;
            }
            updates.status = 'suspended';
            updates.suspended_until = suspendedUntil;
            updates.cancel_reason = cancelReason;
          }
        
          if (cancelAction === 'terminate') {
            if (!cancelReason) {
              showError('Please provide a reason for termination.');
              return;
            }
            updates.status = 'terminated';
            updates.cancel_reason = cancelReason;
            const { data } = await supabase.auth.getUser();
            updates.banned_by_admin_id = data?.user?.id;
          }
        
          const { error } = await supabase
            .from('memberships')
            .update(updates)
            .eq('id', selectedMember.id);
        
          if (error) {
            console.error('❌ Update failed:', error);
            showError('An error occurred while updating the membership.');
          } else {
            await fetchMemberships();
            setShowCancelModal(false);
            setCancelAction('');
            setCancelReason('');
            setSuspendedUntil('');
            setSelectedMember(null);
            showSuccess('Membership updated.');
          }
        }}
        disableApply={
          !cancelAction ||
          (cancelAction === 'suspend' && !suspendedUntil) ||
          (cancelAction === 'terminate' && !cancelReason)
        }
      />
    </div>
  );
};

export default withAuth(MembershipsPage, 'admin');