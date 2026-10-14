import { describe, expect, it } from "vitest";
import { fitRunsheetColumns } from "./runsheetDownload";

describe("run-sheet column fitting", () => {
  function column(root: HTMLElement, kind: string, density: number) {
    const el = document.createElement("div");
    el.setAttribute(`data-runsheet-${kind}`, "");
    const content = document.createElement("div");
    el.append(content);
    root.append(el);
    Object.defineProperties(el, { clientHeight: { value: 500 }, clientWidth: { value: 300 } });
    Object.defineProperties(content, {
      scrollHeight: { get: () => parseFloat(el.style.getPropertyValue("--runsheet-column-font")) * density },
      scrollWidth: { value: 300 },
    });
    return { el, content };
  }

  it("keeps compact 11px type when the column already fits", () => {
    const root = document.createElement("div");
    const menu = column(root, "menu", 20);
    fitRunsheetColumns(root);
    expect(menu.el.style.getPropertyValue("--runsheet-column-font")).toBe("11px");
  });

  it("fits each column independently into its available height", () => {
    const root = document.createElement("div");
    const menu = column(root, "menu", 100);
    const details = column(root, "details", 20);
    fitRunsheetColumns(root);
    expect(menu.content.scrollHeight).toBeLessThanOrEqual(498);
    expect(parseFloat(menu.el.style.getPropertyValue("--runsheet-column-font"))).toBeLessThan(5);
    expect(details.el.style.getPropertyValue("--runsheet-column-font")).toBe("11px");
  });
});