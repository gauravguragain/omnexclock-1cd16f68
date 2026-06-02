import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

const ACCENT: [number, number, number] = [201, 162, 39];
const HEADER_BG: [number, number, number] = [25, 25, 25];

export interface PayrollPdfEntry {
  employee_id: string;
  name: string;
  department: string | null;
  pay_rate: number;
  admin_hourly_rate: number;
  total_hours: number;
  break_hours: number;
  net_hours: number;
  employee_pay: number;
  admin_pay: number;
  admin_pay_incl_gst: number;
  pay_id: string | null;
  account_name: string | null;
  bsb: string | null;
  account_number: string | null;
}

export type PayrollTab = "employee" | "admin" | "margin";

interface Opts {
  tab: PayrollTab;
  entries: PayrollPdfEntry[];
  businessName: string;
  businessCode?: string;
  dateFrom: Date;
  dateTo: Date;
  filters?: { department?: string | null; employee?: string | null; search?: string | null };
}

export function buildPayrollPdf(opts: Opts): jsPDF {
  const { tab, entries, businessName, businessCode, dateFrom, dateTo, filters } = opts;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const tabTitle = tab === "employee" ? "Employee Payroll" : tab === "admin" ? "Admin Payroll" : "Margin Analysis";
  const periodLabel = `${format(dateFrom, "dd MMM yyyy")} – ${format(dateTo, "dd MMM yyyy")}`;

  // Header band
  doc.setFillColor(...HEADER_BG);
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, 6, 32, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(businessName.toUpperCase(), 14, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(220, 220, 220);
  doc.text(tabTitle, 14, 20);
  doc.setFontSize(8);
  doc.setTextColor(180, 180, 180);
  doc.text(periodLabel, 14, 26);
  if (businessCode) {
    doc.text(`Code: ${businessCode}`, pageWidth - 14, 13, { align: "right" });
  }
  doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, pageWidth - 14, 20, { align: "right" });

  let yPos = 40;

  // Filters line
  const filterParts: string[] = [];
  if (filters?.department) filterParts.push(`Dept: ${filters.department}`);
  if (filters?.employee) filterParts.push(`Employee: ${filters.employee}`);
  if (filters?.search) filterParts.push(`Search: ${filters.search}`);
  if (filterParts.length) {
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(filterParts.join("  ·  "), 14, yPos);
    yPos += 5;
  }

  // Totals
  const totalNetHours = entries.reduce((s, e) => s + e.net_hours, 0);
  const totalBreakHours = entries.reduce((s, e) => s + e.break_hours, 0);
  const totalTotalHours = entries.reduce((s, e) => s + e.total_hours, 0);
  const totalEmployeePay = entries.reduce((s, e) => s + e.employee_pay, 0);
  const totalAdminPay = entries.reduce((s, e) => s + e.admin_pay, 0);
  const totalAdminPayIncl = entries.reduce((s, e) => s + e.admin_pay_incl_gst, 0);
  const totalMarginEx = totalAdminPay - totalEmployeePay;
  const totalMarginIncl = totalAdminPayIncl - totalEmployeePay;
  const marginPct = totalAdminPay > 0 ? (totalMarginEx / totalAdminPay) * 100 : 0;

  const stats: { label: string; value: string; color: [number, number, number] }[] =
    tab === "employee"
      ? [
          { label: "Total Pay", value: `$${totalEmployeePay.toFixed(2)}`, color: [16, 124, 65] },
          { label: "Net Hours", value: totalNetHours.toFixed(2), color: [41, 98, 255] },
          { label: "Break Hours", value: totalBreakHours.toFixed(2), color: [180, 83, 9] },
          { label: "Employees", value: String(entries.length), color: [124, 58, 237] },
        ]
      : tab === "admin"
      ? [
          { label: "Admin (incl GST)", value: `$${totalAdminPayIncl.toFixed(2)}`, color: [220, 38, 38] },
          { label: "Admin (ex GST)", value: `$${totalAdminPay.toFixed(2)}`, color: [180, 83, 9] },
          { label: "GST Component", value: `$${(totalAdminPayIncl - totalAdminPay).toFixed(2)}`, color: [41, 98, 255] },
          { label: "Net Hours", value: totalNetHours.toFixed(2), color: [16, 124, 65] },
        ]
      : [
          { label: "Margin (ex GST)", value: `$${totalMarginEx.toFixed(2)}`, color: [16, 124, 65] },
          { label: "Margin (incl GST)", value: `$${totalMarginIncl.toFixed(2)}`, color: [16, 124, 65] },
          { label: "Margin %", value: `${marginPct.toFixed(1)}%`, color: [124, 58, 237] },
          { label: "Employee Pay", value: `$${totalEmployeePay.toFixed(2)}`, color: [180, 83, 9] },
        ];

  // Stat boxes
  const gap = 4;
  const boxW = (pageWidth - 28 - (stats.length - 1) * gap) / stats.length;
  stats.forEach((s, i) => {
    const x = 14 + i * (boxW + gap);
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(x, yPos, boxW, 16, 2, 2, "F");
    doc.setFillColor(...s.color);
    doc.rect(x, yPos, 3, 16, "F");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(s.label.toUpperCase(), x + 6, yPos + 5);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(s.value, x + 6, yPos + 12);
    doc.setFont("helvetica", "normal");
  });
  yPos += 22;

  // Table
  let headers: string[];
  let rows: string[][];
  let foot: string[];

  if (tab === "employee") {
    headers = ["Name", "Rate ($/hr)", "Total Hrs", "Break Hrs", "Net Hrs", "Employee Pay", "Pay ID", "Account Name", "BSB", "Account #"];
    rows = entries.map((e) => [
      e.name,
      `$${e.pay_rate.toFixed(2)}`,
      e.total_hours.toFixed(2),
      e.break_hours.toFixed(2),
      e.net_hours.toFixed(2),
      `$${e.employee_pay.toFixed(2)}`,
      e.pay_id || "-",
      e.account_name || "-",
      e.bsb || "-",
      e.account_number || "-",
    ]);
    foot = ["TOTAL", "", totalTotalHours.toFixed(2), totalBreakHours.toFixed(2), totalNetHours.toFixed(2), `$${totalEmployeePay.toFixed(2)}`, "", "", "", ""];
  } else if (tab === "admin") {
    headers = ["Name", "Department", "Admin Rate (incl GST)", "Total Hrs", "Break Hrs", "Net Hrs", "Cost (ex GST)", "Cost (incl GST)"];
    rows = entries.map((e) => [
      e.name,
      e.department || "-",
      `$${e.admin_hourly_rate.toFixed(2)}`,
      e.total_hours.toFixed(2),
      e.break_hours.toFixed(2),
      e.net_hours.toFixed(2),
      `$${e.admin_pay.toFixed(2)}`,
      `$${e.admin_pay_incl_gst.toFixed(2)}`,
    ]);
    foot = ["TOTAL", "", "", totalTotalHours.toFixed(2), totalBreakHours.toFixed(2), totalNetHours.toFixed(2), `$${totalAdminPay.toFixed(2)}`, `$${totalAdminPayIncl.toFixed(2)}`];
  } else {
    headers = ["Name", "Department", "Net Hrs", "Employee Pay", "Admin (ex GST)", "Admin (incl GST)", "Margin (ex)", "Margin (incl)", "Margin %"];
    rows = entries.map((e) => {
      const mEx = e.admin_pay - e.employee_pay;
      const mIncl = e.admin_pay_incl_gst - e.employee_pay;
      const mPct = e.admin_pay > 0 ? (mEx / e.admin_pay) * 100 : 0;
      return [
        e.name,
        e.department || "-",
        e.net_hours.toFixed(2),
        `$${e.employee_pay.toFixed(2)}`,
        `$${e.admin_pay.toFixed(2)}`,
        `$${e.admin_pay_incl_gst.toFixed(2)}`,
        `$${mEx.toFixed(2)}`,
        `$${mIncl.toFixed(2)}`,
        `${mPct.toFixed(1)}%`,
      ];
    });
    foot = [
      "TOTAL",
      "",
      totalNetHours.toFixed(2),
      `$${totalEmployeePay.toFixed(2)}`,
      `$${totalAdminPay.toFixed(2)}`,
      `$${totalAdminPayIncl.toFixed(2)}`,
      `$${totalMarginEx.toFixed(2)}`,
      `$${totalMarginIncl.toFixed(2)}`,
      `${marginPct.toFixed(1)}%`,
    ];
  }

  autoTable(doc, {
    startY: yPos,
    head: [headers],
    body: rows,
    foot: [foot],
    margin: { left: 14, right: 14 },
    styles: { fontSize: 7, cellPadding: 2, textColor: [40, 40, 40], lineColor: [220, 220, 220], lineWidth: 0.1 },
    headStyles: { fillColor: HEADER_BG, textColor: ACCENT, fontStyle: "bold", fontSize: 7.5 },
    footStyles: { fillColor: [245, 235, 200], textColor: [20, 20, 20], fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    didDrawPage: () => {
      // Page footer
      doc.setFontSize(7);
      doc.setTextColor(140, 140, 140);
      doc.text(
        `${businessName} · ${tabTitle} · ${periodLabel}`,
        14,
        pageHeight - 8
      );
      const pageNum = (doc as any).internal.getNumberOfPages();
      doc.text(`Page ${pageNum}`, pageWidth - 14, pageHeight - 8, { align: "right" });
    },
  });

  return doc;
}

export function payrollPdfToBase64(doc: jsPDF): string {
  const dataUri = doc.output("datauristring");
  return dataUri.split(",")[1] || "";
}
