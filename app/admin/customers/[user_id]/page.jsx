// app/admin/customers/[user_id]/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import withAuth from "@/lib/withAuth";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { createStripeSession } from "@/lib/utils/stripeSession";
import { showError, showSuccess } from "@/lib/utils/toastUtils";
import {
  formatAdminDate,
  formatAdminDateTime,
  getNowUtcIso,
  toValidDate,
  addDaysToUtcIso,
} from "@/lib/utils/dateTime";
import { isPIFMembership, isWithinDaysOfExpiry } from "@/lib/helpers/pifEndHelpers";
import { fetchMembershipsForUser } from "@/lib/db/memberships";
import { fetchAdminCustomerById, fetchUserBasicIdentityById } from "@/lib/db/users";
import { fetchAllPlanDurationsClient } from "@/lib/queries/planDurations.client";
import { fetchGuestPassesForUserClient } from "@/lib/queries/guestPasses.client";
import { fetchPaymentsForUserClient } from "@/lib/queries/payments.client";

const TABS = ["overview", "memberships", "guest-passes", "payments", "checkins", "notes"];

const MEMBERSHIP_GRACE_DAYS = 3;

function cls(...parts) { return parts.filter(Boolean).join(" "); }

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cls(
        "px-3 py-2 rounded-md border",
        active
          ? "bg-yellow-500 text-black border-yellow-400"
          : "bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }) {
  return (
    <div className="p-4 rounded-lg bg-gray-800 border border-gray-700">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-lg font-semibold text-yellow-300">{value ?? "—"}</div>
    </div>
  );
}

function money(cents, currency = "USD") {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

// ---- PAYMENTS UI HELPERS ----

// Flip this later if you prefer colored text instead of pills
const USE_PAYMENT_STATUS_PILL = true;

function getPaymentCents(p) {
  if (!p) return null;
  if (typeof p.amount_cents === "number") return p.amount_cents;
  if (p.amount != null && !Number.isNaN(Number(p.amount))) {
    return Math.round(Number(p.amount) * 100);
  }
  return null;
}

function normalizeStatus(s) {
  return String(s || "").trim().toLowerCase();
}

function prettyPaymentStatus(statusRaw) {
  const s = normalizeStatus(statusRaw);
  if (!s) return "—";
  return s.replace(/_/g, " ");
}

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-500 border-t-transparent"
      aria-hidden="true"
    />
  );
}

// Class map for pill + text
function paymentStatusClasses(statusRaw) {
  const s = normalizeStatus(statusRaw);

  // common Stripe-ish + your own statuses
  if (s === "succeeded" || s === "paid" || s === "success") {
    return {
      pill: "bg-green-900/30 text-green-300 border-green-700",
      text: "text-green-300",
    };
  }

  if (s === "pending" || s === "processing") {
    return {
      pill: "bg-blue-900/30 text-blue-300 border-blue-700",
      text: "text-blue-300",
    };
  }

  if (s === "failed") {
    return {
      pill: "bg-red-900/30 text-red-300 border-red-700",
      text: "text-red-300",
    };
  }

  if (s === "refunded") {
    return {
      pill: "bg-orange-900/30 text-orange-300 border-orange-700",
      text: "text-orange-300",
    };
  }

  if (s === "canceled" || s === "cancelled") {
    return {
      pill: "bg-gray-800 text-gray-300 border-gray-700",
      text: "text-gray-300",
    };
  }

  return {
    pill: "bg-gray-800 text-gray-300 border-gray-700",
    text: "text-gray-300",
  };
}

function PaymentStatus({ status }) {
  const meta = paymentStatusClasses(status);
  const label = prettyPaymentStatus(status);

  if (!USE_PAYMENT_STATUS_PILL) {
    return <span className={cls("text-xs font-medium", meta.text)}>{label}</span>;
  }

  const s = normalizeStatus(status);
  const showSpin = s === "pending" || s === "processing";

  return (
    <span className={cls("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border", meta.pill)}>
      {showSpin ? <Spinner /> : null}
      {label}
    </span>
  );
}

function PaymentAmount({ p }) {
  const cents = getPaymentCents(p);
  const status = normalizeStatus(p?.status);

  let amountCls = "text-gray-400";

  if (["succeeded", "paid", "success"].includes(status)) {
    amountCls = "text-green-300";
  } else if (status === "failed") {
    amountCls = "text-red-400";
  } else if (status === "refunded") {
    amountCls = "text-orange-300";
  }

  return (
    <div className={amountCls}>
      {money(cents, p?.currency || "USD")}
    </div>
  );
}

function truncateMiddle(str = "", keep = 6) {
  if (!str || str.length <= keep * 2 + 3) return str;
  return `${str.slice(0, keep)}…${str.slice(-keep)}`;
}

function latestMembership(memberships = []) {
  return [...memberships].sort((a, b) =>
    (toValidDate(b.start_date) || new Date(0)) -
    (toValidDate(a.start_date) || new Date(0))
  )[0] || null;
}

function activeMembership(memberships = []) {
  return memberships.find(m => (m.status || "").toLowerCase() === "active") || null;
}

function timeAgo(iso) {
  if (!iso) return null;
  const thenDate = toValidDate(iso);
  if (!thenDate) return null;
  const now = Date.now();
  const then = thenDate.getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function prettyStatus(m) {
  if (!m) return "No membership";
  const s = (m.status || "").toLowerCase();
  if (s === "active") return "Active";
  if (s === "scheduled") return "Scheduled";
  if (s === "past_due") return "Past Due";
  if (s === "suspended") return "Suspended";
  if (s === "cancelled") return "Cancelled";
  if (s === "expired") return "Expired";
  return m.status || "Unknown";
}

function membershipStatusMeta(statusRaw) {
  const s = String(statusRaw || "").trim().toLowerCase();

  if (s === "active") {
    return { text: "text-green-300", pill: "bg-green-900/30 text-green-300 border-green-700" };
  }
  if (s === "past_due") {
    return { text: "text-orange-300", pill: "bg-orange-900/30 text-orange-300 border-orange-700" };
  }
  if (s === "suspended") {
    return { text: "text-orange-300", pill: "bg-orange-900/30 text-orange-300 border-orange-700" };
  }
  if (s === "scheduled") {
    return { text: "text-blue-300", pill: "bg-blue-900/30 text-blue-300 border-blue-700" };
  }
  if (s === "cancelled" || s === "canceled" || s === "expired") {
    return { text: "text-yellow-300", pill: "bg-yellow-900/30 text-yellow-200 border-yellow-700" };
  }
  return { text: "text-gray-300", pill: "bg-gray-800 text-gray-300 border-gray-700" };
}

function MembershipStatus({ membership, variant = "text" }) {
  const label = prettyStatus(membership);
  const meta = membershipStatusMeta(membership?.status);

  if (variant === "pill") {
    return (
      <span className={cls("text-xs px-2 py-0.5 rounded border", meta.pill)}>
        {label}
      </span>
    );
  }

  return <div className={meta.text}>{label}</div>;
}

// Guest-pass status → colored pill
function guestPassStatusPill(statusRaw) {
  const s = (statusRaw || "").toLowerCase();
  if (s === "active" || s === "issued") {
    return "bg-blue-900/30 text-blue-300 border-blue-700";
  }
  if (s === "redeemed") {
    return "bg-green-900/30 text-green-300 border-green-700";
  }
  if (s === "expired" || s === "cancelled" || s === "canceled") {
    return "bg-slate-800 text-slate-200 border-slate-600";
  }
  return "bg-gray-800 text-gray-300 border-gray-700";
}


function statusRank(raw) {
  const s = (raw || "").toLowerCase();
  if (s === "active") return 0;
  if (s === "suspended") return 1;
  if (s === "past_due") return 2;
  if (s === "scheduled") return 3;
  if (s === "cancelled" || s === "canceled" || s === "expired") return 4;
  return 5; // unknown/other
}

function sortMembershipsByStatusThenDate(rows = []) {
  return rows.slice().sort((a, b) => {
    const ra = statusRank(a.status);
    const rb = statusRank(b.status);
    if (ra !== rb) return ra - rb;

    // tie-breaker: newest start_date first (fallback created_at)
    const ad = toValidDate(a.start_date) || new Date(0);
    const bd = toValidDate(b.start_date) || new Date(0);
    return bd - ad;
  });
}

// Build a label from either embedded fields or plan_durations fallback
function planLabelFor(m, pdMap) {
  const name = m.plan_name || (m.plan_duration_id ? pdMap.get(m.plan_duration_id)?.plan_name : null);
  const dur  = m.duration_label || (m.plan_duration_id ? pdMap.get(m.plan_duration_id)?.duration_label : null);
  if (!name && !dur) return "—";
  if (!name) return dur;
  if (!dur) return name;
  return `${name} • ${dur}`;
}

function diffDays(startISO, endISO) {
  const startD = toValidDate(startISO);
  const endD = toValidDate(endISO);
  if (!startD || !endD) return null;

  const ms = Math.max(0, endD.getTime() - startD.getTime());
  const day = 1000 * 60 * 60 * 24;

  return Math.max(1, Math.ceil(ms / day));
}

function guestPassLabel(g) {
  const days = diffDays(g.start_date, g.expires_at);
  const dur = days ? `${days}-day` : null;
  const status = (g.status || "").replace(/_/g, " ").trim();
  return `Guest Pass${dur ? ` — ${dur}` : ""}${status ? ` (${status})` : ""}`;
}

// Renders a Link/span for what a payment is linked to (membership/guest pass), or "Manual"
function renderLinkedTo(p, membershipsById, guestPassesById, pdMap) {
  if (p.membership_id) {
    const mem = membershipsById.get(p.membership_id);
    const label = mem ? `Membership — ${planLabelFor(mem, pdMap)}` : `Membership`;
    return (
      <Link className="underline" href={`/admin/memberships/${p.membership_id}`}>
        {label}
      </Link>
    );
  }
  if (p.guest_pass_id) {
    const gp = guestPassesById.get(p.guest_pass_id);
    const label = gp ? guestPassLabel(gp) : "Guest Pass";
    // swap <span> with <Link> once you add /admin/guest-passes/[id]
    return <span className="underline">{label}</span>;
  }
  return "Manual";
}

// Same as above, but returns " • <LinkedTo>" or nothing (for inline use in the Overview list)
function renderLinkedWithBullet(p, membershipsById, guestPassesById, pdMap) {
  const node = renderLinkedTo(p, membershipsById, guestPassesById, pdMap);
  if (node === "Manual") return null;
  return <> • {node}</>;
}

function getEffectivePriceForSelection(pd, priceMap) {
  if (!pd) return null;

  const info = priceMap?.[pd.id];
  if (info && typeof info.amount_cents === "number") {
    return { amount_cents: info.amount_cents, currency: (info.currency || "usd").toUpperCase(), source: "stripe" };
  }

  return null;
}

function formatStripeMoney(amount_cents, currency = "USD") {
  if (amount_cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
  }).format(amount_cents / 100);
}

