import jsPDF from "jspdf";

export type RunsheetScheduleLine = { time: string; label: string; detail?: string };

export type RunsheetPdfData = {
  businessName: string;
  businessPhone?: string | null;
  businessEmail?: string | null;
  eventTitle: string;
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
  schedule: RunsheetScheduleLine[];
  menuByCategory: { category: string; items: string[] }[];
  beveragePackage?: string | null;
  dietaryRequirements?: string | null;
  allergies?: string | null;
  specialRequests?: string | null;
  setupItems: string[];
  setupNotes?: string | null;
  accessTime?: string | null;
};

const GOLD: [number, number, number] = [172, 132, 93];
const INK: [number, number, number] = [25, 25, 25];

export function buildRunsheetPdf(data: RunsheetPdfData) {
  const doc = new jsPDF();
  const left = 16;
  const right = 194;
  let y = 0;

  const ensureSpace = (needed: number) => {
    if (y + needed > 276) { doc.addPage(); y = 22; }
  };

  const heading = (text: string) => {
    ensureSpace(18);
    y += 6;
    doc.setFillColor(245, 241, 235); doc.rect(left, y - 5.5, right - left, 9, "F");
    doc.setTextColor(...INK); doc.setFont("times", "bold"); doc.setFontSize(12);
    doc.text(text.toUpperCase(), left + 3, y + 1);
    y += 11;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  };

  const field = (label: string, value: string, x = left, width = 88) => {
    doc.setFont("helvetica", "bold"); doc.setTextColor(110, 110, 110); doc.setFontSize(8);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...INK); doc.setFontSize(10);
    doc.text(doc.splitTextToSize(value || "—", width), x, y + 5);
  };

  // Header band
  doc.setFillColor(18, 16, 15); doc.rect(0, 0, 210, 40, "F");
  doc.setTextColor(245, 245, 245); doc.setFont("times", "bold"); doc.setFontSize(20);
  doc.text(data.businessName, left, 18);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GOLD);
  doc.text("BANQUET EVENT ORDER / RUNSHEET", left, 26);
  doc.setTextColor(200, 200, 200);
  doc.text([data.businessPhone, data.businessEmail].filter(Boolean).join("  ·  "), left, 33);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(245, 245, 245);
  if (data.eventOrderNumber) doc.text(`Event order: ${data.eventOrderNumber}`, right, 20, { align: "right" });
  if (data.bookingReference) doc.text(`Ref: ${data.bookingReference}`, right, 27, { align: "right" });

  y = 52;
  doc.setTextColor(...INK); doc.setFont("times", "bold"); doc.setFontSize(17);
  doc.text(data.eventTitle, left, y); y += 8;
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(90, 90, 90);
  doc.text(`${data.eventDateLabel}  ·  ${data.startTime} – ${data.endTime}  ·  ${data.venueSpace}`, left, y);
  y += 6; doc.setDrawColor(...GOLD); doc.line(left, y, right, y); y += 10;

  heading("Contacts & numbers");
  field("Client", `${data.clientName}${data.clientPhone ? ` (${data.clientPhone})` : ""}`);
  field("Onsite contact", `${data.onsiteContactName || "—"}${data.onsiteContactPhone ? ` (${data.onsiteContactPhone})` : ""}`, 110, 84);
  y += 14;
  field("Sales person", data.salesPerson || "—");
  field("Event coordinator", data.eventCoordinator || "—", 110, 84);
  y += 14;
  field("Adults", String(data.adultGuests));
  field("Kids", String(data.kidsGuests), 60, 40);
  field("Total attending", String(data.adultGuests + data.kidsGuests), 110, 60);
  y += 14;

  if (data.schedule.length) {
    heading("Service schedule");
    data.schedule.forEach((line) => {
      ensureSpace(9);
      doc.setFont("helvetica", "bold"); doc.setTextColor(...GOLD); doc.setFontSize(10);
      doc.text(line.time || "—", left, y);
      doc.setTextColor(...INK);
      doc.text(line.label, left + 26, y);
      if (line.detail) {
        doc.setFont("helvetica", "normal"); doc.setTextColor(90, 90, 90); doc.setFontSize(9);
        const wrapped = doc.splitTextToSize(line.detail, 110);
        doc.text(wrapped, left + 80, y);
        y += Math.max(7, wrapped.length * 5);
      } else { y += 7; }
      doc.setTextColor(...INK); doc.setFontSize(10);
    });
  }

  if (data.menuByCategory.length) {
    heading("Menu");
    data.menuByCategory.forEach((group) => {
      ensureSpace(12);
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(group.category, left, y); y += 6;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      group.items.forEach((item) => { ensureSpace(7); doc.text(`•  ${item}`, left + 4, y); y += 6; });
      y += 2;
    });
  }

  if (data.beveragePackage || data.dietaryRequirements || data.allergies || data.specialRequests) {
    heading("Beverages & special requirements");
    if (data.beveragePackage) { ensureSpace(7); doc.text(`Beverages: ${data.beveragePackage}`, left, y); y += 7; }
    if (data.dietaryRequirements) {
      const wrapped = doc.splitTextToSize(`Dietary: ${data.dietaryRequirements}`, right - left);
      ensureSpace(wrapped.length * 6); doc.text(wrapped, left, y); y += wrapped.length * 6 + 1;
    }
    if (data.allergies) {
      const wrapped = doc.splitTextToSize(`ALLERGIES: ${data.allergies}`, right - left);
      ensureSpace(wrapped.length * 6);
      doc.setTextColor(170, 40, 40); doc.setFont("helvetica", "bold");
      doc.text(wrapped, left, y); y += wrapped.length * 6 + 1;
      doc.setTextColor(...INK); doc.setFont("helvetica", "normal");
    }
    if (data.specialRequests) {
      const wrapped = doc.splitTextToSize(`Special requests: ${data.specialRequests}`, right - left);
      ensureSpace(wrapped.length * 6); doc.text(wrapped, left, y); y += wrapped.length * 6 + 1;
    }
  }

  heading("Setup & additional information");
  if (data.accessTime) { ensureSpace(7); doc.setFont("helvetica", "bold"); doc.text(`Decor / vendor access: ${data.accessTime}`, left, y); doc.setFont("helvetica", "normal"); y += 8; }
  if (data.setupItems.length) {
    data.setupItems.forEach((item) => {
      ensureSpace(7);
      doc.setDrawColor(140, 140, 140); doc.rect(left, y - 3.2, 3.6, 3.6);
      doc.text(item, left + 6.5, y); y += 6.5;
    });
  } else { ensureSpace(7); doc.text("—", left, y); y += 6.5; }
  if (data.setupNotes) {
    const wrapped = doc.splitTextToSize(data.setupNotes, right - left);
    ensureSpace(wrapped.length * 6 + 4); y += 3; doc.text(wrapped, left, y); y += wrapped.length * 6;
  }

  ensureSpace(34);
  y += 12; doc.setDrawColor(...GOLD); doc.line(left, y, right, y); y += 10;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text("Name: ______________________", left, y);
  doc.text("Signature: ______________________", left + 62, y);
  doc.text("Date: ____ / ____ / ______", left + 132, y);

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    doc.text(`Printed ${new Date().toLocaleDateString("en-AU")}`, left, 289);
    doc.text(`Page ${page} of ${pages}`, right, 289, { align: "right" });
  }
  return doc;
}
