import jsPDF from "jspdf";

export type RunsheetScheduleLine = { time: string; label: string; detail?: string };

export type RunsheetPdfData = {
  businessName: string;
  businessPhone?: string | null;
  businessEmail?: string | null;
  logoUrl?: string | null;
  eventTitle: string;
  eventTypeLabel?: string | null;
  eventDateLabel: string;
  startTime: string;
  endTime: string;
  venueSpace: string;
  adultGuests: number;
  kidsGuests: number;
  clientName: string;
  clientPhone?: string | null;
  salesPerson?: string | null;
  salesPersonPhone?: string | null;
  eventCoordinator?: string | null;
  eventCoordinatorPhone?: string | null;
  onsiteContactName?: string | null;
  onsiteContactPhone?: string | null;
  eventOrderNumber?: string | null;
  bookingReference?: string | null;
  packageName?: string | null;
  schedule: RunsheetScheduleLine[];
  menuByCategory: { category: string; items: string[] }[];
  beveragePackage?: string | null;
  corkageNote?: string | null;
  liveStalls: { name: string; startTime?: string; endTime?: string }[];
  kidsMenuNote?: string | null;
  dietaryRequirements?: string | null;
  allergies?: string | null;
  specialRequests?: string | null;
  setupItems: string[];
  setupNotes?: string | null;
  accessTime?: string | null;
};

type PdfLine = { text: string; level: 0 | 1 | 2; bold?: boolean; color?: "alert"; bullet?: boolean };

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const LEFT = 10;
const RIGHT = 200;
const CONTENT_WIDTH = RIGHT - LEFT;
const DETAIL_TOP = 93;
const DETAIL_BOTTOM = 242;
const COLUMN_DIVIDER = 107;
const INK: [number, number, number] = [14, 14, 14];
const MUTED: [number, number, number] = [82, 82, 82];
const LIGHT_GREY: [number, number, number] = [207, 207, 207];

const normalize = (value?: string | null) => value?.trim() || "";

