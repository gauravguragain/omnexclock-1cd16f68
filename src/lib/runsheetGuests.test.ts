import { describe, expect, it } from "vitest";
import { runsheetGuests } from "./runsheetGuests";

describe("saved run-sheet guest counts", () => {
  it("uses edited catering counts instead of stale sheet counts", () => {
    expect(runsheetGuests({ adult_guests: 40, kids_guests: 5 }, { booking_kind: "catering", adults: 65, kids: 8 })).toEqual({ adults: 65, kids: 8 });
  });
  it("keeps an edited zero kids count", () => {
    expect(runsheetGuests({ kids_guests: 5 }, { booking_kind: "catering", adults: 65, kids: 0 }).kids).toBe(0);
  });
  it("preserves event run-sheet guest overrides", () => {
    expect(runsheetGuests({ adult_guests: 40, kids_guests: 5 }, { booking_kind: "event", adults: 65, kids: 8 })).toEqual({ adults: 40, kids: 5 });
  });
});