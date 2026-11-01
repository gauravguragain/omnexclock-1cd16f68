import { describe, expect, it, vi } from "vitest";
import { loadRosterRunsheet } from "./loadRosterRunsheet";

function client(result: Promise<any>) {
  const abortSignal = vi.fn(() => result);
  return { rpc: vi.fn(() => ({ abortSignal })), abortSignal };
}

describe("roster run sheet loading", () => {
  it("returns the current document including securely loaded beverages", async () => {
    const data = { rs: { id: "sheet-1" }, selection: { beverage_detail: { name: "Package A" } } };
    const db = client(Promise.resolve({ data, error: null }));
    expect(await loadRosterRunsheet(db, "event-1")).toEqual(data);
    expect(db.rpc).toHaveBeenCalledWith("get_roster_runsheet", { _event_id: "event-1" });
  });
  it("reports access denial rather than remaining in loading", async () => {
    await expect(loadRosterRunsheet(client(Promise.resolve({ error: { message: "Access denied" } })), "event-1")).rejects.toThrow("Access denied");
  });
  it("handles an empty response", async () => {
    await expect(loadRosterRunsheet(client(Promise.resolve({ data: null })), "event-1")).rejects.toThrow("unavailable");
  });
  it("handles a rejected network request", async () => {
    await expect(loadRosterRunsheet(client(Promise.reject(new Error("Network unavailable"))), "event-1")).rejects.toThrow("Network unavailable");
  });
  it("aborts a stalled request at the deadline", async () => {
    vi.useFakeTimers();
    try {
      const db = client(new Promise(() => {}));
      const result = loadRosterRunsheet(db, "event-1");
      const assertion = expect(result).rejects.toThrow("too long");
      await vi.advanceTimersByTimeAsync(15_000);
      await assertion;
      expect(db.abortSignal.mock.calls[0][0].aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});