async function imageAsDataUrl(url?: string | null) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** Pro Regal Pavilion banquet event order, matched to the venue's supplied BEO. */
export async function buildRunsheetPdf(data: RunsheetPdfData) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const logoData = await imageAsDataUrl(data.logoUrl);
  const timeRange = `${data.startTime} - ${data.endTime}`;
  const eventHeading = `${data.eventTypeLabel || data.eventTitle} Event Order`;
  let detailStartPage = 1;

  const text = (value: string, x: number, y: number, size = 8, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...INK);
    doc.text(value, x, y);
  };

  const drawTitleBlock = () => {
    text(eventHeading, LEFT, 13, 16, true);
    text(data.eventDateLabel, LEFT, 19, 10.5, true);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.text(
      [data.businessName, [data.businessPhone, data.businessEmail].filter(Boolean).join(", ")]
        .filter(Boolean)
        .join(" - "),
      LEFT,
      24,
    );

    if (logoData) {
      doc.addImage(logoData, "PNG", 166, 9, 27, 18, undefined, "FAST");
    }

    const contacts: [string, string][] = [
      ["Sales Person:", `${normalize(data.salesPerson) || "—"}${data.salesPersonPhone ? ` (${data.salesPersonPhone})` : ""}`],
      ["Event Coordinator:", `${normalize(data.eventCoordinator) || "—"}${data.eventCoordinatorPhone ? ` (${data.eventCoordinatorPhone})` : ""}`],
      ["Client:", `${data.clientName}${data.clientPhone ? ` (${data.clientPhone})` : ""}`],
      ["Onsite Contact:", `${normalize(data.onsiteContactName)}${data.onsiteContactPhone ? ` (${data.onsiteContactPhone})` : " ()"}`.trim()],
    ];
    contacts.forEach(([label, value], index) => {
      const rowY = 34 + index * 4.3;
      text(label, LEFT, rowY, 7.2);
      text(value, 47, rowY, 7.2);
    });

    doc.setDrawColor(202, 202, 202);
    doc.setLineWidth(0.25);
    doc.line(110, 31, 110, 49);
    if (data.eventOrderNumber) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.2);
      doc.setTextColor(...INK);
      doc.text(`Event Order: ${data.eventOrderNumber}`, RIGHT - 2, 35, { align: "right" });
    }
    if (data.bookingReference) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.2);
      doc.text(`Booking Reference: ${data.bookingReference}`, RIGHT - 2, 39.5, { align: "right" });
    }
  };

  const drawBand = (title: string, y: number) => {
    doc.setFillColor(7, 7, 7);
    doc.rect(LEFT, y, CONTENT_WIDTH, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.8);
    doc.text(title, LEFT + 3, y + 4.9);
    doc.text("Day 1 of 1", RIGHT - 3, y + 4.9, { align: "right" });
  };

  const drawSummaryCells = (y: number, grey = false) => {
    const height = grey ? 10 : 10;
    if (grey) {
      doc.setFillColor(...LIGHT_GREY);
      doc.rect(LEFT, y, CONTENT_WIDTH, height, "F");
    }
    doc.setDrawColor(20, 20, 20);
    doc.setLineWidth(0.3);
    doc.rect(LEFT, y, CONTENT_WIDTH, height);
    [48, 105, 143].forEach((x) => doc.line(x, y, x, y + height));
    const weight = grey ? true : false;
    const iconY = y + 5.1;
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.35);
    doc.circle(14, iconY - 0.2, 1.5);
    doc.line(14, iconY - 0.2, 14, iconY - 1.2);
    doc.line(14, iconY - 0.2, 14.8, iconY - 0.2);
    doc.roundedRect(52, iconY - 1.6, 3.6, 2.6, 0.3, 0.3);
    doc.line(52.8, iconY + 1.5, 55.8, iconY + 1.5);
    doc.circle(110, iconY - 1.1, 1);
    doc.roundedRect(108.5, iconY, 3, 2, 0.4, 0.4, "F");
    doc.rect(146, iconY - 1.8, 2.6, 3.8);
    doc.circle(148, iconY + 0.2, 0.25, "F");
    text(timeRange, 17, y + 5.5, 7.1, weight);
    text(data.eventTitle, 57, y + 5.5, 7.1, weight);
    text(`Adults: ${data.adultGuests}`, 113, y + 4.3, 7.1, weight);
    text(`Kids: ${data.kidsGuests}`, 113, y + 8, 7.1, weight);
    text("Venue", 150, y + 3.7, 6.2, weight);
    text(data.venueSpace, 150, y + 7.3, 7.1, weight);
  };

  const drawFirstPageStructure = () => {
    drawTitleBlock();
    drawBand(`Event Summary - ${data.eventDateLabel}`, 54);
    drawSummaryCells(61);
    drawBand(`Agenda - ${data.eventDateLabel}`, 76);
    drawSummaryCells(83, true);
    detailStartPage = doc.getNumberOfPages();
  };

  const footer = (page: number, pages: number) => {
    doc.setPage(page);
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(`END DAY 1 OF 1${pages > 1 ? ` — CONTINUED ${page} OF ${pages}` : ""}`, PAGE_WIDTH / 2, 260, { align: "center" });
    doc.setDrawColor(202, 202, 202);
    doc.setLineWidth(0.9);
    doc.setLineDashPattern([3, 2.2], 0);
    doc.line(LEFT, 267, RIGHT, 267);
    doc.setLineDashPattern([], 0);
    doc.setTextColor(...MUTED);
    doc.setFontSize(6.8);
    doc.text(`Printed Date: ${new Date().toLocaleDateString("en-AU")}`, RIGHT, 285, { align: "right" });
    doc.setTextColor(...INK);
    doc.text("Name:", LEFT, 290);
    doc.line(19, 291, 56, 291);
    doc.text("Signature:", 60, 290);
    doc.line(74, 291, 101, 291);
    doc.text("Date:", 104, 290);
    doc.line(112, 291, 118, 291);
    doc.text("/", 120, 290);
    doc.line(123, 291, 129, 291);
    doc.text("/", 131, 290);
    doc.line(134, 291, 140, 291);
    doc.text(`Page ${page} of ${pages}`, RIGHT, 290, { align: "right" });
  };

  const menuLines: PdfLine[] = [
    ...(data.liveStalls.length ? [
      { text: "Live Stalls", level: 0 as const, bold: true, bullet: false },
      ...data.liveStalls.map((stall): PdfLine => ({ text: `${stall.name}${stall.startTime && stall.endTime ? ` — ${stall.startTime} to ${stall.endTime}` : ""}`, level: 1 })),
    ] : []),
    { text: `${data.packageName || "Menu"} (${timeRange})`, level: 0, bold: true },
    { text: "Items", level: 1, bold: true },
  ];
  data.menuByCategory.forEach((group) => {
    menuLines.push({ text: group.category, level: 1, bold: true });
    group.items.forEach((item) => menuLines.push({ text: item, level: 2 }));
  });
  if (data.specialRequests) menuLines.push({ text: data.specialRequests, level: 0, bold: true });
  if (data.kidsMenuNote) menuLines.push({ text: `Kids Menu- ${data.kidsMenuNote}`, level: 0, bold: true });
  if (data.beveragePackage) menuLines.push({ text: `Beverages- ${data.beveragePackage}`, level: 0, bold: true });
  if (data.corkageNote) menuLines.push({ text: `Corkage- ${data.corkageNote}`, level: 0, bold: true });
  if (data.dietaryRequirements) menuLines.push({ text: `Dietary: ${data.dietaryRequirements}`, level: 0, bold: true });
  if (data.allergies) menuLines.push({ text: `ALLERGIES: ${data.allergies}`, level: 0, bold: true, color: "alert" });

  const setupLines: PdfLine[] = [
    { text: "Setup & Additional Information", level: 0, bold: true, bullet: false },
    { text: data.eventTitle, level: 0, bold: true },
    ...data.setupItems.map((item): PdfLine => ({ text: item, level: 1 })),
  ];
  normalize(data.setupNotes).split("\n").filter(Boolean).forEach((note) => setupLines.push({ text: note, level: 1 }));
  if (data.accessTime) setupLines.push({ text: `Decor access required at ${data.accessTime}`, level: 0 });
  if (data.schedule.length) {
    setupLines.push({ text: "Service timings", level: 0, bold: true, bullet: false });
    data.schedule.forEach((line) => setupLines.push({
      text: `${line.time} - ${line.label}${line.detail ? ` (${line.detail})` : ""}`,
      level: 1,
    }));
  }

  const measureLine = (line: PdfLine, width: number) => {
    doc.setFont("helvetica", line.bold ? "bold" : "normal");
    doc.setFontSize(7.4);
    const indent = line.level === 2 ? 10 : line.level === 1 ? 5 : 0;
    const wrapped = doc.splitTextToSize(line.text, width - indent - 5) as string[];
    return { wrapped, height: Math.max(4.1, wrapped.length * 3.6) + (line.level < 2 ? 0.7 : 0), indent };
  };

  const paginate = (lines: PdfLine[], width: number) => {
    const pages: PdfLine[][] = [[]];
    let used = 0;
    lines.forEach((line) => {
      const measured = measureLine(line, width);
      if (used + measured.height > DETAIL_BOTTOM - DETAIL_TOP - 4 && pages[pages.length - 1].length) {
        pages.push([]);
        used = 0;
      }
      pages[pages.length - 1].push(line);
      used += measured.height;
    });
    return pages;
  };

  drawFirstPageStructure();
  const leftPages = paginate(menuLines, COLUMN_DIVIDER - LEFT - 5);
  const rightPages = paginate(setupLines, RIGHT - COLUMN_DIVIDER - 5);
  const contentPages = Math.max(leftPages.length, rightPages.length);
  while (doc.getNumberOfPages() < contentPages) doc.addPage();

  const drawColumn = (lines: PdfLine[], x: number, width: number, top: number) => {
    let y = top + 4;
    lines.forEach((line) => {
      const { wrapped, height, indent } = measureLine(line, width);
      const bullet = line.level === 2 ? "-" : "•";
      doc.setTextColor(...(line.color === "alert" ? [160, 35, 35] as [number, number, number] : INK));
      doc.setFont("helvetica", line.bold ? "bold" : "normal");
      doc.setFontSize(7.4);
      if (line.bullet !== false) doc.text(bullet, x + indent, y);
      doc.text(wrapped, x + indent + 4, y);
      y += height;
    });
  };

  for (let index = 0; index < contentPages; index += 1) {
    doc.setPage(detailStartPage + index);
    if (index > 0) {
      drawBand(`Agenda continued - ${data.eventDateLabel}`, 12);
    }
    const top = index === 0 ? DETAIL_TOP : 19;
    doc.setDrawColor(20, 20, 20);
    doc.setLineWidth(0.3);
    doc.rect(LEFT, top, CONTENT_WIDTH, DETAIL_BOTTOM - top);
    doc.line(COLUMN_DIVIDER, top, COLUMN_DIVIDER, DETAIL_BOTTOM);
    drawColumn(leftPages[index] || [], LEFT + 3, COLUMN_DIVIDER - LEFT - 5, top);
    drawColumn(rightPages[index] || [], COLUMN_DIVIDER + 3, RIGHT - COLUMN_DIVIDER - 5, top);
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) footer(page, pages);
  return doc;
}