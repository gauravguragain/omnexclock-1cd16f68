import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function downloadRunsheetPdf(el: HTMLElement, fileName: string) {
  // Capture an unscaled A4 copy, even when the preview is scaled down on a phone.
  const copy = el.cloneNode(true) as HTMLElement;
  copy.style.transform = "none";
  copy.style.position = "fixed";
  copy.style.left = "-10000px";
  copy.style.top = "0";
  copy.style.height = "auto";
  document.body.appendChild(copy);
  try {
    await Promise.all(Array.from(copy.querySelectorAll("img")).map(img => img.decode().catch(() => undefined)));
    paginateFlow(copy);
    const top = copy.getBoundingClientRect().top;
    const breaks = Array.from(copy.querySelectorAll<HTMLElement>("[data-pdf-break]")).map(b => Math.round((b.getBoundingClientRect().top - top) * 2)).filter(v => v > 0);
    // Lines of text/images a page cut must never pass through.
    const blocks = Array.from(copy.querySelectorAll<HTMLElement>("p, h1, h2, h3, img, span.block"))
      .map(n => { const r = n.getBoundingClientRect(); return [Math.floor((r.top - top) * 2), Math.ceil((r.bottom - top) * 2)] as const; })
      .filter(([a, b]) => b > a);
    const safeCut = (from: number, limit: number) => {
      const ok = (c: number) => !blocks.some(([a, b]) => a < c && c < b);
      if (ok(limit)) return limit;
      const cands = Array.from(new Set(blocks.map(([, b]) => b + 6))).filter(c => c > from + (limit - from) * 0.4 && c <= limit).sort((a, b) => b - a);
      return cands.find(ok) ?? limit;
    };
    const canvas = await html2canvas(copy, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
     const pageHpx = (ph * canvas.width) / pw;
     // A4 CSS dimensions are rounded to pixels. A sub-pixel overflow must not
     // produce a second, blank PDF page for an otherwise single-page sheet.
     const roundingTolerance = Math.max(4, canvas.width * 0.003);
    let y = 0;
    while (y < canvas.height) {
       const remaining = canvas.height - y;
       // Continuation pages get a 10mm top margin and 10mm bottom margin.
       const marginPx = (10 * canvas.width) / pw;
       const avail = y ? pageHpx - marginPx * 2 : pageHpx - marginPx;
       let h = remaining <= avail + roundingTolerance ? remaining : safeCut(y, y + Math.floor(avail)) - y;
       // Start forced sections (e.g. Terms & Conditions) on a fresh page.
       const forced = breaks.find(b => b > y + 4 && b < y + h);
       if (forced) h = forced - y;
      const slice = document.createElement("canvas");
      slice.width = canvas.width; slice.height = h;
      const context = slice.getContext("2d");
      if (!context) throw new Error("Could not create run sheet image");
      context.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (y) pdf.addPage();
       const offset = y ? 10 : 0;
       pdf.addImage(slice.toDataURL("image/jpeg", 0.94), "JPEG", 0, offset, pw, Math.min(ph - offset, (h * pw) / canvas.width));
      y += h;
    }
    pdf.save(`${fileName.replace(/[^\w\- ]+/g, "").trim() || "Run sheet"}.pdf`);
  } finally {
    copy.remove();
  }
}

// Split the newspaper-style agenda into A4 pages: fill the left column, then the
// right column, and only then continue on a new page (each page starts cleanly).
function paginateFlow(root: HTMLElement) {
  const flow = root.querySelector<HTMLElement>("[data-runsheet-flow]");
  if (!flow) return;
  const pxPerMm = root.getBoundingClientRect().width / 210;
  const pageH = 297 * pxPerMm, margin = 10 * pxPerMm, pad = 16, safety = 24;
  const blocks = Array.from(flow.children) as HTMLElement[];
  const heights = blocks.map(b => b.getBoundingClientRect().height);
  const flowTop = flow.getBoundingClientRect().top - root.getBoundingClientRect().top;
  let avail = pageH - margin - flowTop - pad * 2 - safety;
  const pages: HTMLElement[][][] = [[[], []]];
  let col = 0, used = 0;
  blocks.forEach((b, i) => {
    const h = heights[i];
    if (used > 0 && used + h > avail) {
      if (col === 0) { col = 1; used = 0; }
      else { pages.push([[], []]); col = 0; used = 0; avail = pageH - margin * 2 - pad * 2 - safety; }
    }
    pages[pages.length - 1][col].push(b); used += h;
  });
  const cls = flow.className.replace(/\bcolumns-2\b/, "").replace(/\[column-rule[^\s]*\]/, "");
  const frag = document.createDocumentFragment();
  pages.forEach(([left, right], p) => {
    const page = document.createElement("div");
    page.className = `${cls} grid grid-cols-2`;
    if (p > 0) { page.setAttribute("data-pdf-break", ""); page.style.borderTop = "1px solid hsl(var(--border))"; }
    [left, right].forEach((items, c) => {
      const column = document.createElement("div");
      column.style.minWidth = "0";
      column.style.padding = c === 0 ? "0 16px 0 0" : "0 0 0 16px";
      if (c === 0) column.style.borderRight = "1px solid hsl(var(--border))";
      items.forEach(it => column.appendChild(it));
      page.appendChild(column);
    });
    frag.appendChild(page);
  });
  flow.replaceWith(frag);
}
