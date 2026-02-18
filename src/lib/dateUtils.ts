/**
 * Australia/Sydney timezone utilities for consistent date/time handling across the app.
 */

export const TIMEZONE = "Australia/Sydney";

/** Get current date/time in Australia/Sydney as a formatted YYYY-MM-DD string */
export function ausToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

/** Format a Date to YYYY-MM-DD in Australia/Sydney timezone */
export function toAusDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TIMEZONE }); // en-CA gives YYYY-MM-DD
}

/** Format a Date to DD/MM/YYYY in Australia/Sydney timezone */
export function toAusDisplayDate(d: Date): string {
  return d.toLocaleDateString("en-AU", { timeZone: TIMEZONE });
}

/** Format a Date with specific options in Australia/Sydney timezone */
export function toAusFormatted(d: Date, options: Intl.DateTimeFormatOptions): string {
  return d.toLocaleDateString("en-AU", { timeZone: TIMEZONE, ...options });
}

/** Format a Date to HH:MM (24h) in Australia/Sydney timezone */
export function toAusTime24(d: Date): string {
  return d.toLocaleTimeString("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Format a Date to hh:mm am/pm in Australia/Sydney timezone */
export function toAusTime12(d: Date): string {
  return d.toLocaleTimeString("en-AU", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: true });
}

/** Format a Date to hh:mm:ss am/pm in Australia/Sydney timezone */
export function toAusTime12WithSeconds(d: Date): string {
  return d.toLocaleTimeString("en-AU", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}

/** Get the current hour in Australia/Sydney timezone */
export function ausCurrentHour(): number {
  const hourStr = new Date().toLocaleTimeString("en-GB", { timeZone: TIMEZONE, hour: "2-digit", hour12: false });
  return parseInt(hourStr);
}

/** Build an ISO timestamp from a YYYY-MM-DD date and HH:MM time, interpreted in Australia/Sydney.
 *  Computes the correct AEST/AEDT offset for that specific date/time. */
export function buildAusTimestamp(dateStr: string, timeStr: string): string {
  const naive = new Date(`${dateStr}T${timeStr}:00`);
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: TIMEZONE,
    timeZoneName: "shortOffset",
  });
  const parts = formatter.formatToParts(naive);
  const tzPart = parts.find(p => p.type === "timeZoneName")?.value || "+11";
  const offsetMatch = tzPart.match(/GMT([+-]?\d+)(?::(\d+))?/);
  let offsetStr = "+10:00"; // fallback AEST
  if (offsetMatch) {
    const hrs = parseInt(offsetMatch[1]);
    const mins = offsetMatch[2] ? parseInt(offsetMatch[2]) : 0;
    const sign = hrs >= 0 ? "+" : "-";
    offsetStr = `${sign}${String(Math.abs(hrs)).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }
  return `${dateStr}T${timeStr}:00${offsetStr}`;
}

/** Get start of today (00:00:00) in Australia/Sydney as an ISO string */
export function ausStartOfToday(): string {
  const todayStr = ausToday();
  return buildAusTimestamp(todayStr, "00:00");
}

/** Get start of tomorrow (00:00:00) in Australia/Sydney as an ISO string */
export function ausStartOfTomorrow(): string {
  const today = new Date();
  const todayStr = ausToday();
  // Parse today and add 1 day
  const [y, m, d] = todayStr.split("-").map(Number);
  const tomorrow = new Date(y, m - 1, d + 1);
  const tomorrowStr = toAusDate(tomorrow);
  return buildAusTimestamp(tomorrowStr, "00:00");
}

/** Convert a Date to YYYY-MM-DD using Australia/Sydney timezone (for date-key grouping) */
export function toAusDateKey(d: Date): string {
  return toAusDate(d);
}

/** Get current Australia/Sydney Date object (with correct local year/month/day).
 *  Useful for date-fns startOfWeek / endOfWeek which need a Date input. */
export function ausNow(): Date {
  // Returns a Date whose local Y/M/D matches the current Aus Y/M/D
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value || "0";
  return new Date(
    parseInt(get("year")),
    parseInt(get("month")) - 1,
    parseInt(get("day")),
    parseInt(get("hour")),
    parseInt(get("minute")),
    parseInt(get("second")),
  );
}

/** Build an ISO timestamp for the START of a given YYYY-MM-DD in Australia/Sydney */
export function ausStartOfDay(dateStr: string): string {
  return buildAusTimestamp(dateStr, "00:00");
}

/** Build an ISO timestamp for the END of a given YYYY-MM-DD in Australia/Sydney (23:59:59) */
export function ausEndOfDay(dateStr: string): string {
  return `${dateStr}T23:59:59${getAusOffset(dateStr)}`;
}

/** Get Australia/Sydney UTC offset string for a given date (e.g. "+11:00" or "+10:00") */
function getAusOffset(dateStr: string): string {
  const naive = new Date(`${dateStr}T12:00:00`);
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: TIMEZONE,
    timeZoneName: "shortOffset",
  });
  const parts = formatter.formatToParts(naive);
  const tzPart = parts.find(p => p.type === "timeZoneName")?.value || "+11";
  const offsetMatch = tzPart.match(/GMT([+-]?\d+)(?::(\d+))?/);
  if (offsetMatch) {
    const hrs = parseInt(offsetMatch[1]);
    const mins = offsetMatch[2] ? parseInt(offsetMatch[2]) : 0;
    const sign = hrs >= 0 ? "+" : "-";
    return `${sign}${String(Math.abs(hrs)).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }
  return "+10:00";
}

/** Format a Date to a locale string in Australia/Sydney timezone */
export function toAusLocaleString(d: Date, options: Intl.DateTimeFormatOptions): string {
  return d.toLocaleString("en-AU", { timeZone: TIMEZONE, ...options });
}

/** Convert a time string (HH:MM 24h or "hh:mm am/pm") to 12-hour format.
 *  If already in 12h format (contains am/pm), returns as-is. */
export function ensureTime12(timeStr: string): string {
  if (!timeStr) return timeStr;
  // Already 12h format
  if (/[ap]m/i.test(timeStr)) return timeStr.toLowerCase();
  // Parse HH:MM
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return timeStr;
  let h = parseInt(match[1]);
  const m = match[2];
  const ampm = h >= 12 ? "pm" : "am";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ampm}`;
}
