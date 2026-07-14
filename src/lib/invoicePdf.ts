import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

const GOLD: [number, number, number] = [212, 169, 74];
const DARK: [number, number, number] = [17, 17, 17];
const LIGHT: [number, number, number] = [242, 242, 242];
const TEXT: [number, number, number] = [34, 34, 34];
const MUTED: [number, number, number] = [102, 102, 102];

export interface InvoiceData {
  invoice_number: number;
  invoice_number_display: string; // e.g. "PRP-2026-0007"
  invoice_code: string; // e.g. MAM36.50
  week_start: Date;
  week_end: Date;
  issue_date: Date;
  due_date: Date;
  net_hours: number;
  hourly_rate: number;
  amount: number;
  employee: {
    name: string;
    abn: string | null;
    account_name: string | null;
    bsb: string | null;
    account_number: string | null;
  };
  billTo: {
    name: string;
    abn: string;
    address_lines: string[];
  };
}

const maskAccount = (acc: string | null) =>
  !acc ? "—" : acc.length <= 4 ? acc : "****" + acc.slice(-4);

const fmtABN = (abn: string | null | undefined) => {
  if (!abn) return "";
  const d = abn.replace(/\D/g, "");
  if (d.length !== 11) return abn;
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 11)}`;
};

export function buildInvoicePdf(data: InvoiceData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Header
  doc.setFillColor(...GOLD); doc.rect(20, 15, 4, 30, "F");
  doc.setFillColor(...DARK); doc.rect(24, 15, W - 44, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(24);
  doc.text("TAX INVOICE", 32, 33);

  // Meta
  let y = 55;
  doc.setTextColor(...MUTED); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("INVOICE #", 20, y);
  doc.text("WEEK WORKED", 20, y + 6);
  doc.text("ISSUE DATE", 105, y);
  doc.text("DUE DATE", 105, y + 6);
  doc.setTextColor(...TEXT); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(data.invoice_number_display, 50, y);
  doc.text(`${format(data.week_start, "dd/MM/yyyy")} - ${format(data.week_end, "dd/MM/yyyy")}`, 50, y + 6);
  doc.text(format(data.issue_date, "dd/MM/yyyy"), 130, y);
  doc.text(format(data.due_date, "dd/MM/yyyy"), 130, y + 6);

  // Panels
  y = 70; const panelH = 40;
  doc.setFillColor(...LIGHT);
  doc.rect(20, y, 82, panelH, "F");
  doc.rect(108, y, 82, panelH, "F");

  doc.setTextColor(...MUTED); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("FROM", 25, y + 6);
  doc.text("BILL TO", 113, y + 6);

  doc.setTextColor(...TEXT); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(data.employee.name, 25, y + 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  const fromLines = [
    data.employee.abn ? `ABN ${fmtABN(data.employee.abn)}` : "ABN —",
    "",
    `Bank: ${data.employee.account_name || "—"}`,
    `BSB: ${data.employee.bsb || "—"}`,
    `Account: ${maskAccount(data.employee.account_number)}`,
  ];
  fromLines.forEach((l, i) => doc.text(l, 25, y + 19 + i * 4.2));

  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(data.billTo.name, 113, y + 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  const toLines = [`ABN ${fmtABN(data.billTo.abn)}`, ...data.billTo.address_lines];
  toLines.forEach((l, i) => doc.text(l, 113, y + 19 + i * 4.2));

  // Table
  y = 118;
  autoTable(doc, {
    startY: y,
    head: [["CODE", "DESCRIPTION", "QTY", "RATE", "AMOUNT"]],
    body: [[
      data.invoice_code,
      "Service",
      "1",
      `$${data.amount.toFixed(2)}`,
      `$${data.amount.toFixed(2)}`,
    ]],
    margin: { left: 20, right: 20 },
    styles: { fontSize: 10, cellPadding: 3, textColor: TEXT },
    headStyles: { fillColor: DARK, textColor: GOLD, fontStyle: "bold", fontSize: 9 },
    columnStyles: {
      2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" },
    },
  });
  const finalY = (doc as any).lastAutoTable.finalY + 8;

  // Totals
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...MUTED);
  doc.text("Subtotal", 165, finalY, { align: "right" });
  doc.setTextColor(...TEXT);
  doc.text(`$${data.amount.toFixed(2)}`, W - 24, finalY, { align: "right" });

  doc.setTextColor(...MUTED);
  doc.text("GST (0%)", 165, finalY + 6, { align: "right" });
  doc.setTextColor(...TEXT);
  doc.text("$0.00", W - 24, finalY + 6, { align: "right" });

  doc.setFillColor(255, 245, 214);
  doc.rect(105, finalY + 10, W - 125, 9, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...DARK);
  doc.text("TOTAL DUE (AUD)", 165, finalY + 16, { align: "right" });
  doc.text(`$${data.amount.toFixed(2)}`, W - 24, finalY + 16, { align: "right" });

  return doc;
}

export function invoicePdfBase64(doc: jsPDF): string {
  const uri = doc.output("datauristring");
  return uri.split(",")[1] || "";
}
