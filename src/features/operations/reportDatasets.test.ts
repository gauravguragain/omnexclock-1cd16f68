import { beforeEach, describe, expect, it, vi } from "vitest";
import { sydneyReportRange } from "@/lib/sydneyReportRange";

const { from, queries, records } = vi.hoisted(() => ({
  from: vi.fn(), queries: [] as { field: string; op: string; value: string }[],
  records: [] as Record<string, any>[],
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
import { DATASETS, type Ctx } from "./reportDatasets";

beforeEach(() => {
  queries.length = 0; records.length = 0;
  from.mockImplementation(() => {
    const query: any = {
      select: () => query, eq: (field: string, value: string) => { queries.push({ field, value, op: "eq" }); return query; },
      gte: (field: string, value: string) => { queries.push({ field, value, op: "gte" }); return query; },
      lt: (field: string, value: string) => { queries.push({ field, value, op: "lt" }); return query; },
      order: () => query,
      range: async () => ({ error: null, data: records.filter(row => queries.every(q =>
        q.op === "eq" ? row[q.field] === q.value : q.op === "gte" ? row[q.field] >= q.value : row[q.field] < q.value)) }),
    };
    return query;
  });
});

async function load() {
  const dataset = DATASETS.find(d => d.key === "bookings_made");
  if (!dataset) throw new Error("Missing bookings-made report");
  return dataset.load({ bid: "business-a", range: { from: "2026-11-01", to: "2026-11-06" }, ops: null, employees: async () => [] } satisfies Ctx);
}

describe("Bookings made report", () => {
  it("includes future events and caterings created in the selected period, without an event-year cap", async () => {
    records.push(
      { id: "event", business_id: "business-a", created_at: "2026-11-02T01:00:00.000Z", event_date: "2028-06-01", booking_kind: "event" },
      { id: "catering", business_id: "business-a", created_at: "2026-11-05T01:00:00.000Z", event_date: "2027-04-01", booking_kind: "catering" },
    );
    expect((await load()).map(r => [r.id, r.kind, r.event_date])).toEqual([["event", "Event", "2028-06-01"], ["catering", "Catering", "2027-04-01"]]);
  });
  it("excludes bookings created outside the period even when their event date is inside", async () => {
    records.push({ id: "old", business_id: "business-a", created_at: "2026-10-01T00:00:00.000Z", event_date: "2026-11-04" });
    expect(await load()).toEqual([]);
  });
  it("includes both Sydney boundary days and excludes the next midnight and other businesses", async () => {
    for (const [id, created_at, business_id] of [
      ["start", "2026-10-31T13:00:00.000Z", "business-a"],
      ["end", "2026-11-06T12:59:59.999Z", "business-a"],
      ["next", "2026-11-06T13:00:00.000Z", "business-a"],
      ["other", "2026-11-03T01:00:00.000Z", "business-b"],
    ]) records.push({ id, created_at, business_id });
    expect((await load()).map(r => r.id)).toEqual(["start", "end"]);
  });
  it("uses Sydney standard time in winter", () => {
    expect(sydneyReportRange({ from: "2026-06-01", to: "2026-06-01" })).toEqual({ from: "2026-05-31T14:00:00.000Z", toExclusive: "2026-06-01T14:00:00.000Z" });
  });
  it("includes the entire 23-hour daylight-saving transition day", () => {
    expect(sydneyReportRange({ from: "2026-10-04", to: "2026-10-04" })).toEqual({ from: "2026-10-03T14:00:00.000Z", toExclusive: "2026-10-04T13:00:00.000Z" });
  });
  it("includes the entire 25-hour daylight-saving transition day", () => {
    expect(sydneyReportRange({ from: "2026-04-05", to: "2026-04-05" })).toEqual({ from: "2026-04-04T13:00:00.000Z", toExclusive: "2026-04-05T14:00:00.000Z" });
  });
  it("rejects an inverted selection", () => {
    expect(() => sydneyReportRange({ from: "2026-11-06", to: "2026-11-01" })).toThrow("start date");
  });
});