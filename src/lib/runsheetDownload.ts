import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function downloadRunsheetPdf(el: HTMLElement, fileName: string) {
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: getComputedStyle(el.firstElementChild || el).backgroundColor });
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
  const margin = 6, w = pw - margin * 2;
  const pageHpx = ((ph - margin * 2) * canvas.width) / w;
  let y = 0, first = true;
  while (y < canvas.height) {
    const h = Math.min(pageHpx, canvas.height - y);
    const slice = document.createElement("canvas");
    slice.width = canvas.width; slice.height = h;
    slice.getContext("2d")!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (!first) pdf.addPage();
    pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, w, (h * w) / canvas.width);
    y += h; first = false;
  }
  pdf.save(`${fileName.replace(/[^\w\- ]+/g, "").trim() || "Run sheet"}.pdf`);
}
