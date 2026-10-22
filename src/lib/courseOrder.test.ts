import { describe, it, expect } from "vitest";
import { sortCourses } from "@/features/events/RunsheetViewPage";

describe("run sheet course order", () => {
  it("orders entrées, mains, sides, desserts, kids menu last", () => {
    const order = sortCourses([["Mains", 1], ["Sides", 1], ["Desserts", 1], ["Kids Menu", 1], ["Entrées", 1]]).map(([c]) => c);
    expect(order).toEqual(["Entrées", "Mains", "Sides", "Desserts", "Kids Menu"]);
  });
});
