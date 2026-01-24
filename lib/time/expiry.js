// lib/time/expiry.js

function toLocalDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
}
export function startOfDayLocal(d) { const n = toLocalDate(d || new Date()); n.setHours(0,0,0,0); return n; }
export function endOfDayLocal(d)   { const n = toLocalDate(d || new Date()); n.setHours(23,59,59,999); return n; }

export function addCalendarMonthsLocal(d, months) {
  const date = toLocalDate(d || new Date());
  const day = date.getDate(), m = date.getMonth(), y = date.getFullYear();
  const target = new Date(Date.UTC(y, m + months, 1));
  const daysInTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, daysInTarget));
  return toLocalDate(target);
}

/** Try to infer the number of months from a human label. */
export function monthsFromLabel(label = "") {
  const s = String(label).trim();

  // Exact common labels
  if (/^monthly$/i.test(s)) return 1;
  if (/^yearly$/i.test(s) || /^annual$/i.test(s) || /^annually$/i.test(s)) return 12;

  // "3-Month", "6 Month", "12 Months", etc.
  const m = s.match(/^(\d+)\s*[- ]?\s*(month|months)$/i);
  if (m) return Math.max(1, parseInt(m[1], 10));

  // Quarter/half year style
  if (/^quarter(ly)?$/i.test(s)) return 3;
  if (/^semi[- ]?annual(ly)?$/i.test(s) || /^half[- ]?year$/i.test(s)) return 6;

  // Fallback: treat unknown as 1 month to be safe
  return 1;
}

/**
 * Compute membership expiry using calendar-month rules.
 * Prefer passing `months` if your DB has it; else pass `durationLabel`.
 * Returns a local Date at 23:59:59.999 of the final valid day.
 */
export function computeMembershipExpiry({ startDate, durationLabel, months } = {}) {
  const start = toLocalDate(startDate || new Date());
  const termMonths = months != null ? Number(months) : monthsFromLabel(durationLabel);
  const nextAnchor = addCalendarMonthsLocal(start, termMonths);
  // Valid THROUGH the day before the next cycle anchor
  const lastValid = new Date(nextAnchor.getFullYear(), nextAnchor.getMonth(), nextAnchor.getDate() - 1);
  return endOfDayLocal(lastValid);
}

const GUEST_PASS_DAYS = { "1-Day": 1, "3-Day": 3, "7-Day": 7 };
export function computeGuestPassExpiry({ startDate, durationDays, durationLabel } = {}) {
  const start = startOfDayLocal(startDate || new Date());
  const days = durationDays ?? GUEST_PASS_DAYS[durationLabel] ?? 1;
  const last = new Date(start); last.setDate(last.getDate() + days - 1);
  return endOfDayLocal(last);
}