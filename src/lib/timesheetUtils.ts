/**
 * Shared timesheet computation utility.
 * Single source of truth for computing hours from clock_events,
 * matching exactly what the Timesheets page shows.
 */
import { toAusDate } from "@/lib/dateUtils";

export interface ComputedTimesheetEntry {
  employee_id: string;
  date: string; // YYYY-MM-DD in AUS timezone
  clock_in: Date | null;
  clock_out: Date | null;
  break_start: Date | null;
  break_end: Date | null;
  break_minutes: number;
  total_hours: number;
  net_hours: number;
}

/**
 * Groups clock_events by employee+date (AUS timezone) and computes
 * total_hours, net_hours, break_minutes for each day.
 * Handles overnight shifts by adding 24h when clock_out < clock_in.
 * 
 * @param events - Array of clock_events with employee_id, event_type, timestamp
 * @returns Array of computed timesheet entries
 */
export function computeTimesheetEntries(events: any[]): ComputedTimesheetEntry[] {
  const dailyMap = new Map<string, {
    employee_id: string;
    date: string;
    clock_in: Date | null;
    clock_out: Date | null;
    first_break_start: Date | null;
    last_break_end: Date | null;
    current_break_start: Date | null;
    break_minutes: number;
  }>();

  for (const ev of events) {
    const evDate = new Date(ev.timestamp);
    const localDate = toAusDate(evDate);
    const key = `${ev.employee_id}-${localDate}`;

    if (!dailyMap.has(key)) {
      dailyMap.set(key, {
        employee_id: ev.employee_id,
        date: localDate,
        clock_in: null,
        clock_out: null,
        first_break_start: null,
        last_break_end: null,
        current_break_start: null,
        break_minutes: 0,
      });
    }

    const entry = dailyMap.get(key)!;
    const time = new Date(ev.timestamp);

    switch (ev.event_type) {
      case "clock_in":
        if (!entry.clock_in || time < entry.clock_in) {
          entry.clock_in = time;
        }
        break;
      case "clock_out":
        if (!entry.clock_out || time > entry.clock_out) {
          entry.clock_out = time;
        }
        break;
      case "break_start":
        entry.current_break_start = time;
        if (!entry.first_break_start) entry.first_break_start = time;
        break;
      case "break_end":
        if (entry.current_break_start) {
          entry.break_minutes += (time.getTime() - entry.current_break_start.getTime()) / 60000;
          entry.last_break_end = time;
          entry.current_break_start = null;
        }
        break;
    }
  }

  const results: ComputedTimesheetEntry[] = [];

  for (const e of dailyMap.values()) {
    let totalHours = 0;
    if (e.clock_in && e.clock_out) {
      totalHours = (e.clock_out.getTime() - e.clock_in.getTime()) / 3600000;
      // Handle overnight shifts: if result is negative, the shift crossed midnight
      if (totalHours < 0) totalHours += 24;
    }

    const breakMins = Math.round(e.break_minutes);
    const netHours = Math.max(0, totalHours - breakMins / 60);

    results.push({
      employee_id: e.employee_id,
      date: e.date,
      clock_in: e.clock_in,
      clock_out: e.clock_out,
      break_start: e.first_break_start,
      break_end: e.last_break_end,
      break_minutes: breakMins,
      total_hours: Math.round(totalHours * 100) / 100,
      net_hours: Math.round(netHours * 100) / 100,
    });
  }

  return results;
}

/**
 * Filters computed timesheet entries to only include approved ones.
 * @param entries - Computed timesheet entries
 * @param approvedSet - Set of "employee_id-YYYY-MM-DD" keys that are approved
 */
export function filterApprovedEntries(
  entries: ComputedTimesheetEntry[],
  approvedSet: Set<string>
): ComputedTimesheetEntry[] {
  return entries.filter((e) => approvedSet.has(`${e.employee_id}-${e.date}`));
}
