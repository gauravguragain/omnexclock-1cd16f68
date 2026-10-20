import { describe, expect, it } from "vitest";
import { isEmailedRunsheet, isLinkedRunsheet } from "./rosterRunsheet";

describe("roster run-sheet eligibility", () => {
  it("excludes a generated or issued sheet that has never been emailed", () => {
    expect(isEmailedRunsheet({ emailed_at: null, emailed_to: [] })).toBe(false);
  });
  it("includes a successful email to any recipient", () => {
    expect(isEmailedRunsheet({ emailed_at: "2026-10-20T23:45:00Z", emailed_to: ["staff@example.test"] })).toBe(true);
    expect(isEmailedRunsheet({ emailed_at: null, emailed_to: ["client@example.test"] })).toBe(true);
  });
  it("identifies source-linked setup separately from manually entered setup", () => {
    expect(isLinkedRunsheet({ crm_runsheet_id: "sheet-1" })).toBe(true);
    expect(isLinkedRunsheet({ crm_runsheet_id: null })).toBe(false);
  });
});