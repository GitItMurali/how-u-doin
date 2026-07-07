/**
 * lib/date.ts
 * Phase 7b — consolidated date/time formatting utilities (the audit's
 * D-consolidation). One home for the helpers that were scattered across
 * hooks/useDailyReset.ts and components/FocusTaskCard.tsx.
 *
 * B2 DECISION (closed with Phase 7b): day keys are CALENDAR dates in the
 * device's local timezone, always via getCurrentDateString(). reset_time only
 * governs when notifications/sessions are cleaned up — it does NOT shift the
 * date a row is keyed under.
 */

// Canonical local-timezone 'YYYY-MM-DD' — re-exported so screens can import
// everything date-ish from one place.
export { getCurrentDateString } from '@/db/tasks';

/** Local-timezone date string for `days` days ago (same format as getCurrentDateString). */
export function dateStringDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** 'YYYY-MM-DD' ± delta days (Date handles month/year rollover). */
export function addDaysToDateString(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const date = new Date(y, m - 1, d + delta);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Seconds -> "M:SS" (or "H:MM:SS" past an hour). Moved from FocusTaskCard. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/**
 * Seconds -> compact human duration for totals: "3h 20m" / "45m" / "30s".
 * Sub-minute totals show seconds so a 5s test session doesn't read "0m".
 */
export function formatHoursMinutes(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** 'YYYY-MM-DD' -> "Wednesday, 1 Jul" (History day headers). */
export function formatDayHeading(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

/** 24h clock -> "6:30 AM" (Settings / day-start displays). */
export function formatTime12h(hour: number, minute: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/** Unix ms -> "9:41 AM" (session log start times). */
export function formatTimeOfDay(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}