// Returns { formatted, amount_cents, currency, source } or null
function getFormattedPriceForPD(pd, priceMap) {
  const eff = getEffectivePriceForSelection(pd, priceMap);
  if (!eff || eff.amount_cents == null) return null;
  return {
    ...eff,
    formatted: formatStripeMoney(eff.amount_cents, eff.currency || "USD"),
  };
}

function isTierStillActive(until) {
  if (!until) return true;

  const untilDate = toValidDate(until);
  if (!untilDate) return false;

  return untilDate.getTime() >= new Date(getNowUtcIso()).getTime();
}

function isUuid(v = "") {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v).trim()
  );
}

async function postAdminJson(url, body) {
  const token = await getAdminTokenOrThrow();

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body || {}),
  });

  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Request failed (${resp.status})`);
  }
  return payload;
}

async function getAdminTokenOrThrow() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Missing admin session token.");
  return token;
}

async function runStripeAudit() {
  try {
    // NOTE: only include Authorization header if your route checks it.
    const token = await getAdminTokenOrThrow();

    const resp = await fetch("/api/admin/stripe/audit-prices", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok || payload?.ok === false) {
      throw new Error(payload?.error || `Audit failed (${resp.status})`);
    }

    // easiest way to inspect quickly
    console.table(payload.invalid || []);
    showSuccess(`Stripe audit OK. Invalid: ${payload?.totals?.invalid ?? 0}`);
  } catch (e) {
    console.error("Stripe audit error:", e);
    showError(e.message || "Stripe audit failed.");
  }
}

const CustomerPage = () => {
  const { user_id } = useParams();
  const sp = useSearchParams();
  const initialTab = sp?.get("tab") || "overview";

  const [tab, setTab] = useState(TABS.includes(initialTab) ? initialTab : "overview");

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [guestPasses, setGuestPasses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [error, setError] = useState(null);
  const [showFullId, setShowFullId] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [planDurations, setPlanDurations] = useState([]); // raw rows
  const [selectedPlanDuration, setSelectedPlanDuration] = useState(null);
  const [autoRenew, setAutoRenew] = useState(true);
  const [discountedRenewal, setDiscountedRenewal] = useState(false);
  const [manualAmount, setManualAmount] = useState("");      // dollars, e.g. "99.00"
  const [manualMethod, setManualMethod] = useState("cash");  // "cash" | "card_on_file" | "other"
  const [manualDesc, setManualDesc] = useState(""); 
  const [showIssuePass, setShowIssuePass] = useState(false);
  const [gpDuration, setGpDuration] = useState(1);
  const [gpIsPromo, setGpIsPromo] = useState(false);
  const [gpLocationId, setGpLocationId] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [locations, setLocations] = useState([]);
  const [recordPayment, setRecordPayment] = useState(false);
  const [activating, setActivating] = useState(false);
  const [planDurationPriceRows, setPlanDurationPriceRows] = useState([]); // rows from plan_duration_prices
  const [priceMap, setPriceMap] = useState({}); // { [planDurationId]: { amount_cents, currency } }
  const [priceSourceMap, setPriceSourceMap] = useState({}); // { [planDurationId]: { requestedTier, usedTier, isFallback } }
  const [priceTierOverride, setPriceTierOverride] = useState(null); // null | "standard" | "legacy" | "staff" | "family"
  const [planFilter, setPlanFilter] = useState(""); // (Optional) tiny text filter state
  const [household, setHousehold] = useState(null);
  const [householdMembership, setHouseholdMembership] = useState(null);
  const [householdMembers, setHouseholdMembers] = useState([]);
  const [showHouseholdModal, setShowHouseholdModal] = useState(false);
  const [householdName, setHouseholdName] = useState("");
  const [creatingHousehold, setCreatingHousehold] = useState(false);
  const [showManageHouseholdModal, setShowManageHouseholdModal] = useState(false);
  const [pifEndAction, setPifEndAction] = useState("none");
  const [savingPifAction, setSavingPifAction] = useState(false);
  const [pifActionNote, setPifActionNote] = useState("");
  const [joinHouseholdId, setJoinHouseholdId] = useState("");
  const [billingOwnerUser, setBillingOwnerUser] = useState(null);
  const [showRemoveHouseholdModal, setShowRemoveHouseholdModal] = useState(false);
  const [removingFromHousehold, setRemovingFromHousehold] = useState(false);

  function resetCreateModalState() {
    setSelectedPlanDuration(null);
    setAutoRenew(true);
    setDiscountedRenewal(false);

    setRecordPayment(false);
    setManualAmount("");
    setManualMethod("cash");
    setManualDesc("");

    setPlanFilter("");

    // optional: if you want the modal to open on Overview every time
    // setTab("overview");
  }

  function closeCreateModal() {
    setShowCreate(false);
    resetCreateModalState();
  }

  function resetIssuePassState() {
    setGpDuration(1);
    setGpIsPromo(false);
    setGpLocationId("");
  }

  function openIssuePassModal() {
    resetIssuePassState();
    setShowIssuePass(true);
  }

  function closeIssuePassModal() {
    setShowIssuePass(false);
    resetIssuePassState();
  }

  function openCreateModal({ withPayment = false } = {}) {
    resetCreateModalState();          // reset everything first
    setRecordPayment(!!withPayment);  // then enable payment if requested
    setShowCreate(true);
  }

  // Build a login URL that pre-fills this customer's email (for admins to share)
  const loginUrl = useMemo(() => {
    const email = user?.email || null;

    // Browser environment
    if (typeof window !== "undefined") {
      const base = `${window.location.origin}/auth/login`;
      return email ? `${base}?email=${encodeURIComponent(email)}` : base;
    }

    // SSR / fallback
    const base = "/auth/login";
    return email ? `${base}?email=${encodeURIComponent(email)}` : base;
  }, [user?.email]);

  // Helper for sending login / magic links via API
  async function handleSendLoginEmail(mode) {
    if (!user?.id) return showError("User not loaded yet.");
    if (!user.email) return showError("This customer has no email on file.");

    try {
      await postAdminJson("/api/admin/customers/send-login-link", {
        user_id: user.id,
        mode, // "login" | "magic"
      });

      showSuccess(mode === "magic" ? "Magic link emailed." : "Login link emailed.");
    } catch (e) {
      console.error("handleSendLoginEmail error:", e);
      showError(e.message || "Could not send login email.");
    }
  }

  const pdMap = useMemo(() => {
    const m = new Map();
    for (const pd of planDurations) m.set(pd.id, pd);
    return m;
  }, [planDurations]);

  // fetch everything in parallel
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [u, m, gp, p, c, pr, hm] = await Promise.all([
          fetchAdminCustomerById(supabase, user_id),
          fetchMembershipsForUser(supabase, user_id),
          fetchGuestPassesForUserClient(user_id),
          fetchPaymentsForUserClient(user_id),

          supabase
            .from("checkins")
            .select("id, checkin_time, location_id, distance_meters, checkin_type")
            .eq("user_id", user_id)
            .order("checkin_time", { ascending: false })
            .limit(50),

          supabase
            .from("plan_duration_prices")
            .select("id, plan_duration_id, tier, stripe_price_id, is_active")
            .eq("is_active", true),

          supabase
            .from("household_members")
            .select(`
              id,
              household_id,
              user_id,
              role,
              started_at,
              ended_at,
              is_active,
              households (
                id,
                name,
                billing_owner_id,
                primary_member_id,
                status,
                pif_end_action,
                pif_end_choice_set_at,
                pif_end_choice_set_by
              )
            `)
            .eq("user_id", user_id)
            .is("ended_at", null)
            .order("started_at", { ascending: false })
            .limit(1),
        ]);

        if (c.error) throw c.error;
        if (pr.error) throw pr.error;
        if (hm.error) throw hm.error;

        if (cancelled) return;

        // sort payments from newest to oldest
        const paymentsSorted = (p || []).slice().sort(
          (a, b) =>
            (toValidDate(b.payment_date || b.created_at) || new Date(0)) -
            (toValidDate(a.payment_date || a.created_at) || new Date(0))
        );

        // sort memberships by status then date
        const membershipsSorted = sortMembershipsByStatusThenDate(m || []);

        // sort guest passes newest to oldest
        const guestPassesSorted = (gp || []).slice().sort(
          (a, b) => 
            (toValidDate(b.start_date) || new Date(0)) - 
            (toValidDate(a.start_date) || new Date(0))
        );

        const checkinsSorted = (c.data || []);

        // 🆕 take the most recent household_members row for this user
        const hmRow = hm.data?.[0] || null;

        setUser(u || null);
        setMemberships(membershipsSorted);
        setGuestPasses(guestPassesSorted);
        setPayments(paymentsSorted);
        setCheckins(checkinsSorted);
        setPlanDurationPriceRows(pr.data || []);

        // 🆕 set household + membership state
        setHouseholdMembership(hmRow);
        setHousehold(hmRow?.households || null);
      } catch (e) {
        console.error(e);
        setError(e.message || "Failed to load customer.");
        showError("Failed to load customer.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user_id]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!household?.id) {
        setHouseholdMembers([]);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("household_members")
          .select(`
            user_id,
            role,
            is_active,
            users (
              full_name,
              email
            )
          `)
          .eq("household_id", household.id)
          .is("ended_at", null)
          .order("started_at", { ascending: true });

        if (error) throw error;
        if (!cancelled) {
          setHouseholdMembers(data || []);
        }
      } catch (e) {
        console.error("Failed to load household members", e);
        // optional: showError("Failed to load household members.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [household?.id]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const boId = household?.billing_owner_id;
      if (!boId) {
        setBillingOwnerUser(null);
        return;
      }

      try {
        const data = await fetchUserBasicIdentityById(supabase, boId);
        if (!cancelled) setBillingOwnerUser(data || null);
      } catch (e) {
        console.error("Failed to load billing owner user", e);
        if (!cancelled) setBillingOwnerUser(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [household?.billing_owner_id]);

  useEffect(() => {
    if (!household?.id) return;
    setPifEndAction(household?.pif_end_action || "none");
  }, [household?.id]); // intentionally only when household changes

  // fetch plan_durations for the Create/Renew modal
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPlans(true);
      try {
        const data = await fetchAllPlanDurationsClient();

        if (!cancelled) {
          const cleaned = (data || []).filter((pd) => {
            const isGuest = /guest\s*-?\s*pass/i.test(pd.plan_name || "");
            return !isGuest;
          });

          setPlanDurations(cleaned);

          console.table(
            (cleaned || []).map((pd) => ({
              plan_name: (pd.plan_name || "").trim(),
              duration_label: pd.duration_label,
            }))
          );
        }
      } catch (e) {
        console.error(e);
        showError("Failed to load plans.");
      } finally {
        if (!cancelled) setLoadingPlans(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("locations")
          .select("id, name")
          .order("name", { ascending: true });
        if (error) throw error;
        if (!cancelled) setLocations(data || []);
      } catch (e) {
        console.error(e);
        // non-fatal
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Pick the active membership first (used for prefill + summary and status badge)
  const currentActive = useMemo(() => activeMembership(memberships), [memberships]);
  const latestMembershipRow = useMemo(() => latestMembership(memberships), [memberships]);

  const displayMembership = currentActive || latestMembershipRow;

  // 🔎 DEV-ONLY: sanity check memberships shape + ordering
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    
    console.log("memberships isArray?", Array.isArray(memberships), "count:", memberships.length);
    console.table(
      (memberships || []).slice(0, 5).map((m) => ({
        id: m?.id,
        status: m?.status,
        start_date: m?.start_date,
        expires_at: m?.expires_at,
        grace_ends_at: m?.grace_ends_at,
        plan_duration_id: m?.plan_duration_id,
      }))
    );
    console.log("currentActive:", currentActive?.id, currentActive?.status, currentActive?.start_date);
  }, [memberships, currentActive]);

  // 🔍 Is the current active membership a PIF plan AND part of a household?
  const inHouseholdPIF = useMemo(() => {
    if (!currentActive) return false;
    if (!currentActive.household_id) return false;
    return isPIFMembership(currentActive, pdMap);
  }, [currentActive, pdMap]);

  // ⏱️ Is the PIF membership close to its end date?
  const pifExpirySoon = useMemo(() => {
    if (!inHouseholdPIF) return false;
    return isWithinDaysOfExpiry(currentActive, 30); // 30 days window for now
  }, [inHouseholdPIF, currentActive]);

  const showPifHouseholdBanner =
    !!currentActive &&
    !!currentActive.household_id &&
    inHouseholdPIF &&
    pifExpirySoon &&
    (currentActive.pif_end_action || "none") === "none";
  
  // derived - unified status (membership outranks guest)
  const hasAnyGuest = guestPasses.length > 0;
  const hasActiveGuest = guestPasses.some((g) => {
    const s = (g.status || "").toLowerCase();
    return s === "active" || s === "issued";
  });
  
  // Build top-level status label and a matching badge class
  const { statusLabel, statusClass } = useMemo(() => {
    // Membership wins
    if (displayMembership) {
      const ps = prettyStatus(displayMembership);
      let badgeCls = "bg-gray-800 text-gray-300 border-gray-700";
      if (ps === "Active") {
        badgeCls = "bg-green-900/40 text-green-300 border-green-700";
      } else if (ps === "Past Due") {
        badgeCls = "bg-orange-900/30 text-orange-300 border-orange-700";
      } else if (ps === "Suspended") {
        badgeCls = "bg-orange-900/30 text-orange-300 border-orange-700";
      } else if (ps === "Cancelled" || ps === "Expired") {
        badgeCls = "bg-yellow-900/30 text-yellow-200 border-yellow-700";
      }
      return { statusLabel: `${ps} · membership`, statusClass: badgeCls };
    }
  
    if (hasActiveGuest) {
      return {
        statusLabel: "Active · guest pass",
        statusClass: "bg-blue-900/30 text-blue-300 border-blue-700",
      };
    }
    if (hasAnyGuest) {
      return {
        statusLabel: "Expired · guest pass",
        statusClass: "bg-slate-800 text-slate-200 border-slate-600",
      };
    }
    return { statusLabel: "None", statusClass: "bg-gray-800 text-gray-300 border-gray-700" };
  }, [displayMembership, hasActiveGuest, hasAnyGuest]);

  const firstMembershipStart = useMemo(() => {
    const all = memberships.map((m) => m.start_date).filter(Boolean);
    if (all.length === 0) return null;
    
    return all.reduce((min, v) => {
      const dv = toValidDate(v);
      const dmin = toValidDate(min);
      if (!dv) return min;
      if (!dmin) return v;
      return dv < dmin ? v : min;
    }, all[0]);
  }, [memberships]);

  const ltvCents = useMemo(() => {
    const ok = payments.filter((p) => (p.status || "").toLowerCase() === "succeeded");
    return ok.reduce((sum, p) => {
      if (typeof p.amount_cents === "number") return sum + p.amount_cents;
      if (p.amount != null && !Number.isNaN(Number(p.amount))) return sum + Math.round(Number(p.amount) * 100);
      return sum;
    }, 0);
  }, [payments]);

  const membershipsById = useMemo(() => {
    const m = new Map();
    for (const row of memberships) m.set(row.id, row);
    return m;
  }, [memberships]);

  const guestPassesById = useMemo(() => {
    const m = new Map();
    for (const g of guestPasses) m.set(g.id, g);
    return m;
  }, [guestPasses]);

  const locMap = useMemo(() => new Map(locations.map(l => [l.id, l.name])), [locations]);

  const effectivePriceTier = useMemo(() => {
    const allowed = new Set(["standard", "legacy", "staff", "family"]);

    // 1) Admin override, if valid
    if (priceTierOverride && allowed.has(priceTierOverride)) return priceTierOverride;

    // 2) User tier if active + valid
    const t = user?.pricing_tier || null;
    const until = user?.pricing_tier_until || null;

    if (t && allowed.has(t)) {
      if (isTierStillActive(until)) return t;
    }

    // 3) Household rule: if still standard and in a household, treat as family
    if (!priceTierOverride) {
      const t = user?.pricing_tier || null;
      const until = user?.pricing_tier_until || null;
      const candidate =
        t && allowed.has(t) && isTierStillActive(until) ? t : "standard";
    
      if (candidate === "standard" && household?.id) return "family";
    }

    // 4) Default
    return "standard";
  }, [priceTierOverride, user?.pricing_tier, user?.pricing_tier_until, household?.id]);

  const lastPaymentAt = payments.length
    ? (payments[0].payment_date || payments[0].created_at || null)
    : null;
  const lastCheckinAt = checkins.length ? (checkins[0].checkin_time || null) : null;

  // keep ?tab= in URL (nice for linking)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url.toString());
  }, [tab]);

  useEffect(() => {
    const next = sp?.get("tab") || "overview";
    if (TABS.includes(next) && next !== tab) {
      setTab(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

    async function handleRemoveFromHousehold() {
    if (!household?.id) return showError("No household found.");
    if (removingFromHousehold) return;

    const isBillingOwner = household.billing_owner_id === user?.id;

    const confirmText = `REMOVE FROM HOUSEHOLD

    Customer: ${user?.full_name || user_id}
    Household: ${household.name || household.id}
        
    ${isBillingOwner ? "WARNING: This customer is the BILLING OWNER.\nRemoving them may break billing unless you transfer ownership first.\n\n" : ""}Type REMOVE to proceed.`;

    const input = prompt(confirmText, "");
    if (input !== "REMOVE") {
      showError("Removal cancelled.");
      return;
    }

    setRemovingFromHousehold(true);
    try {
      // Expected API route; see stub below.
      await postAdminJson("/api/admin/households/remove-member", {
        household_id: household.id,
        user_id,
      });

      showSuccess("Customer removed from household.");

      // Clear household state locally
      setHousehold(null);
      setHouseholdMembership(null);
      setHouseholdMembers([]);
      setBillingOwnerUser(null);

      setShowRemoveHouseholdModal(false);

      // Refresh memberships (household flags may change)
      const rows = await fetchMembershipsForUser(supabase, user_id);
      setMemberships(sortMembershipsByStatusThenDate(rows));
    } catch (e) {
      console.error("Remove from household error:", e);
      showError(e.message || "Could not remove from household.");
    } finally {
      setRemovingFromHousehold(false);
    }
  }

  async function handleCreateOrJoinHousehold() {
    if (creatingHousehold) return;

    // If admin typed a household ID, we JOIN that household.
    const joinId = (joinHouseholdId || "").trim();
    const wantsJoin = joinId.length > 0;

    if (wantsJoin && !isUuid(joinId)) {
      showError("That household ID doesn't look like a valid UUID.");
      return;
    }

    setCreatingHousehold(true);

    try {
      let payload;

      if (wantsJoin) {
        // ✅ JOIN FLOW (Step 3 continuation)
        // You need an API route for this. Use whichever endpoint name you already created,
        // or create it next (example endpoint name below).
        payload = await postAdminJson("/api/admin/households/join", {
          household_id: joinId,
          user_id,
          role: "member", // optional; you can omit if your API defaults
        });

        showSuccess("Customer added to household.");
      } else {
        // ✅ CREATE FLOW (your existing step 3 part 1)
        payload = await postAdminJson("/api/admin/households/create", {
          user_id,
          name: householdName,
        });

        showSuccess("Household created and linked to this customer.");
      }

      setHouseholdMembers([]);
      setHousehold(payload.household || null);
      setHouseholdMembership(payload.householdMember || null);

      // Reset modal inputs + close
      setJoinHouseholdId("");
      setHouseholdName("");
      setShowHouseholdModal(false);
    } catch (e) {
      console.error("Create/join household error:", e);
      showError(e.message || "Could not update household.");
    } finally {
      setCreatingHousehold(false);
    }
  }

  async function onClearOverrides() {
    const target = latestMembership(memberships); // or targetMembership() if you switched
    if (!target?.id) {
      showError("No membership found to clear overrides for.");
      return;
    }

    const confirmText = `ADMIN RESET

  This will clear temporary override fields on the target membership, e.g.:
  - billing_day_override
  - pause_until / pause_reason
  - cancellation_scheduled_for / cancellation_reason
  - renewal_pending (set to false)
  - price_override_cents / price_override_currency / proration_override_cents
  - renew_at_discounted_rate
  - needs_contract
  - and similar override flags if present

  Type CLEAR to proceed.`;
    const input = prompt(confirmText, "");
    if (input !== "CLEAR") {
      showError("Reset cancelled.");
      return;
    }

    setClearing(true);
    try {
      const payload = await postAdminJson("/api/admin/memberships/clear-overrides", {
        membershipId: target.id,
      });

      showSuccess(payload?.note || "Overrides cleared.");

      // Refetch memberships
      const rows = await fetchMembershipsForUser(supabase, user_id);
      setMemberships(sortMembershipsByStatusThenDate(rows));
    } catch (e) {
      console.error(e);
      showError(e.message || "Failed to clear overrides.");
    } finally {
      setClearing(false);
    }
  }

  // When plans & memberships are loaded, preselect the matching plan+duration
  useEffect(() => {
    if (selectedPlanDuration) return;
    if (!planDurations.length) return;
    if (!currentActive?.plan_duration_id) return;

    const match = planDurations.find(
      (pd) => String(pd.id) === String(currentActive.plan_duration_id)
    );

    if (match) setSelectedPlanDuration(match);
  }, [planDurations, currentActive?.plan_duration_id, selectedPlanDuration]);

  // Prefill manual amount with the selected plan's price (or discounted price if toggle on)
  // Won't overwrite if the admin already typed a value.
  useEffect(() => {
    if (!selectedPlanDuration) return;
    if (manualAmount && manualAmount.trim() !== "") return;

    const eff = getEffectivePriceForSelection(selectedPlanDuration, priceMap);
    if (eff?.amount_cents != null) {
      setManualAmount((eff.amount_cents / 100).toFixed(2));
    }
  }, [selectedPlanDuration, priceMap]); // still ignoring manualAmount on purpose

  // Build { planDurationId -> { amount_cents, currency } } using plan_duration_prices + Stripe
  useEffect(() => {
    let cancelled = false;

    async function loadPrices() {
      if (!planDurations.length || !planDurationPriceRows.length) return;

      // ✅ SANITY CHECK: never allow an invalid tier to influence lookup
      const allowedTiers = new Set(["standard", "legacy", "staff", "family"]);
      const tierForLookup = allowedTiers.has(effectivePriceTier) ? effectivePriceTier : "standard";

      if (tierForLookup !== effectivePriceTier) {
        console.warn("Invalid effectivePriceTier, forcing standard:", effectivePriceTier);
      }

      // 1) Build plan_duration_id -> stripe_price_id for the active tier (fallback standard)
      const byTier = new Map(); // key: `${plan_duration_id}|||${tier}` -> stripe_price_id
      for (const row of planDurationPriceRows) {
        if (!row?.stripe_price_id) continue;
        if (row?.is_active === false) continue;
      
        const key = `${row.plan_duration_id}|||${row.tier}`;
        byTier.set(key, row.stripe_price_id);
      }

      // 2) Choose price_id per plan_duration_id using tierForLookup, fallback to standard
      const pdToPriceId = {};
      const pdToSource = {};
      const priceIds = [];
          
      for (const pd of planDurations) {
        const id = pd.id;
      
        const k1 = `${id}|||${tierForLookup}`;
        const k2 = `${id}|||standard`;
      
        const tierPriceId = byTier.get(k1);
        const standardPriceId = byTier.get(k2);
      
        const usedTier = tierPriceId ? tierForLookup : (standardPriceId ? "standard" : null);
        const priceId = tierPriceId || standardPriceId;
      
        if (!priceId || !usedTier) continue;
      
        pdToPriceId[id] = priceId;
        pdToSource[id] = {
          requestedTier: tierForLookup,
          usedTier,
          isFallback: usedTier !== tierForLookup,
        };
      
        priceIds.push(priceId);
      }

      const uniquePriceIds = Array.from(new Set(priceIds));
      if (!uniquePriceIds.length) {
        if (!cancelled) {
          setPriceMap({});
          setPriceSourceMap({});
        }
        return;
      }

      // 3) Ask server to fetch Stripe price objects for these price_ids
      try {
        const resp = await fetch("/api/stripe/prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ price_ids: uniquePriceIds }),
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          console.error("Failed to fetch Stripe prices:", text);
          return;
        }

        const payload = await resp.json().catch(() => ({}));
        if (!payload?.ok || !payload?.prices) return;

        // 4) Build priceMap keyed by plan_duration_id so the UI can show the correct price
        const nextMap = {};
        for (const pd of planDurations) {
          const priceId = pdToPriceId[pd.id];
          if (!priceId) continue;

          const priceInfo = payload.prices[priceId];
          if (!priceInfo) continue;

          nextMap[pd.id] = {
            amount_cents: priceInfo.amount_cents,
            currency: priceInfo.currency || "usd",
          };
        }

        if (!cancelled) {
          setPriceMap(nextMap);
          setPriceSourceMap(pdToSource);
        }
      } catch (e) {
        console.error("Error loading Stripe prices:", e);
      }
    }

    loadPrices();

    return () => {
      cancelled = true;
    };
  }, [planDurations, planDurationPriceRows, effectivePriceTier]);

  // ---- CLEAN DROPDOWN HELPERS (Monthly-first fix) ----

  // Preferred order of plans in dropdown (groups)
  const PLAN_ORDER = ["Standard", "Ultimate", "Professional"];

  function planOrderIndex(name = "") {
    const i = PLAN_ORDER.findIndex((p) => p.toLowerCase() === String(name).toLowerCase());
    return i === -1 ? 999 : i;
  }

  // Normalizer
  const norm = (s = "") => String(s).trim();

  // Detect "Monthly" duration rows
  const isMonthlyItem = (x) => {
    // best signal: explicit months column
    if (x?.duration_in_months != null) return Number(x.duration_in_months) === 1;

    // fallback: if it's roughly a month in days
    if (x?.duration_in_days != null) {
      const d = Number(x.duration_in_days);
      return d >= 28 && d <= 31;
    }

    // last-resort fallback: label contains monthly
    const label = String(x?.duration_label || "").toLowerCase();
    return label.includes("month") && label.includes("ly"); // "monthly"
  };

  // Does a plan group contain a monthly option?
  const isMonthlyGroup = (_name, items = []) => items.some(isMonthlyItem);

  // Sort durations within a plan
  function sortDurations(a, b) {
    // 1) Monthly first, no matter what
    const amon = isMonthlyItem(a);
    const bmon = isMonthlyItem(b);
    if (amon !== bmon) return amon ? -1 : 1;

    // 2) Then contract-required before non-contract
    const aContract = !!a.requires_contract;
    const bContract = !!b.requires_contract;
    if (aContract !== bContract) return aContract ? -1 : 1;

    // 3) Then by duration (months, then days)
    const am = a.duration_in_months ?? 0;
    const bm = b.duration_in_months ?? 0;
    if (am !== bm) return am - bm;

    const ad = a.duration_in_days ?? 0;
    const bd = b.duration_in_days ?? 0;
    if (ad !== bd) return ad - bd;

    // 4) Stable fallback by label
    return String(a.duration_label || "").localeCompare(String(b.duration_label || ""));
  }

  // Group and sort plans (any plan group with Monthly shows first)
  const groupedPlans = useMemo(() => {
    const groups = new Map();

    for (const pd of planDurations) {
      const key = norm(pd.plan_name || "Other");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(pd);
    }

    // sort durations inside each plan
    for (const arr of groups.values()) arr.sort(sortDurations);

    // sort plan groups
    return Array.from(groups.entries())
      .sort((a, b) => {
        const [an, aItems] = a;
        const [bn, bItems] = b;

        // 1) Any plan containing "Monthly" duration group goes first
        const aMonthly = isMonthlyGroup(an, aItems);
        const bMonthly = isMonthlyGroup(bn, bItems);
        if (aMonthly !== bMonthly) return aMonthly ? -1 : 1;

        // 2) Then follow your preferred plan order
        const ai = planOrderIndex(an);
        const bi = planOrderIndex(bn);
        if (ai !== bi) return ai - bi;

        // 3) Otherwise alpha
        return an.localeCompare(bn);
      })
      .map(([name, items]) => ({ name, items }));
  }, [planDurations]);

  const filteredGroups = useMemo(() => {
    const q = planFilter.trim().toLowerCase();
    if (!q) return groupedPlans;

    return groupedPlans
      .map((g) => ({
        name: g.name,
        items: g.items.filter((pd) => {
          const pn = String(pd.plan_name || "").toLowerCase();
          const dl = String(pd.duration_label || "").toLowerCase();
          return pn.includes(q) || dl.includes(q);
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [groupedPlans, planFilter]);

  // 🔍 Is the currently selected plan a Paid-In-Full (PIF) style plan?
  const isPIFSelected = useMemo(() => {
    return !!selectedPlanDuration?.is_paid_in_full;
  }, [selectedPlanDuration]);

  const failedPayments = useMemo(() => {
    return payments.filter((p) => normalizeStatus(p.status) === "failed");
  }, [payments]);

  const latestFailedPayment = failedPayments.length ? failedPayments[0] : null;

  useEffect(() => {
    if (!isPIFSelected && discountedRenewal) {
      setDiscountedRenewal(false);
    }
  }, [isPIFSelected, discountedRenewal]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      {/* Back link */}
      <div className="mb-4">
        <Link
          href="/admin/customers"
          className="inline-block px-3 py-2 rounded-md bg-gray-800 border border-gray-700 hover:bg-gray-700"
        >
          ← Back to Customers
        </Link>
      </div>

      {/* Onboarding status helper for admins */}
      {user && user.onboarded === false && (
        <div className="mb-4 rounded-lg border border-amber-400 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">
                This customer hasn&apos;t finished setting up their account.
              </div>
              <p className="mt-1 text-amber-100/80">
                They&apos;ve paid and may already be using the gym, but still need to
                complete their online profile (password, profile photo, etc.).
              </p>
              <p className="mt-2 text-xs text-amber-100/70">
                Share one of these links so they can log in and finish setup:
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* Pre-filled login URL */}
                <code className="rounded bg-black/30 px-2 py-1 text-[11px] break-all">
                  {loginUrl}
                </code>

                {/* Copy link button */}
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(loginUrl)
                      .then(() => showSuccess("Login link copied"))
                      .catch(() => showError("Failed to copy login link."));
                  }}
                  className="rounded border border-amber-400/60 px-2 py-1 text-[11px] font-medium hover:bg-amber-400/20"
                >
                  Copy link
                </button>

                {/* Email login link (goes to /auth/login?email=...) */}
                {user.email && (
                  <button
                    type="button"
                    onClick={() => {
                      console.log("🖱️ Email login link button clicked");
                      handleSendLoginEmail("login");
                    }}
                    className="rounded border border-amber-400/60 px-2 py-1 text-[11px] font-medium hover:bg-amber-400/20"
                  >
                    Email login link
                  </button>
                )}

                {/* Email magic link (one-click login) */}
                {user.email && (
                  <button
                    type="button"
                    onClick={() => {
                      console.log("🖱️ Email magic link button clicked");
                      handleSendLoginEmail("magic");
                    }}
                    className="rounded border border-amber-400/60 px-2 py-1 text-[11px] font-medium hover:bg-amber-400/20"
                  >
                    Email magic link
                  </button>
                )}
              </div>
              {user.email && (
                <p className="mt-2 text-[11px] text-amber-100/70">
                  <span className="font-semibold">Login link:</span> sends them to the normal login
                  page with their email filled in.
                  {" "}
                  <span className="font-semibold">Magic link:</span> logs them in directly when they
                  click it (no password).
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-sm text-gray-400">Customer</div>
          <h1 className="text-3xl font-bold text-yellow-400">{user?.full_name || "—"}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-gray-300">
            {user?.email ? (
              <>
                <a href={`mailto:${user.email}`} className="underline decoration-dotted underline-offset-4">{user.email}</a>
                <button
                  onClick={async () => { try { await navigator.clipboard.writeText(user.email); showSuccess("Email copied"); } catch { showError("Copy failed"); } }}
                  className="text-xs px-2 py-0.5 rounded bg-gray-800 border border-gray-700 hover:bg-gray-700"
                  title="Copy email"
                >
                  Copy
                </button>
              </>
            ) : <span>—</span>}
            {user?.phone && (
              <>
                <span className="opacity-50">•</span>
                <a href={`tel:${user.phone}`} className="underline decoration-dotted underline-offset-4">{user.phone}</a>
                <button
                  onClick={async () => { try { await navigator.clipboard.writeText(user.phone); showSuccess("Phone copied"); } catch { showError("Copy failed"); } }}
                  className="text-xs px-2 py-0.5 rounded bg-gray-800 border border-gray-700 hover:bg-gray-700"
                  title="Copy phone"
                >
                  Copy
                </button>
              </>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded border ${statusClass}`} title={statusLabel}>
              {statusLabel}
            </span>
            {firstMembershipStart && (
              <span className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 border border-gray-700">
                Member since: {formatAdminDate(firstMembershipStart)}
              </span>
            )}
          </div>
        </div>

        {latestFailedPayment && (
          <div className="mb-4 rounded-lg border border-red-500/70 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">Failed payment detected</div>
                <div className="mt-1 text-red-100/80">
                  {formatAdminDateTime(latestFailedPayment.payment_date || latestFailedPayment.created_at)}{" "}
                  • {money(getPaymentCents(latestFailedPayment), (latestFailedPayment.currency || "USD").toUpperCase())}
                  {" "}• {latestFailedPayment.method || "—"}
                </div>
                {latestFailedPayment.description && (
                  <div className="mt-1 text-xs text-red-100/70">
                    {latestFailedPayment.description}
                  </div>
                )}
              </div>
              
              <button
                className="shrink-0 text-xs px-3 py-1.5 rounded bg-red-900/20 border border-red-600 text-red-100 hover:bg-red-900/30"
                onClick={() => setTab("payments")}
              >
                View payments
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button
            className="px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 border border-gray-600"
            onClick={() => openCreateModal({ withPayment: true })}
          >
            Collect payment
          </button>
                    
          <button
            onClick={() => openCreateModal({ withPayment: false })}
            className="px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 border border-gray-600"
          >
            Create / renew membership
          </button>
          <button
            className="px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 border border-gray-600"
            onClick={openIssuePassModal}
          >
            Issue guest pass
          </button>

          {/* Admin Debug / Reset */}
          <button
            onClick={onClearOverrides}
            disabled={clearing || memberships.length === 0}
            className={`px-3 py-2 rounded-md border transition ${
              clearing || memberships.length === 0
                ? "bg-gray-700 border-gray-600 text-gray-400 cursor-not-allowed"
                : "bg-red-800/20 border-red-500/60 text-red-300 hover:bg-red-800/30"
            }`}
            title="Admin Debug: Clear override fields (billing day, pause, cancel, renewal, etc.)"
            aria-label="Admin Debug: Clear override fields (billing day, pause, cancel, renewal, etc.)"
          >
            {clearing
              ? "Clearing…"
              : "Admin Debug: Clear override fields (billing day, pause, cancel, renewal, etc.)"}
          </button>
        </div>
      </div>

      {/* Account details (clean home for created date, role, ids, etc.) */}
      <div className="mb-6 bg-gray-800 border border-gray-700 rounded-xl p-4">
        <div className="font-semibold mb-3">Account</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          <div className="flex justify-between sm:block">
            <div className="text-gray-400">Created</div>
            <div className="text-gray-200">
              {formatAdminDateTime(user?.created_at)}
            </div>
          </div>
          <div className="flex justify-between sm:block">
            <div className="text-gray-400">Role</div>
            <div className="text-gray-200">{user?.role || "—"}</div>
          </div>
          <div className="flex justify-between sm:block">
            <div className="text-gray-400">Customer #</div>
            <div className="text-gray-200 font-mono">{user?.customer_no ?? "-"}</div>
          </div>
          <div className="flex justify-between sm:block">
            <div className="text-gray-400">User ID</div>
            <div className="flex items-center gap-2 sm:block">
              <button
                type="button"
                onClick={async () => {
                  if (!user?.id) return;
                  try {
                    await navigator.clipboard.writeText(user.id);
                    setCopied(true);
                    showSuccess("Copied user ID");
                    setTimeout(() => setCopied(false), 1200);
                  } catch {
                    showError("Failed to copy");
                  }
                }}
                className="font-mono text-xs md:text-sm text-gray-200 bg-gray-900 border border-gray-700 px-2 py-1 rounded hover:bg-gray-800 break-all"
                title="Click to copy full ID"
              >
                {showFullId ? user?.id : truncateMiddle(user?.id, 8)}
              </button>
              
              <button
                type="button"
                onClick={() => setShowFullId((v) => !v)}
                className="text-xs text-yellow-300 hover:underline"
                title={showFullId ? "Show less" : "Show full"}
              >
                {showFullId ? "Show less" : "Show full"}
              </button>
              
              {copied && (
                <span className="text-xs text-green-300">Copied!</span>
              )}
            </div>
          </div>
          {/* Add more here later (email verified, last login, address on file, etc.) */}
        </div>
      </div>

      {/* Household */}
      <div className="mb-6 bg-gray-800 border border-gray-700 rounded-xl p-4">
        <div className="font-semibold mb-3">Household</div>

        {!household ? (
          <div className="flex items-center justify-between text-sm text-gray-300">
            <span>This customer is not in a household.</span>
            <button
              className="px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 border border-gray-600 text-xs"
              onClick={() => {
                const defaultName = user?.full_name ? `${user.full_name}'s household` : "";
                setHouseholdName(defaultName);
                setShowHouseholdModal(true);
              }}
            >
              Create / add to household
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4 mb-3 text-sm">
              {/* Left: household info */}
              <div className="min-w-[260px]">
                <div className="text-gray-400">Household</div>
        
                <div className="mt-1 text-gray-200 font-medium">
                  {household.name || "—"}
                </div>
        
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-300">
                  <span className="px-2 py-0.5 rounded bg-gray-900 border border-gray-700 font-mono">
                    {truncateMiddle(household.id, 8)}
                  </span>
        
                  <button
                    className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 hover:bg-gray-700"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(household.id);
                        showSuccess("Household ID copied");
                      } catch {
                        showError("Copy failed");
                      }
                    }}
                    title="Copy household ID"
                  >
                    Copy ID
                  </button>
                  
                  {billingOwnerUser?.id && (
                    <>
                      <span className="opacity-50">•</span>
                      <span className="text-gray-400">Billing owner:</span>
                      <Link
                        className="underline decoration-dotted underline-offset-4"
                        href={`/admin/customers/${billingOwnerUser.id}`}
                        title="Open billing owner"
                      >
                        {billingOwnerUser.full_name || truncateMiddle(billingOwnerUser.id, 6)}
                      </Link>
                    </>
                  )}
                </div>
                
                <div className="mt-2 text-xs text-gray-300">
                  <div>
                    PIF end action:&nbsp;
                    <span className="px-2 py-0.5 rounded bg-gray-900 border border-gray-700">
                      {household?.pif_end_action || "none"}
                    </span>
                  </div>
                  {household?.pif_end_choice_set_at && (
                    <div className="text-gray-500 mt-1">
                      Set {timeAgo(household.pif_end_choice_set_at)}
                    </div>
                  )}
                </div>
              </div>
                
              {/* Right: members + actions */}
              <div className="w-full max-w-md">
                <div className="text-xs text-gray-400 mb-2">Members</div>
                
                <div className="rounded-lg border border-gray-700 bg-gray-900/50">
                  {householdMembers.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-400">
                      No other members found.
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-800 text-sm">
                      {householdMembers.map((hmRow) => (
                        <li
                          key={hmRow.user_id}
                          className="px-3 py-2 flex justify-between gap-2"
                        >
                          <div>
                            <div className="text-gray-200">
                              {hmRow.users?.full_name || "—"}
                            </div>
                            <div className="text-xs text-gray-400">
                              {hmRow.users?.email || "—"}
                            </div>
                          </div>
                          <div className="text-right text-xs text-gray-300">
                            <div>{hmRow.role || "member"}</div>
                            <div className={hmRow.is_active ? "text-green-300" : "text-gray-500"}>
                              {hmRow.is_active ? "Active" : "Inactive"}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <button
                    className="px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 border border-gray-600"
                    onClick={() => {
                      setPifEndAction(household?.pif_end_action || "none");
                      setPifActionNote("");
                      setShowManageHouseholdModal(true);
                    }}
                  >
                    Manage household
                  </button>
                  
                  <button
                    className="px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 text-red-300"
                    onClick={() => setShowRemoveHouseholdModal(true)}
                  >
                    Move / remove from household
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* PIF-in-household heads-up (admin view, read-only for now) */}
      {showPifHouseholdBanner && (
        <div className="mb-6 rounded-xl border border-amber-500/70 bg-amber-500/10 p-4 text-sm text-amber-100">
          <div className="font-semibold mb-1">
            Paid-in-full membership in a household is ending soon
          </div>
          <p className="text-amber-100/85">
            This customer has a <span className="font-semibold">paid-in-full membership</span> while
            being part of a household. Their PIF term ends on{" "}
            <span className="font-semibold">
              {currentActive?.expires_at
                ? formatAdminDate(currentActive.expires_at)
                : "—"}
            </span>.
          </p>
          <p className="mt-1 text-xs text-amber-100/75">
            When the term ends, you&apos;ll need to choose what happens next
            (stay on household billing, renew PIF, or move back to an individual plan).
            For now this is just a heads-up — the choice logic will be added later.
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Lifetime value" value={money(ltvCents)} />
        <Stat label="Last payment" value={
          lastPaymentAt ? `${formatAdminDateTime(lastPaymentAt)} · ${timeAgo(lastPaymentAt)}` : "—"
        } />
        <Stat label="Last check-in" value={
          lastCheckinAt ? `${formatAdminDateTime(lastCheckinAt)} · ${timeAgo(lastCheckinAt)}` : "—"
        } />
        <Stat label="Active memberships" value={memberships.filter(m => (m.status || "").toLowerCase() === "active").length} />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t) => (
          <TabButton key={t} active={tab === t} onClick={() => setTab(t)}>
            {t === "guest-passes" ? "Guest Passes" : t[0].toUpperCase() + t.slice(1)}
          </TabButton>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-900/40 border border-red-700 text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div>Loading…</div>
      ) : (
        <>
          {tab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* left: recent payments */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                <div className="font-semibold mb-3">Recent Payments</div>
                {payments.length === 0 ? (
                  <div className="text-gray-400 text-sm">No payments yet.</div>
                ) : (
                  <div className="space-y-2">
                    {payments.slice(0, 6).map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        
                          <div className="text-gray-300">
                            <>
                              {formatAdminDate(p.payment_date || p.created_at)}
                              {" · "}
                              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-900 border border-gray-700">
                                {(p.method || "—")}{p.provider ? `/${p.provider}` : ""}
                              </span>
                              {" · "}
                              <PaymentStatus status={p.status} />
                              {" · "}
                              <span className="text-xs text-gray-400">{timeAgo(p.payment_date || p.created_at)}</span>
                            </>
                            {renderLinkedWithBullet(p, membershipsById, guestPassesById, pdMap)}
                          </div>
                        <PaymentAmount p={p} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* right: memberships summary */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                <div className="font-semibold mb-3">Memberships</div>
                {memberships.length === 0 ? (
                  <div className="text-gray-400 text-sm">No memberships.</div>
                ) : (
                  <div className="space-y-2">
                    {memberships.slice(0, 6).map((m) => (
                      <div key={m.id} className="text-sm flex items-center justify-between">
                        <div className="text-gray-300">
                          {planLabelFor(m, pdMap)}
                          <div className="text-xs text-gray-400">
                            {formatAdminDate(m.start_date)} → {formatAdminDate(m.expires_at)}
                          </div>
                        </div>
                        <MembershipStatus membership={m} variant="pill" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "memberships" && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl">
              <table className="w-full text-left">
                <thead className="text-gray-300 bg-gray-700">
                  <tr>
                    <th className="px-4 py-2">Plan</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Start</th>
                    <th className="px-4 py-2">End</th>
                    <th className="px-4 py-2">Contract</th>
                    <th className="px-4 py-2">Auto-Renew</th>
                    <th className="px-4 py-2 text-right">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {memberships.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-2">{planLabelFor(m, pdMap)}</td>
                      <td className="px-4 py-2"><MembershipStatus membership={m} variant="pill" /></td>
                      <td className="px-4 py-2">{formatAdminDate(m.start_date)}</td>
                      <td className="px-4 py-2">{formatAdminDate(m.expires_at)}</td>
                      <td className="px-4 py-2">
                        {(() => {
                          const pd = m.plan_duration_id ? pdMap.get(m.plan_duration_id) : null;
                          const requires = pd?.requires_contract === true;
                          return requires ? "Requires" : "N/A";
                        })()}
                      </td>
                      <td className="px-4 py-2">{m.auto_renewal_enabled ? "Enabled" : "Disabled"}</td>
                      <td className="px-4 py-2 text-right">
                        <Link className="underline" href={`/admin/memberships/${m.id}`}>Open</Link>
                      </td>
                    </tr>
                  ))}
                  {memberships.length === 0 && (
                    <tr><td className="px-4 py-3 text-gray-400" colSpan={7}>No memberships.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "guest-passes" && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl">
              <table className="w-full text-left">
                <thead className="text-gray-300 bg-gray-700">
                  <tr>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Start</th>
                    <th className="px-4 py-2">Expires</th>
                    <th className="px-4 py-2">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {guestPasses.map((g) => (
                    <tr key={g.id}>
                      <td className="px-4 py-2">
                        <span className={cls("text-xs px-2 py-1 rounded border", guestPassStatusPill(g.status))}>
                          {(g.status || "—").replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {formatAdminDate(g.start_date)}
                      </td>
                      <td className="px-4 py-2">
                        {g.expires_at
                          ? formatAdminDate(g.expires_at)
                          : (g.redeemed_on ? formatAdminDate(g.redeemed_on) : "—")}
                      </td>
                      <td className="px-4 py-2">
                        {g.location_id ? (locMap.get(g.location_id) || g.location_id) : "—"}
                      </td>
                    </tr>
                  ))}
                  {guestPasses.length === 0 && (
                    <tr><td className="px-4 py-3 text-gray-400" colSpan={4}>No guest passes.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "payments" && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl">
              <table className="w-full text-left">
                <thead className="text-gray-300 bg-gray-700">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Amount</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Method</th>
                    <th className="px-4 py-2">Linked To</th>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2">
                        <div className="leading-tight">
                          <div>{formatAdminDateTime(p.payment_date || p.created_at)}</div>
                          <div className="text-xs text-gray-400">{timeAgo(p.payment_date || p.created_at)}</div>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <PaymentAmount p={p} />
                      </td>
                      <td className="px-4 py-2">
                        <PaymentStatus status={p.status} />
                      </td>
                      <td className="px-4 py-2">
                        {p.method || "—"}{p.provider ? `/${p.provider}` : ""}
                      </td>
                      <td className="px-4 py-2">
                        {renderLinkedTo(p, membershipsById, guestPassesById, pdMap)}
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-sm">{p.description || "—"}</div>
                                        
                        {normalizeStatus(p.status) === "refunded" && (
                          <div className="mt-1 text-xs text-orange-200/80 space-y-0.5">
                            <div>Refunded by: {p.refunded_by_name || p.refunded_by || "—"}</div>
                            <div>Reason: {p.refund_reason || "—"}</div>
                            <div>Refunded at: {p.refunded_at ? formatAdminDateTime(p.refunded_at) : "—"}</div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {normalizeStatus(p.status) === "failed" && (
                          <button
                            className="text-xs px-2 py-1 rounded bg-red-900/20 border border-red-700 text-red-200 hover:bg-red-900/30"
                            onClick={() => showError("Retry not wired yet (next step).")}
                          >
                            Retry
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr><td className="px-4 py-3 text-gray-400" colSpan={7}>No payments.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "checkins" && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl">
              <table className="w-full text-left">
                <thead className="text-gray-300 bg-gray-700">
                  <tr>
                    <th className="px-4 py-2">Check-in</th>
                    <th className="px-4 py-2">Location</th>
                    <th className="px-4 py-2">Distance</th>
                    <th className="px-4 py-2">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {checkins.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2">
                        {c.checkin_time ? formatAdminDateTime(c.checkin_time) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {c.location_id ? (locMap.get(c.location_id) || c.location_id) : "—"}
                      </td>
                      <td className="px-4 py-2">{c.distance_meters != null ? `${c.distance_meters}m` : "—"}</td>
                      <td className="px-4 py-2">{c.checkin_type || "—"}</td>
                    </tr>
                  ))}
                  {checkins.length === 0 && (
                    <tr><td className="px-4 py-3 text-gray-400" colSpan={4}>No check-ins.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "notes" && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-gray-300">
              <div className="text-sm mb-2">Notes (coming soon)</div>
              <div className="text-xs text-gray-500">You can add a simple notes table later (user_id, body, tags, created_by, created_at).</div>
            </div>
          )}
        </>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-base font-semibold text-yellow-300">Create or Renew</div>
              <button
                className="text-gray-300 hover:text-white"
                onClick={closeCreateModal}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
                  
            {/* Current membership summary */}
            <div className="mb-4 rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-gray-300">
                  <div className="font-medium">
                    {currentActive ? planLabelFor(currentActive, pdMap) : "No active membership"}
                  </div>
                  {currentActive ? (
                    <div className="text-xs text-gray-400">
                      Ends: {formatAdminDateTime(currentActive.expires_at)}
                      {" · "}
                      Grace ends: {
                        currentActive.grace_ends_at
                          ? formatAdminDateTime(currentActive.grace_ends_at)
                          : currentActive.expires_at
                            ? formatAdminDateTime(
                                addDaysToUtcIso(currentActive.expires_at, MEMBERSHIP_GRACE_DAYS)
                              )
                            : "—"
                      }
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">Choose a plan below to activate.</div>
                  )}
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded border ${
                    currentActive
                      ? "bg-green-900/30 text-green-300 border-green-700"
                      : "bg-gray-900/30 text-gray-300 border-gray-700"
                  }`}
                >
                  {currentActive ? "Active" : "No active"}
                </span>
              </div>
            </div>

            <div className="mb-2 flex items-center justify-between text-xs text-gray-300">
              <span>
                Pricing tier: <span className="font-semibold">{effectivePriceTier}</span>
                {priceTierOverride ? (
                  <span className="ml-2 text-[11px] text-amber-200/80">(override)</span>
                ) : (
                  <span className="ml-2 text-[11px] text-gray-400">(auto)</span>
                )}
              </span>
              
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cls(
                    "px-2 py-1 rounded border",
                    priceTierOverride === null
                      ? "border-yellow-400 bg-yellow-500 text-black"
                      : "border-gray-700 bg-gray-800 hover:bg-gray-700"
                  )}
                  onClick={() => setPriceTierOverride(null)}
                >
                  Auto
                </button>
                
                <button
                  type="button"
                  className={cls(
                    "px-2 py-1 rounded border",
                    priceTierOverride === "standard"
                      ? "border-yellow-400 bg-yellow-500 text-black"
                      : "border-gray-700 bg-gray-800 hover:bg-gray-700"
                  )}
                  onClick={() => setPriceTierOverride("standard")}
                >
                  Standard
                </button>
                
                <button
                  type="button"
                  className={cls(
                    "px-2 py-1 rounded border",
                    priceTierOverride === "legacy"
                      ? "border-yellow-400 bg-yellow-500 text-black"
                      : "border-gray-700 bg-gray-800 hover:bg-gray-700"
                  )}
                  onClick={() => setPriceTierOverride("legacy")}
                >
                  Legacy
                </button>
                
                <button
                  type="button"
                  className={cls(
                    "px-2 py-1 rounded border",
                    priceTierOverride === "staff"
                      ? "border-yellow-400 bg-yellow-500 text-black"
                      : "border-gray-700 bg-gray-800 hover:bg-gray-700"
                  )}
                  onClick={() => setPriceTierOverride("staff")}
                >
                  Staff
                </button>
                
                <button
                  type="button"
                  className={cls(
                    "px-2 py-1 rounded border",
                    priceTierOverride === "family"
                      ? "border-yellow-400 bg-yellow-500 text-black"
                      : "border-gray-700 bg-gray-800 hover:bg-gray-700"
                  )}
                  onClick={() => setPriceTierOverride("family")}
                >
                  Family
                </button>

                <button
                  type="button"
                  className="px-2 py-1 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700"
                  onClick={runStripeAudit}
                >
                  Audit Price IDs
                </button>
              </div>
            </div>

            {/* Plan + Duration */}
            <div className="mb-4">
              <div className="flex items-end justify-between gap-2 mb-1">
                <div className="text-sm text-gray-300">Plan &amp; Duration</div>

                {/* (Optional) little search field */}
                <div className="w-56">
                  <input
                    type="text"
                    placeholder="Filter plans…"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 placeholder-gray-500"
                    value={planFilter}
                    onChange={(e) => setPlanFilter(e.target.value)}
                  />
                </div>
              </div>

              <select
                disabled={loadingPlans || planDurations.length === 0}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100"
                value={selectedPlanDuration?.id || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  const pd = planDurations.find(p => String(p.id) === String(val));
                  setSelectedPlanDuration(pd || null);
                }}
              >
                <option value="" disabled>
                  {loadingPlans ? "Loading…" : "Select a plan + duration"}
                </option>
              
                {/* Grouped + sorted, without price clutter */}
                {filteredGroups.map(group => (
                  <optgroup key={group.name} label={group.name}>
                    {group.items.map(pd => (
                      <option
                        key={pd.id}
                        value={pd.id}
                        title={(() => {
                          const p = getFormattedPriceForPD(pd, priceMap);
                          return [
                            pd.plan_name,
                            pd.duration_label,
                            pd.requires_contract ? "(requires contract)" : null,
                            p?.formatted ? `Stripe: ${p.formatted}` : null,
                          ]
                            .filter(Boolean)
                            .join(" • ");
                        })()}
                      >
                        {pd.duration_label}
                        {pd.requires_contract ? " (contract)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              
              {/* Keep price/metadata cleanly below the select */}
              {selectedPlanDuration && (
                <div className="mt-2 text-sm text-gray-300 space-y-0.5">
                  {(() => {
                    const p = getFormattedPriceForPD(selectedPlanDuration, priceMap);
                    const formatted = p?.formatted || "—";
                    return (
                      <>
                        <div>
                          Stripe price:&nbsp;<span className="font-medium">{formatted}</span>
                        </div>
                        <div className="text-xs text-gray-400">
                          {selectedPlanDuration.requires_contract ? "Requires contract." : "No contract required."}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
              
            {/* Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={autoRenew}
                  onChange={(e) => setAutoRenew(e.target.checked)}
                />
                Auto-renew
              </label>
              
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={discountedRenewal && isPIFSelected}
                  disabled={!isPIFSelected}
                  onChange={(e) => setDiscountedRenewal(e.target.checked)}
                />
                <span>
                  Renew at discounted rate (PIF only)
                  {!isPIFSelected && (
                    <span className="ml-1 text-xs text-gray-500">
                      (select a paid-in-full duration)
                    </span>
                  )}
                </span>
              </label>
            </div>

            {/* Record manual payment */}
            <div className="mb-4 rounded-lg border border-gray-700 bg-gray-800">
              <div className="flex items-center justify-between p-3">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={recordPayment}
                    onChange={(e) => setRecordPayment(e.target.checked)}
                  />
                  Record payment now (front desk)
                </label>
                {recordPayment && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-gray-900 border border-gray-700 text-gray-300">
                    {manualMethod === "cash" ? "Cash" : "Other"}
                  </span>
                )}
              </div>
              
              {recordPayment && (
                <div className="border-t border-gray-700 p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Amount (USD)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100"
                        placeholder="e.g. 99.00"
                        value={manualAmount}
                        onChange={(e) => setManualAmount(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Method</label>
                      <select
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100"
                        value={manualMethod}
                        onChange={(e) => setManualMethod(e.target.value)}
                      >
                        {/* If you want literally only cash, delete the “other” option */}
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Description</label>
                      <input
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100"
                        placeholder="e.g. Front desk payment"
                        value={manualDesc}
                        onChange={(e) => setManualDesc(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <hr className="my-3 border-gray-700" />
              
            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700"
                onClick={closeCreateModal}
              >
                Cancel
              </button>
              <button
                className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700"
                disabled={!selectedPlanDuration || activating}
                onClick={async () => {
                  if (!selectedPlanDuration || activating) return;
                
                  setActivating(true);
                  try {
                    let amount_cents = null;
                  
                    if (recordPayment) {
                      if (!manualAmount || isNaN(Number(manualAmount)) || Number(manualAmount) <= 0) {
                        showError("Enter a valid amount.");
                        return;
                      }
                      amount_cents = Math.round(parseFloat(manualAmount) * 100);
                    }
                  
                    const payload = await postAdminJson("/api/admin/memberships/admin-activate", {
                      user_id,
                      plan_duration_id: selectedPlanDuration.id,
                      auto_renewal_enabled: !!autoRenew,
                      renew_at_discounted_rate: !!discountedRenewal && isPIFSelected,
                      source: "admin-manual",
                      payment: recordPayment && amount_cents
                        ? {
                            amount_cents,
                            currency: "USD",
                            method: manualMethod,
                            provider: "manual",
                            description: manualDesc || null,
                          }
                        : null,
                    });
                  
                    showSuccess(
                      payload?.payment_recorded
                        ? "Membership activated and payment recorded."
                        : "Membership activated."
                    );
                    closeCreateModal();
                  
                    // refresh memberships + payments
                    const [mRows, paymentRows] = await Promise.all([
                      fetchMembershipsForUser(supabase, user_id),
                      fetchPaymentsForUserClient(user_id),
                    ]);

                    const paymentsSorted2 = (paymentRows || []).slice().sort(
                      (a, b) =>
                        (toValidDate(b.payment_date || b.created_at) || new Date(0)) -
                        (toValidDate(a.payment_date || a.created_at) || new Date(0))
                    );
                  
                    setMemberships(sortMembershipsByStatusThenDate(mRows));
                    setPayments(paymentsSorted2);
                  } catch (e) {
                    console.error(e);
                    showError(e.message || "Manual activation failed.");
                  } finally {
                    setActivating(false);
                  }
                }}
              >
                {activating ? "Activating…" : "Manual Activate (skip Stripe / cash)"}
              </button>
              <button
                className="px-3 py-2 rounded-md bg-yellow-500 text-black hover:bg-yellow-400"
                disabled={!selectedPlanDuration}
                onClick={async () => {
                  if (!selectedPlanDuration) return;
                
                  if (selectedPlanDuration.requires_contract) {
                    const url =
                      `/contract?user_id=${encodeURIComponent(user_id)}` +
                      `&plan_duration_id=${encodeURIComponent(selectedPlanDuration.id)}` +
                      `&auto_renew=${autoRenew ? "1" : "0"}` +
                      `&discounted=${discountedRenewal ? "1" : "0"}` +
                      `&pricing_tier=${encodeURIComponent(effectivePriceTier)}` +
                      (priceTierOverride ? `&pricing_tier_override=${encodeURIComponent(priceTierOverride)}` : "") +
                      `&source=admin`;
                    window.location.href = url;
                    return;
                  }
                
                  try {
                    const url = await createStripeSession({
                      userId: user_id,
                      planDurationId: selectedPlanDuration.id,
                      requiresContract: false,
                      autoRenewalEnabled: !!autoRenew,
                      renewAtDiscountedRate: !!discountedRenewal && isPIFSelected,
                      source: "admin",
                      pricingTier: effectivePriceTier,
                      pricingTierOverride: priceTierOverride, // ✅ now supported
                    });
                  
                    if (!url) throw new Error("Missing checkout URL.");
                    window.location.href = url;
                  } catch (e) {
                    console.error(e);
                    showError(e.message || "Could not start checkout.");
                  }
                }}
              >
                {selectedPlanDuration?.requires_contract ? "Review & Sign Contract" : "Proceed to Checkout"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showIssuePass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold text-yellow-300">Issue Guest Pass</div>
              <button
                className="text-gray-300 hover:text-white"
                onClick={closeIssuePassModal}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              {/* Duration */}
              <label className="block">
                <div className="text-sm text-gray-300 mb-1">Duration</div>
                <select
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100"
                  value={gpDuration}
                  onChange={(e) => setGpDuration(Number(e.target.value))}
                >
                  <option value={1}>1 day</option>
                  <option value={3}>3 days</option>
                  <option value={7}>7 days</option>
                </select>
              </label>
            
              {/* Location (optional) */}
              <label className="block">
                <div className="text-sm text-gray-300 mb-1">Location (optional)</div>
                <select
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100"
                  value={gpLocationId}
                  onChange={(e) => setGpLocationId(e.target.value)}
                >
                  <option value="">— No location —</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </label>
                
              {/* Promotional */}
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={gpIsPromo}
                  onChange={(e) => setGpIsPromo(e.target.checked)}
                />
                Promotional pass
              </label>
                
              <div className="text-xs text-gray-400">
                The pass starts now and expires after the selected duration.
              </div>
            </div>
                
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700"
                onClick={closeIssuePassModal}
                disabled={issuing}
              >
                Cancel
              </button>
              <button
                className={cls(
                  "px-3 py-2 rounded-md border",
                  issuing
                    ? "bg-gray-700 border-gray-600 text-gray-300"
                    : "bg-yellow-500 text-black hover:bg-yellow-400 border-yellow-400"
                )}
                onClick={async () => {
                  if (issuing) return;
                  setIssuing(true);
                  try {
                    const payload = await postAdminJson("/api/admin/guest-passes/issue", {
                      user_id,
                      duration_days: gpDuration,
                      location_id: gpLocationId || null,
                      is_promotional: !!gpIsPromo,
                      pass_source: "admin",
                    });
                  
                    showSuccess(`Guest pass issued (${gpDuration}-day).`);
                  
                    // Refresh guest passes
                    const data = await fetchGuestPassesForUserClient(user_id);

                    const sorted = (data || []).slice().sort(
                      (a, b) =>
                        (toValidDate(b.start_date) || new Date(0)) -
                        (toValidDate(a.start_date) || new Date(0))
                    );
                    setGuestPasses(sorted);
                    closeIssuePassModal();
                    setTab("guest-passes");
                  } catch (e) {
                    console.error(e);
                    showError(e.message || "Could not issue pass.");
                  } finally {
                    setIssuing(false);
                  }
                }}
                disabled={issuing}
              >
                {issuing ? "Issuing…" : "Issue pass"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHouseholdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold text-yellow-300">Create / Join Household</div>
              <button
                className="text-gray-300 hover:text-white"
                onClick={() => setShowHouseholdModal(false)}
                aria-label="Close"
                disabled={creatingHousehold}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="space-y-3">
              <div className="text-sm text-gray-300">
                If you enter an existing Household ID, we will <span className="font-semibold">join</span>.
                Otherwise, we will <span className="font-semibold">create</span> a new household.
              </div>

              {/* Join existing */}
              <label className="block">
                <div className="text-sm text-gray-300 mb-1">Join existing household (ID)</div>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100"
                  placeholder="uuid..."
                  value={joinHouseholdId}
                  onChange={(e) => setJoinHouseholdId(e.target.value)}
                  disabled={creatingHousehold}
                />
                <div className="mt-1 text-xs text-gray-500">
                  If this is filled in, we join and ignore the household name below.
                </div>
              </label>

              <hr className="my-2 border-gray-700" />

              {/* Create new */}
              <label className="block">
                <div className="text-sm text-gray-300 mb-1">Household name (for new household)</div>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100"
                  placeholder="e.g. Guzman Family"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  disabled={creatingHousehold || joinHouseholdId.trim().length > 0}
                />
                <div className="mt-1 text-xs text-gray-500">
                  Optional. Disabled if you’re joining an existing household.
                </div>
              </label>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700"
                onClick={() => setShowHouseholdModal(false)}
                disabled={creatingHousehold}
              >
                Cancel
              </button>

              <button
                className={cls(
                  "px-3 py-2 rounded-md border",
                  creatingHousehold
                    ? "bg-gray-700 border-gray-600 text-gray-300"
                    : "bg-yellow-500 text-black hover:bg-yellow-400 border-yellow-400"
                )}
                disabled={creatingHousehold}
                onClick={handleCreateOrJoinHousehold}
              >
                {creatingHousehold
                  ? "Working…"
                  : (joinHouseholdId.trim() ? "Join household" : "Create household")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showManageHouseholdModal && household?.id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold text-yellow-300">Manage Household</div>
              <button
                className="text-gray-300 hover:text-white"
                onClick={() => setShowManageHouseholdModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            
            <div className="text-sm text-gray-300 mb-3">
              Household: <span className="font-semibold">{household.name || "—"}</span>
            </div>
            
            <div className="space-y-3">
              <label className="block">
                <div className="text-sm text-gray-300 mb-1">PIF end action</div>
                <select
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100"
                  value={pifEndAction}
                  onChange={(e) => setPifEndAction(e.target.value)}
                >
                  <option value="none">None (not decided)</option>
                  <option value="stay_household">Stay on household billing</option>
                  <option value="renew_pif">Renew paid-in-full</option>
                  <option value="move_individual">Move to individual plan</option>
                </select>
            
                <div className="mt-1 text-xs text-gray-500">
                  This is used when a paid-in-full term ends for a household member.
                </div>
              </label>
            
              <label className="block">
                <div className="text-sm text-gray-300 mb-1">Admin note (optional)</div>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100"
                  placeholder="e.g. Customer requested move back to individual"
                  value={pifActionNote}
                  onChange={(e) => setPifActionNote(e.target.value)}
                />
              </label>
            </div>
            
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700"
                onClick={() => setShowManageHouseholdModal(false)}
                disabled={savingPifAction}
              >
                Cancel
              </button>
            
              <button
                className={cls(
                  "px-3 py-2 rounded-md border",
                  savingPifAction
                    ? "bg-gray-700 border-gray-600 text-gray-300"
                    : "bg-yellow-500 text-black hover:bg-yellow-400 border-yellow-400"
                )}
                disabled={savingPifAction}
                onClick={async () => {
                  if (savingPifAction) return;
                  if (!household?.id) return;
                
                  setSavingPifAction(true);
                  try {
                    const token = await getAdminTokenOrThrow();

                    const resp = await fetch("/api/admin/households/set-pif-end-action", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({
                        household_id: household.id,
                        pif_end_action: pifEndAction,
                        note: pifActionNote || null,
                      }),
                    });
                  
                    const payload = await resp.json().catch(() => ({}));
                    if (!resp.ok || payload?.ok === false) {
                      throw new Error(payload?.error || "Failed to save household action.");
                    }
                  
                    showSuccess("Household setting saved.");
                  
                    // Update household in state so the card reflects it immediately
                    if (payload.household) {
                      setHousehold(payload.household);
                    } else {
                      // fallback: minimal local update
                      setHousehold((h) =>
                        h
                          ? {
                              ...h,
                              pif_end_action: pifEndAction,
                              pif_end_choice_set_at: getNowUtcIso(),
                            }
                          : h
                      );
                    }
                  
                    // Refresh memberships too (so banner + UI stays consistent)
                    const rows = await fetchMembershipsForUser(supabase, user_id);
                    setMemberships(sortMembershipsByStatusThenDate(rows));
                      
                    setShowManageHouseholdModal(false);
                  } catch (e) {
                    console.error(e);
                    showError(e.message || "Could not save household setting.");
                  } finally {
                    setSavingPifAction(false);
                  }
                }}
              >
                {savingPifAction ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRemoveHouseholdModal && household?.id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold text-yellow-300">Move / Remove</div>
              <button
                className="text-gray-300 hover:text-white"
                onClick={() => setShowRemoveHouseholdModal(false)}
                aria-label="Close"
                disabled={removingFromHousehold}
              >
                ✕
              </button>
            </div>

            <div className="text-sm text-gray-300">
              Customer: <span className="font-semibold">{user?.full_name || "—"}</span>
              <div className="mt-1 text-xs text-gray-500">
                Household: {household.name || "—"} • {truncateMiddle(household.id, 8)}
              </div>

              {household.billing_owner_id === user?.id && (
                <div className="mt-3 rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  This customer is the <span className="font-semibold">billing owner</span>.
                  You should transfer billing ownership before removing them (recommended).
                </div>
              )}

              <div className="mt-3 text-xs text-gray-500">
                For now this action removes this customer from the household. “Move” flows
                (transfer billing owner, move to a different household) can be added next.
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700"
                onClick={() => setShowRemoveHouseholdModal(false)}
                disabled={removingFromHousehold}
              >
                Cancel
              </button>

              <button
                className={cls(
                  "px-3 py-2 rounded-md border",
                  removingFromHousehold
                    ? "bg-gray-700 border-gray-600 text-gray-300"
                    : "bg-red-800/20 border-red-500/60 text-red-300 hover:bg-red-800/30"
                )}
                onClick={handleRemoveFromHousehold}
                disabled={removingFromHousehold}
              >
                {removingFromHousehold ? "Removing…" : "Remove from household"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default withAuth(CustomerPage, "admin");