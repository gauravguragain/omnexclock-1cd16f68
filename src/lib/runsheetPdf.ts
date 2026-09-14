import jsPDF from "jspdf";

export type RunsheetScheduleLine = { time: string; label: string; detail?: string };

export type RunsheetPdfData = {
  businessName: string;
  businessPhone?: string | null;
  businessEmail?: string | null;
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
  eventCoordinator?: string | null;
  onsiteContactName?: string | null;
  onsiteContactPhone?: string | null;
  eventOrderNumber?: string | null;
  bookingReference?: string | null;
  packageName?: string | null;
  schedule: RunsheetScheduleLine[];
  menuByCategory: { category: string; items: string[] }[];
  beveragePackage?: string | null;
  corkageNote?: string | null;
  kidsMenuNote?: string | null;
  dietaryRequirements?: string | null;
  allergies?: string | null;
  specialRequests?: string | null;
  setupItems: string[];
  setupNotes?: string | null;
  accessTime?: string | null;
};

const INK: [number, number, number] = [20, 20, 20];
const MUTED: [number, number, number] = [105, 105, 105];

/** Banquet Event Order laid out to match the venue's existing event order sheet. */
export function buildRunsheetPdf(data: RunsheetPdfData) {
  const doc = new jsPDF();
  const left = 14;
  const right = 194;
  const colGap = 6;
  const colLeftX = left + 4;
  const colRightX = 112;
  const colLeftWidth = colRightX - colLeftX - colGap;
  const colRightWidth = right - colRightX;
  const timeRange = `${data.startTime} - ${data.endTime}`;

  // Title block
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...INK);
  doc.text(`${data.eventTypeLabel || data.eventTitle} Event Order`, left, 18);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text(data.eventDateLabel, left, 25);
  doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text([data.businessName, [data.businessPhone, data.businessEmail].filter(Boolean).join(", ")].filter(Boolean).join(" - "), left, 31);

  // Contact / reference block
  let y = 42;
  doc.setTextColor(...INK); doc.setFontSize(9);
  const rowLabels: [string, string][] = [
    ["Sales Person:", data.salesPerson || "—"],
    ["Event Coordinator:", data.eventCoordinator || "—"],
    ["Client:", `${data.clientName}${data.clientPhone ? ` (${data.clientPhone})` : ""}`],
    ["Onsite Contact:", `${data.onsiteContactName || ""}${data.onsiteContactPhone ? ` (${data.onsiteContactPhone})` : " ()"}`.trim()],
  ];
  rowLabels.forEach(([label, value], index) => {
    doc.setFont("helvetica", "bold"); doc.text(label, left, y + index * 5.5);
    doc.setFont("helvetica", "normal"); doc.text(value, left + 40, y + index * 5.5);
  });
  doc.setFont("helvetica", "bold");
  if (data.eventOrderNumber) doc.text(`Event Order: ${data.eventOrderNumber}`, right, y, { align: "right" });
  if (data.bookingReference) doc.text(`Booking Reference: ${data.bookingReference}`, right, y + 5.5, { align: "right" });
  y += rowLabels.length * 5.5 + 8;

  const band = (title: string) => {
    doc.setFillColor(240, 238, 234); doc.rect(left, y - 5, right - left, 8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...INK);
    doc.text(title, left + 3, y);
    doc.text("Day 1 of 1", right - 3, y, { align: "right" });
    y += 9;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  };

  const summaryRow = () => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
    doc.text(timeRange, left + 6, y);
    doc.text(data.eventTitle, left + 46, y);
    doc.text(`Attendees: ${data.adultGuests + data.kidsGuests}`, 128, y);
    doc.text(data.venueSpace, right, y, { align: "right" });
    doc.text(`Kids: ${data.kidsGuests}`, 128, y + 5);
    y += 13;
  };

  band(`Event Summary - ${data.eventDateLabel}`);
  summaryRow();
  band(`Agenda - ${data.eventDateLabel}`);
  summaryRow();

  // Two columns: menu / agenda detail on the left, setup on the right
  const startPage = doc.getNumberOfPages();
  let leftY = y;
  let rightY = y;
  const lineHeight = 5;

  const writeLines = (text: string, x: number, width: number, startY: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(9);
    const lines = doc.splitTextToSize(text, width);
    if (startY + lines.length * lineHeight > 272) {
      const current = doc.getCurrentPageInfo().pageNumber;
      if (current < doc.getNumberOfPages()) doc.setPage(current + 1); else doc.addPage();
      startY = 24;
    }
    doc.text(lines, x, startY);
    return startY + lines.length * lineHeight;
  };

  // Right column
  rightY = writeLines("Setup & Additional Information", colRightX, colRightWidth, rightY, true);
  rightY += 2;
  rightY = writeLines(`\u2022  ${data.eventTitle}`, colRightX, colRightWidth, rightY);
  data.setupItems.forEach((item) => {
    rightY = writeLines(`- ${item}`, colRightX + 5, colRightWidth - 5, rightY);
  });
  if (data.setupNotes) {
    data.setupNotes.split("\n").filter(Boolean).forEach((note) => {
      rightY = writeLines(`- ${note}`, colRightX + 5, colRightWidth - 5, rightY);
    });
  }
  if (data.accessTime) rightY = writeLines(`\u2022  Decor access required at ${data.accessTime}`, colRightX, colRightWidth, rightY + 2);

  doc.setPage(startPage);

  // Left column
  const packageHeading = `${data.packageName || "Menu"} (${timeRange})`;
  leftY = writeLines(`\u2022  ${packageHeading}`, colLeftX, colLeftWidth, leftY, true);
  leftY = writeLines("Items", colLeftX + 5, colLeftWidth - 5, leftY + 1);
  leftY += 1;

  data.menuByCategory.forEach((group) => {
    leftY = writeLines(`o  ${group.category}`, colLeftX + 5, colLeftWidth - 5, leftY + 1.5, true);
    group.items.forEach((item) => {
      leftY = writeLines(`-  ${item}`, colLeftX + 12, colLeftWidth - 12, leftY);
    });
  });

  if (data.schedule.length) {
    leftY = writeLines("o  Service timings", colLeftX + 5, colLeftWidth - 5, leftY + 3, true);
    data.schedule.forEach((line) => {
      leftY = writeLines(`-  ${line.time} — ${line.label}${line.detail ? ` (${line.detail})` : ""}`, colLeftX + 12, colLeftWidth - 12, leftY);
    });
  }

  if (data.kidsMenuNote) leftY = writeLines(`\u2022  Kids Menu- ${data.kidsMenuNote}`, colLeftX, colLeftWidth, leftY + 3);
  if (data.beveragePackage) leftY = writeLines(`\u2022  Beverages- ${data.beveragePackage}`, colLeftX, colLeftWidth, leftY + 1.5);
  if (data.corkageNote) leftY = writeLines(`\u2022  Corkage- ${data.corkageNote}`, colLeftX, colLeftWidth, leftY + 1.5);
  if (data.specialRequests) leftY = writeLines(`*  ${data.specialRequests}`, colLeftX, colLeftWidth, leftY + 3);
  if (data.dietaryRequirements) leftY = writeLines(`*  Dietary: ${data.dietaryRequirements}`, colLeftX, colLeftWidth, leftY + 1.5);
  if (data.allergies) {
    doc.setTextColor(170, 40, 40);
    leftY = writeLines(`*  ALLERGIES: ${data.allergies}`, colLeftX, colLeftWidth, leftY + 1.5, true);
    doc.setTextColor(...INK);
  }

  // Close-out
  let closeY = Math.max(leftY, rightY) + 12;
  if (closeY > 262) { doc.addPage(); closeY = 40; }
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text("END DAY 1 OF 1", 105, closeY, { align: "center" });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(`Printed Date: ${new Date().toLocaleDateString("en-AU")}`, right, 283, { align: "right" });
    doc.setTextColor(...INK); doc.setFontSize(9);
    doc.text("Name:", left, 289);
    doc.text("Signature:", left + 42, 289);
    doc.text("Date:      /      /", left + 88, 289);
    doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(`Page ${page} of ${pages}`, right, 289, { align: "right" });
  }
  return doc;
}
