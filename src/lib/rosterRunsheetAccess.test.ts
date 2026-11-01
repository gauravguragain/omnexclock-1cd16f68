import { describe, expect, it } from "vitest";
import { canViewRosterRunsheet } from "../../supabase/functions/_shared/rosterRunsheetAccess";

describe("roster run sheet authorization", () => {
  it("allows the global master account", () => {
    expect(canViewRosterRunsheet([{ role: "master", business_id: null }], "business-a")).toBe(true);
    expect(canViewRosterRunsheet([{ role: "master", business_id: "business-b" }], "business-a")).toBe(false);
  });
  it("allows roster users only in their own business", () => {
    expect(canViewRosterRunsheet([{ role: "roster_admin", business_id: "business-a" }], "business-a")).toBe(true);
    expect(canViewRosterRunsheet([{ role: "roster_admin", business_id: "business-b" }], "business-a")).toBe(false);
  });
  it("denies callers with no role or staff-only access", () => {
    expect(canViewRosterRunsheet([], "business-a")).toBe(false);
    expect(canViewRosterRunsheet([{ role: "user", business_id: "business-a" }], "business-a")).toBe(false);
  });
});