import type { Range } from "@/lib/operationsData";

/** Convert Sydney calendar midnight to UTC, including both daylight-saving transitions. */
function midnightUtc(day: string): string {
  const target = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(target)) throw new Error("Select valid report dates.");
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  let utc = target;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(utc)).map(p => [p.type, p.value]));
    const local = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    utc += target - local;
  }
  return new Date(utc).toISOString();
}

export function sydneyReportRange(range: Range) {
  if (range.from > range.to) throw new Error("The report start date must be on or before the end date.");
  const next = new Date(`${range.to}T12:00:00Z`);
  if (!Number.isFinite(next.getTime())) throw new Error("Select valid report dates.");
  next.setUTCDate(next.getUTCDate() + 1);
  return { from: midnightUtc(range.from), toExclusive: midnightUtc(next.toISOString().slice(0, 10)) };
}