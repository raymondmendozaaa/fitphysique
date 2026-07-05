import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const APP_TIMEZONE = 'America/Chicago';

export function isValidDateInput(dateString) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateString);
}

export function dateInputToSafeDate(dateString) {
  if (!isValidDateInput(dateString)) return null;

  const [year, month, day] = dateString.split('-').map(Number);

  // Use UTC noon so formatting into America/Chicago stays on the same calendar day.
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

export function toValidDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string' && isValidDateInput(value)) {
    return dateInputToSafeDate(value);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Converts a YYYY-MM-DD date input into the UTC ISO string
 * representing the start of that day in the provided timezone.
 */
export function getStartOfDayUtcIso(dateString, timeZone = APP_TIMEZONE) {
  if (!dateString || !isValidDateInput(dateString)) return null;

  const utcDate = fromZonedTime(`${dateString}T00:00:00.000`, timeZone);
  return utcDate.toISOString();
}

/**
 * Converts a YYYY-MM-DD date input into the UTC ISO string
 * representing the start of the NEXT day in the provided timezone.
 */
export function getStartOfNextDayUtcIso(dateString, timeZone = APP_TIMEZONE) {
  if (!dateString || !isValidDateInput(dateString)) return null;

  const [year, month, day] = dateString.split('-').map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDayDateString = formatInTimeZone(nextDay, 'UTC', 'yyyy-MM-dd');

  const utcDate = fromZonedTime(`${nextDayDateString}T00:00:00.000`, timeZone);
  return utcDate.toISOString();
}

export function formatAdminDateTime(value, timeZone = APP_TIMEZONE) {
  const date = toValidDate(value);
  if (!date) return value ?? '—';

  return formatInTimeZone(date, timeZone, 'MM/dd/yyyy, hh:mm:ss a zzz');
}

export function getTodayDateInputValue(timeZone = APP_TIMEZONE) {
  return formatInTimeZone(new Date(), timeZone, 'yyyy-MM-dd');
}

export function formatAdminDate(value, timeZone = APP_TIMEZONE) {
  const date = toValidDate(value);
  if (!date) return value ?? '—';

  return formatInTimeZone(date, timeZone, 'MM/dd/yyyy');
}

export function formatAdminTime(value, timeZone = APP_TIMEZONE) {
  const date = toValidDate(value);
  if (!date) return value ?? '—';

  return formatInTimeZone(date, timeZone, 'hh:mm:ss a zzz');
}

export function formatDateInTimeZone(value, timeZone = APP_TIMEZONE) {
  const date = toValidDate(value);
  if (!date) return value ?? '—';

  return formatInTimeZone(date, timeZone, 'MMMM d, yyyy');
}

export function formatDateTimeInTimeZone(value, timeZone = APP_TIMEZONE) {
  const date = toValidDate(value);
  if (!date) return value ?? '—';

  return formatInTimeZone(date, timeZone, 'MMMM d, yyyy, hh:mm a zzz');
}

export function getNowUtcIso() {
  return new Date().toISOString();
}

export function toUtcIso(value) {
  const date = toValidDate(value);
  if (!date) return null;

  return date.toISOString();
}

export function getDateInputFromValue(value, timeZone = APP_TIMEZONE) {
  const date = toValidDate(value);
  if (!date) return '';

  return formatInTimeZone(date, timeZone, 'yyyy-MM-dd');
}

export function getEndOfDayUtcIso(dateString, timeZone = APP_TIMEZONE) {
  const nextDayStartIso = getStartOfNextDayUtcIso(dateString, timeZone);
  if (!nextDayStartIso) return null;

  return new Date(new Date(nextDayStartIso).getTime() - 1).toISOString();
}

export function toAdminDateInputValue(value, timeZone = APP_TIMEZONE) {
  const date = toValidDate(value);
  if (!date) return '';

  return formatInTimeZone(date, timeZone, 'yyyy-MM-dd');
}

export function toAdminDateTimeInputValue(value, timeZone = APP_TIMEZONE) {
  const date = toValidDate(value);
  if (!date) return '';

  return formatInTimeZone(date, timeZone, "yyyy-MM-dd'T'HH:mm");
}

export function addDaysToDateInput(dateString, days) {
  if (!dateString || !isValidDateInput(dateString)) return '';

  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getUTCDate()).padStart(2, '0');

  return `${nextYear}-${nextMonth}-${nextDay}`;
}

export function addDaysToUtcIso(value, days) {
  const date = toValidDate(value);
  const dayCount = Number(days);

  if (!date || !Number.isFinite(dayCount)) return null;

  return new Date(
    date.getTime() + dayCount * 24 * 60 * 60 * 1000
  ).toISOString();
}