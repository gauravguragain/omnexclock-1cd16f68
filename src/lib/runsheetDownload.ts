import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function downloadRunsheetPdf(el: HTMLElement, fileName: string, print = false) {
  const printWindow = print ? window.open("", "_blank") : null;
  if (print && !printWindow) throw new Error("Allow popups to print the run sheet");
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
    fitRunsheetColumns(copy);
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
        const avail = y ? pageHpx - marginPx * 2 : pageHpx;
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
    if (printWindow) {
      pdf.autoPrint();
      const url = URL.createObjectURL(pdf.output("blob"));
      printWindow.opener = null;
      printWindow.location.replace(url);
      setTimeout(() => URL.revokeObjectURL(url), 300_000);
    } else pdf.save(`${fileName.replace(/[^\w\- ]+/g, "").trim() || "Run sheet"}.pdf`);
  } catch (error) {
    printWindow?.close();
    throw error;
  } finally {
    copy.remove();
  }
}

// Measure actual wrapped content separately; never move sections between columns.
// offset/scroll dimensions are unaffected by the phone preview's transform.
export function fitRunsheetColumns(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("[data-runsheet-menu], [data-runsheet-details]").forEach(column => {
    const content = column.firstElementChild;
    if (!(content instanceof HTMLElement) || column.clientHeight <= 0) return;
    const fits = (size: number) => {
      column.style.setProperty("--runsheet-column-font", `${size}px`);
      return content.scrollHeight <= column.clientHeight - 2 && content.scrollWidth <= column.clientWidth;
    };
    if (fits(11)) return;
    let low = 0.1, high = 11;
    for (let i = 0; i < 16; i++) {
      const mid = (low + high) / 2;
      if (fits(mid)) low = mid; else high = mid;
    }
    fits(low);
  });
}
