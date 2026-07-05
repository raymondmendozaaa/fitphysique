// lib/time/expiry.js
import {
  APP_TIMEZONE,
  getDateInputFromValue,
  getEndOfDayUtcIso,
  addDaysToDateInput,
  getNowUtcIso,
} from "@/lib/utils/dateTime";

export function monthsFromLabel(label = "") {
  const s = String(label).trim();

  if (/^monthly$/i.test(s)) return 1;
  if (/^yearly$/i.test(s) || /^annual$/i.test(s) || /^annually$/i.test(s)) {
    return 12;
  }

  const m = s.match(/^(\d+)\s*[- ]?\s*(month|months)$/i);
  if (m) return Math.max(1, parseInt(m[1], 10));

  if (/^quarter(ly)?$/i.test(s)) return 3;
  if (/^semi[- ]?annual(ly)?$/i.test(s) || /^half[- ]?year$/i.test(s)) {
    return 6;
  }

  return 1;
}

export function addCalendarMonthsDateInput(dateString, months) {
  if (!dateString) return "";

  const [year, month, day] = dateString.split("-").map(Number);

  const target = new Date(Date.UTC(year, month - 1 + Number(months), 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth();

  const daysInTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0)
  ).getUTCDate();

  const safeDay = Math.min(day, daysInTargetMonth);

  return [
    targetYear,
    String(targetMonth + 1).padStart(2, "0"),
    String(safeDay).padStart(2, "0"),
  ].join("-");
}

export function computeMembershipExpiry({
  startDate,
  durationLabel,
  months,
  timeZone = APP_TIMEZONE,
} = {}) {
  const startYMD = getDateInputFromValue(startDate || getNowUtcIso(), timeZone);
  const rawMonths =
    months != null ? Number(months) : monthsFromLabel(durationLabel);

  const termMonths =
    Number.isFinite(rawMonths) && rawMonths > 0 ? rawMonths : 1;

  const nextAnchorYMD = addCalendarMonthsDateInput(startYMD, termMonths);
  const lastValidYMD = addDaysToDateInput(nextAnchorYMD, -1);

  const expiryIso = getEndOfDayUtcIso(lastValidYMD, timeZone);
  return expiryIso ? new Date(expiryIso) : null;
}

export function computeGuestPassExpiry({
  startDate,
  durationDays,
  timeZone = APP_TIMEZONE,
} = {}) {
  const startYMD = getDateInputFromValue(startDate || getNowUtcIso(), timeZone);

  const rawDays = Number(durationDays || 1);
  const days = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 1;

  const lastValidYMD = addDaysToDateInput(startYMD, days - 1);
  const expiryIso = getEndOfDayUtcIso(lastValidYMD, timeZone);

  return expiryIso ? new Date(expiryIso) : null;
}