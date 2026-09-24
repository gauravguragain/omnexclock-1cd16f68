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
       const h = remaining <= pageHpx + roundingTolerance ? remaining : Math.floor(pageHpx);
      const slice = document.createElement("canvas");
      slice.width = canvas.width; slice.height = h;
      const context = slice.getContext("2d");
      if (!context) throw new Error("Could not create run sheet image");
      context.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (y) pdf.addPage();
       pdf.addImage(slice.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, pw, Math.min(ph, (h * pw) / canvas.width));
      y += h;
    }
    pdf.save(`${fileName.replace(/[^\w\- ]+/g, "").trim() || "Run sheet"}.pdf`);
  } finally {
    copy.remove();
  }
}
