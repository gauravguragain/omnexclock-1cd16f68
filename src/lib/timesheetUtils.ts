/**
 * Shared timesheet computation utility.
 * Single source of truth for computing hours from clock_events,
 * matching exactly what the Timesheets page shows.
 *
 * Overnight shifts are kept as a SINGLE entry on the clock-in day and
 * tagged with `crossed_midnight = true` so reports show them on one row
 * while still computing total + break duration across the day boundary.
 */
import { toAusDate } from "@/lib/dateUtils";

export interface ComputedTimesheetEntry {
  employee_id: string;
  date: string; // YYYY-MM-DD in AUS timezone (clock_in day for sessions)
  clock_in: Date | null;
  clock_out: Date | null;
  break_start: Date | null;
  break_end: Date | null;
  break_minutes: number;
  total_hours: number;
  net_hours: number;
  crossed_midnight: boolean;
}

interface Session {
  employee_id: string;
  date: string;
  clock_in: Date | null;
  clock_out: Date | null;
  first_break_start: Date | null;
  last_break_end: Date | null;
  current_break_start: Date | null;
  break_minutes: number;
}

const newSession = (employee_id: string, date: string): Session => ({
  employee_id,
  date,
  clock_in: null,
  clock_out: null,
  first_break_start: null,
  last_break_end: null,
  current_break_start: null,
  break_minutes: 0,
});

/**
 * Walks clock_events in chronological order per employee and groups them
 * into sessions delimited by clock_in / clock_out. Handles overnight
 * shifts naturally: a clock_in at 10pm and clock_out at 2am next day is
 * ONE session on the clock-in date.
 */
export function computeTimesheetEntries(events: any[]): ComputedTimesheetEntry[] {
  // Group events by employee, then sort by timestamp ascending
  const byEmp = new Map<string, any[]>();
  for (const ev of events) {
    if (!byEmp.has(ev.employee_id)) byEmp.set(ev.employee_id, []);
    byEmp.get(ev.employee_id)!.push(ev);
  }

  const sessions: Session[] = [];

  for (const [empId, list] of byEmp) {
    list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let open: Session | null = null;
    // per-day buckets for orphan events (no clock_in/clock_out pairing)
    const orphans = new Map<string, Session>();
    const getOrphan = (date: string) => {
      if (!orphans.has(date)) orphans.set(date, newSession(empId, date));
      return orphans.get(date)!;
    };

    for (const ev of list) {
      const time = new Date(ev.timestamp);
      const evDate = toAusDate(time);

      switch (ev.event_type) {
        case "clock_in": {
          // close any previously open session (no clock_out) as-is
          if (open) sessions.push(open);
          open = newSession(empId, evDate);
          open.clock_in = time;
          break;
        }
        case "clock_out": {
          if (open) {
            open.clock_out = time;
            // close any open break that may have crossed
            if (open.current_break_start) {
              open.break_minutes += (time.getTime() - open.current_break_start.getTime()) / 60000;
              open.last_break_end = time;
              open.current_break_start = null;
            }
            sessions.push(open);
            open = null;
          } else {
            // orphan clock_out — bucket on its own date
            const o = getOrphan(evDate);
            if (!o.clock_out || time > o.clock_out) o.clock_out = time;
          }
          break;
        }
        case "break_start": {
          if (open) {
            open.current_break_start = time;
            if (!open.first_break_start) open.first_break_start = time;
          } else {
            const o = getOrphan(evDate);
            o.current_break_start = time;
            if (!o.first_break_start) o.first_break_start = time;
          }
          break;
        }
        case "break_end": {
          if (open && open.current_break_start) {
            open.break_minutes += (time.getTime() - open.current_break_start.getTime()) / 60000;
            open.last_break_end = time;
            open.current_break_start = null;
          } else {
            const o = getOrphan(evDate);
            if (o.current_break_start) {
              o.break_minutes += (time.getTime() - o.current_break_start.getTime()) / 60000;
              o.last_break_end = time;
              o.current_break_start = null;
            } else {
              o.last_break_end = time;
            }
          }
          break;
        }
      }
    }

    if (open) sessions.push(open); // in-progress shift
    for (const o of orphans.values()) sessions.push(o);
  }

  return sessions.map((e) => {
    let totalHours = 0;
    if (e.clock_in && e.clock_out) {
      totalHours = (e.clock_out.getTime() - e.clock_in.getTime()) / 3600000;
      if (totalHours < 0) totalHours += 24; // safety
    }
    const breakMins = Math.round(e.break_minutes);
    const netHours = Math.max(0, totalHours - breakMins / 60);
    const crossed =
      !!(e.clock_in && e.clock_out) && toAusDate(e.clock_in) !== toAusDate(e.clock_out);

    return {
      employee_id: e.employee_id,
      date: e.date,
      clock_in: e.clock_in,
      clock_out: e.clock_out,
      break_start: e.first_break_start,
      break_end: e.last_break_end,
      break_minutes: breakMins,
      total_hours: Math.round(totalHours * 100) / 100,
      net_hours: Math.round(netHours * 100) / 100,
      crossed_midnight: crossed,
    };
  });
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
