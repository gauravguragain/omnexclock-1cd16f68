import { describe, expect, it } from "vitest";
import { isEmailedRunsheet, isLinkedRunsheet, estimateRosterTables, rosterForecastContext } from "./rosterRunsheet";

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
  it("estimates seating with eight chairs by default and respects configured capacity", () => {
    expect(estimateRosterTables(90, 34)).toBe(16);
    expect(estimateRosterTables(90, 34, 10)).toBe(13);
    expect(estimateRosterTables(0, 0)).toBe(0);
  });
  it("passes current serving times and team instructions without client signing data", () => {
    const context = rosterForecastContext({ ops_notes: "Extra buffet setup", setup_items: ["Red Carpet"], client_token: "private", staff_signature: "private" },
      { allergies: "Nuts" }, [{ course: "Entrées", item_name: "Dish A", service_start_time: "19:00", service_end_time: "19:15" }]);
    expect(context.kitchen_notes).toBe("Extra buffet setup");
    expect(context.setup_items).toEqual(["Red Carpet"]);
    expect(context.menu[0].service_start_time).toBe("19:00");
    expect(context.allergies).toBe("Nuts");
    expect(context).not.toHaveProperty("client_token");
    expect(context).not.toHaveProperty("staff_signature");
  });
});