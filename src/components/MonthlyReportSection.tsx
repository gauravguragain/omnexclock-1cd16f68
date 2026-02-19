import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Loader2, Calendar, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, startOfMonth, endOfMonth, endOfWeek, parseISO, eachWeekOfInterval } from "date-fns";

const REPORT_OPTIONS = [
  { id: "employees", label: "Employee Summary", description: "Active/inactive employees, departments, roles, pay rates", category: "People" },
  { id: "shifts", label: "Roster / Shifts", description: "Scheduled shifts, weekly hours breakdown by employee", category: "Operations" },
  { id: "timesheets", label: "Timesheets & Attendance", description: "Clock in/out, breaks, daily hours, attendance rate", category: "Operations" },
  { id: "employee_payroll", label: "Employee Payroll", description: "Employee pay entries, hours, department breakdown", category: "Finance" },
  { id: "admin_payroll", label: "Admin Payroll", description: "Admin pay entries, GST-inclusive costs, department breakdown", category: "Finance" },
  { id: "labour_cost", label: "Labour Cost Analysis", description: "Cost per department based on admin payroll, average hourly rate", category: "Finance" },
  { id: "requests", label: "Employee Requests", description: "Leave, availability, approval rates", category: "People" },
  { id: "inventory", label: "FOH Inventory", description: "Stock levels, low stock alerts, category breakdown", category: "Stock" },
  { id: "bar_inventory", label: "Bar Inventory & Orders", description: "Bar stock, order history, reorder alerts", category: "Stock" },
  { id: "events", label: "Events & Functions", description: "Day events, banquet tiers, guest counts, setup details", category: "Operations" },
  { id: "service", label: "Service & Maintenance", description: "Task schedules, overdue items, compliance", category: "Compliance" },
  { id: "audit", label: "Audit Trail", description: "Admin actions, system changes, security log", category: "Compliance" },
  { id: "dept_breakdown", label: "Department Breakdown", description: "Hours, headcount, and costs per department", category: "Analytics" },
] as const;

type ReportId = typeof REPORT_OPTIONS[number]["id"];

// Color palette for PDF sections (RGB)
const SECTION_COLORS: Record<string, [number, number, number]> = {
  People: [41, 98, 255],      // Blue
  Operations: [16, 124, 65],  // Green
  Finance: [180, 83, 9],      // Amber
  Stock: [124, 58, 237],      // Purple
  Compliance: [107, 114, 128],// Gray
  Analytics: [220, 38, 38],   // Red
};

const HEADER_BG: [number, number, number] = [30, 30, 30];
const ACCENT_LINE: [number, number, number] = [41, 98, 255];

function getMonthOptions() {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({ value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy") });
  }
  return options;
}

function getWeekOptions(monthStr: string) {
  const [year, month] = monthStr.split("-").map(Number);
  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(new Date(year, month - 1));
  const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
  return weeks.map((ws, idx) => {
    const we = endOfWeek(ws, { weekStartsOn: 1 });
    const clampedStart = ws < start ? start : ws;
    const clampedEnd = we > end ? end : we;
    return {
      value: `week-${idx}`,
      label: `Week ${idx + 1}: ${format(clampedStart, "dd MMM")} - ${format(clampedEnd, "dd MMM")}`,
      start: clampedStart,
      end: clampedEnd,
    };
  });
}

export default function MonthlyReportSection() {
  const { business } = useBusiness();
  const { toast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [selectedWeek, setSelectedWeek] = useState<string>("full-month");
  const [selectedReports, setSelectedReports] = useState<Set<ReportId>>(new Set(REPORT_OPTIONS.map(r => r.id)));
  const [generating, setGenerating] = useState(false);

  const monthOptions = getMonthOptions();
  const weekOptions = getWeekOptions(selectedMonth);

  const toggleReport = (id: ReportId) => {
    setSelectedReports(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedReports(new Set(REPORT_OPTIONS.map(r => r.id)));
  const selectNone = () => setSelectedReports(new Set());

  const handleGenerate = async () => {
    if (!business || selectedReports.size === 0) {
      toast({ title: "Select Reports", description: "Please select at least one report to generate.", variant: "destructive" });
      return;
    }

    setGenerating(true);
    try {
      const [year, month] = selectedMonth.split("-").map(Number);
      const monthStart = startOfMonth(new Date(year, month - 1));
      const monthEnd = endOfMonth(new Date(year, month - 1));

      const isWeekly = selectedWeek !== "full-month";
      let dateStart = monthStart;
      let dateEnd = monthEnd;

      if (isWeekly) {
        const weekIdx = parseInt(selectedWeek.replace("week-", ""));
        const wo = weekOptions[weekIdx];
        if (wo) { dateStart = wo.start; dateEnd = wo.end; }
      }

      const startStr = format(dateStart, "yyyy-MM-dd");
      const endStr = format(dateEnd, "yyyy-MM-dd");
      const businessId = business.id;

      const { data: empRows } = await supabase.from("employees").select("id").eq("business_id", businessId);
      const empIds = empRows?.map(e => e.id) || [];

      const wrap = <T,>(q: PromiseLike<T>): Promise<T> => Promise.resolve(q);
      const fetchers: Record<string, Promise<any>> = {};

      // Always fetch employees for cross-report analytics
      fetchers.employees = wrap(supabase.from("employees").select("*").eq("business_id", businessId).then(r => r.data || []));

      if ((selectedReports.has("shifts") || selectedReports.has("dept_breakdown")) && empIds.length > 0) {
        fetchers.shifts = wrap(supabase.from("shifts").select("*, employees!inner(name, department, pay_rate, admin_hourly_rate, job_title)").gte("date", startStr).lte("date", endStr).in("employee_id", empIds).then(r => r.data || []));
      }
      if ((selectedReports.has("timesheets") || selectedReports.has("dept_breakdown")) && empIds.length > 0) {
        fetchers.clockEvents = wrap(supabase.from("clock_events").select("*, employees!inner(name, department)").gte("timestamp", `${startStr}T00:00:00`).lte("timestamp", `${endStr}T23:59:59`).in("employee_id", empIds).then(r => r.data || []));
      }
      if ((selectedReports.has("employee_payroll") || selectedReports.has("admin_payroll") || selectedReports.has("labour_cost")) && empIds.length > 0) {
        fetchers.payroll = wrap(supabase.from("payroll_entries").select("*, employees!inner(name, department, pay_rate, admin_hourly_rate)").gte("period", startStr).lte("period", endStr).in("employee_id", empIds).then(r => r.data || []));
      }
      if (selectedReports.has("requests") && empIds.length > 0) {
        fetchers.requests = wrap(supabase.from("employee_requests").select("*, employees!inner(name, department)").gte("created_at", `${startStr}T00:00:00`).lte("created_at", `${endStr}T23:59:59`).in("employee_id", empIds).then(r => r.data || []));
      }
      if (selectedReports.has("inventory")) {
        fetchers.inventory = wrap(supabase.from("inventory_items").select("*").eq("business_id", businessId).then(r => r.data || []));
      }
      if (selectedReports.has("bar_inventory")) {
        fetchers.barInventory = wrap(supabase.from("bar_inventory_items").select("*").eq("business_id", businessId).then(r => r.data || []));
        fetchers.barOrders = wrap(supabase.from("bar_inventory_orders").select("*, bar_inventory_items!inner(name)").eq("business_id", businessId).gte("created_at", `${startStr}T00:00:00`).lte("created_at", `${endStr}T23:59:59`).then(r => r.data || []));
      }
      if (selectedReports.has("events")) {
        fetchers.events = wrap(supabase.from("roster_day_events").select("*").eq("business_id", businessId).gte("date", startStr).lte("date", endStr).then(r => r.data || []));
      }
      if (selectedReports.has("service")) {
        fetchers.service = wrap(supabase.from("service_maintenance_tasks").select("*").eq("business_id", businessId).then(r => r.data || []));
      }
      if (selectedReports.has("audit")) {
        fetchers.audit = wrap(supabase.from("audit_logs").select("*").eq("business_id", businessId).gte("timestamp", `${startStr}T00:00:00`).lte("timestamp", `${endStr}T23:59:59`).order("timestamp", { ascending: false }).limit(500).then(r => r.data || []));
      }

      const results: Record<string, any> = {};
      const entries = Object.entries(fetchers);
      const resolved = await Promise.all(entries.map(([, q]) => q));
      entries.forEach(([key], i) => { results[key] = resolved[i]; });

      // ===== PDF GENERATION =====
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let yPos = 0;

      const periodLabel = isWeekly
        ? `Weekly Report: ${format(dateStart, "dd MMM yyyy")} - ${format(dateEnd, "dd MMM yyyy")}`
        : `Monthly Report: ${format(monthStart, "MMMM yyyy")}`;

      // ---- COVER PAGE ----
      doc.setFillColor(25, 25, 25);
      doc.rect(0, 0, pageWidth, pageHeight, "F");

      // Accent bar
      doc.setFillColor(...ACCENT_LINE);
      doc.rect(0, 0, 6, pageHeight, "F");

      // Business name
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(28);
      doc.setFont("helvetica", "bold");
      doc.text(business.name.toUpperCase(), 20, 60);

      // Divider line
      doc.setDrawColor(80, 80, 80);
      doc.setLineWidth(0.5);
      doc.line(20, 68, pageWidth - 20, 68);

      // Report type
      doc.setFontSize(16);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(180, 180, 180);
      doc.text(periodLabel, 20, 82);

      // Generated info
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text(`Generated: ${format(new Date(), "dd MMMM yyyy 'at' hh:mm a")}`, 20, 95);
      doc.text(`Business Code: ${business.business_code}`, 20, 103);

      // Table of contents
      doc.setFontSize(12);
      doc.setTextColor(180, 180, 180);
      doc.text("INCLUDED REPORTS", 20, 130);
      doc.setDrawColor(...ACCENT_LINE);
      doc.setLineWidth(0.3);
      doc.line(20, 133, 80, 133);

      let tocY = 142;
      let tocIdx = 1;
      REPORT_OPTIONS.forEach(opt => {
        if (selectedReports.has(opt.id)) {
          const cat = opt.category;
          const color = SECTION_COLORS[cat] || [150, 150, 150];
          doc.setFillColor(...color);
          doc.circle(24, tocY - 1.5, 2, "F");
          doc.setTextColor(220, 220, 220);
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          doc.text(`${tocIdx}. ${opt.label}`, 30, tocY);
          doc.setTextColor(120, 120, 120);
          doc.setFontSize(8);
          doc.text(opt.description, 30, tocY + 5);
          tocY += 13;
          tocIdx++;
        }
      });

      // Confidential footer
      doc.setTextColor(80, 80, 80);
      doc.setFontSize(7);
      doc.text("CONFIDENTIAL - FOR INTERNAL USE ONLY", pageWidth / 2, pageHeight - 15, { align: "center" });

      // ---- REPORT PAGES ----
      const newPage = () => { doc.addPage(); yPos = 20; };

      const addSectionHeader = (title: string, category: string) => {
        newPage();
        const color = SECTION_COLORS[category] || [100, 100, 100];
        // Color bar at top
        doc.setFillColor(...color);
        doc.rect(0, 0, pageWidth, 3, "F");
        // Section title
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 30, 30);
        doc.text(title.toUpperCase(), 14, 18);
        // Category badge
        doc.setFontSize(8);
        doc.setTextColor(...color);
        doc.text(category.toUpperCase(), 14, 24);
        // Divider
        doc.setDrawColor(...color);
        doc.setLineWidth(0.4);
        doc.line(14, 27, pageWidth - 14, 27);
        yPos = 34;
      };

      const addSubHeader = (title: string) => {
        if (yPos > 260) { newPage(); }
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(50, 50, 50);
        doc.text(title, 14, yPos);
        yPos += 7;
        doc.setFont("helvetica", "normal");
      };

      const addStatsRow = (stats: { label: string; value: string; color?: [number, number, number] }[]) => {
        if (yPos > 260) { newPage(); }
        const boxWidth = (pageWidth - 28 - (stats.length - 1) * 4) / stats.length;
        stats.forEach((s, i) => {
          const x = 14 + i * (boxWidth + 4);
          doc.setFillColor(245, 245, 245);
          doc.roundedRect(x, yPos, boxWidth, 16, 2, 2, "F");
          if (s.color) {
            doc.setFillColor(...s.color);
            doc.rect(x, yPos, 3, 16, "F");
          }
          doc.setFontSize(7);
          doc.setTextColor(100, 100, 100);
          doc.text(s.label.toUpperCase(), x + 6, yPos + 5);
          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 30, 30);
          doc.text(s.value, x + 6, yPos + 12);
          doc.setFont("helvetica", "normal");
        });
        yPos += 22;
      };

      const addTable = (headers: string[], rows: string[][], categoryColor?: [number, number, number]) => {
        if (yPos > 260) { newPage(); }
        const headColor: [number, number, number] = categoryColor || HEADER_BG;
        autoTable(doc, {
          startY: yPos,
          head: [headers],
          body: rows,
          margin: { left: 14, right: 14 },
          styles: { fontSize: 7, cellPadding: 2.5, textColor: [40, 40, 40], lineColor: [220, 220, 220], lineWidth: 0.1 },
          headStyles: { fillColor: headColor, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
          alternateRowStyles: { fillColor: [250, 250, 250] },
          columnStyles: {},
          didParseCell: (data) => {
            // Color-code status cells
            const text = String(data.cell.raw || "");
            if (data.section === "body") {
              if (text === "LOW STOCK" || text === "OVERDUE") {
                data.cell.styles.textColor = [220, 38, 38];
                data.cell.styles.fontStyle = "bold";
              } else if (text === "OK" || text === "Active" || text === "approved" || text === "paid") {
                data.cell.styles.textColor = [16, 124, 65];
              } else if (text === "pending") {
                data.cell.styles.textColor = [180, 83, 9];
              } else if (text === "rejected" || text === "Inactive") {
                data.cell.styles.textColor = [220, 38, 38];
              }
            }
          },
        });
        yPos = (doc as any).lastAutoTable.finalY + 8;
      };

      const addNote = (text: string) => {
        if (yPos > 270) { newPage(); }
        doc.setFontSize(7);
        doc.setTextColor(130, 130, 130);
        doc.text(text, 14, yPos);
        yPos += 5;
        doc.setTextColor(30, 30, 30);
      };

      // Week helpers
      const getWeeksInRange = () => {
        if (isWeekly) return [{ start: dateStart, end: dateEnd, label: `${format(dateStart, "dd MMM")} - ${format(dateEnd, "dd MMM")}` }];
        const weeks = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 });
        return weeks.map((ws, idx) => {
          const we = endOfWeek(ws, { weekStartsOn: 1 });
          const s = ws < monthStart ? monthStart : ws;
          const e = we > monthEnd ? monthEnd : we;
          return { start: s, end: e, label: `Week ${idx + 1}: ${format(s, "dd MMM")} - ${format(e, "dd MMM")}` };
        });
      };

      // ==========================================
      // SECTION: EMPLOYEES
      // ==========================================
      if (selectedReports.has("employees") && results.employees) {
        addSectionHeader("Employee Summary", "People");
        const emps = results.employees;
        const active = emps.filter((e: any) => e.active);
        const inactive = emps.filter((e: any) => !e.active);
        const depts = [...new Set(active.map((e: any) => e.department || "Unassigned"))] as string[];

        addStatsRow([
          { label: "Total Employees", value: String(emps.length), color: [41, 98, 255] },
          { label: "Active", value: String(active.length), color: [16, 124, 65] },
          { label: "Inactive", value: String(inactive.length), color: [220, 38, 38] },
          { label: "Departments", value: String(depts.length), color: [124, 58, 237] },
        ]);

        addSubHeader("Active Employee Roster");
        addTable(
          ["Name", "Code", "Department", "Job Title", "Pay Rate", "Status"],
          active.map((e: any) => [e.name, e.employee_code, e.department || "-", e.job_title || "-", `$${Number(e.pay_rate).toFixed(2)}/hr`, "Active"]),
          SECTION_COLORS.People
        );

        if (inactive.length > 0) {
          addSubHeader("Inactive Employees");
          addTable(
            ["Name", "Code", "Department", "Job Title"],
            inactive.map((e: any) => [e.name, e.employee_code, e.department || "-", e.job_title || "-"]),
            SECTION_COLORS.People
          );
        }

        // Department headcount
        addSubHeader("Headcount by Department");
        const deptCounts: Record<string, number> = {};
        active.forEach((e: any) => { const d = e.department || "Unassigned"; deptCounts[d] = (deptCounts[d] || 0) + 1; });
        addTable(
          ["Department", "Headcount", "% of Total"],
          Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).map(([dept, count]) => [dept, String(count), `${((count / active.length) * 100).toFixed(1)}%`]),
          SECTION_COLORS.People
        );
      }

      // ==========================================
      // SECTION: SHIFTS / ROSTER
      // ==========================================
      if (selectedReports.has("shifts") && results.shifts) {
        addSectionHeader("Roster / Shifts", "Operations");
        const shifts = results.shifts;
        const totalHours = shifts.reduce((s: number, sh: any) => s + (Number(sh.hours_worked) || 0), 0);
        const uniqueEmps = new Set(shifts.map((sh: any) => sh.employee_id)).size;

        addStatsRow([
          { label: "Total Shifts", value: String(shifts.length), color: [16, 124, 65] },
          { label: "Total Hours", value: totalHours.toFixed(1), color: [41, 98, 255] },
          { label: "Employees Rostered", value: String(uniqueEmps), color: [124, 58, 237] },
          { label: "Avg Hours/Shift", value: shifts.length ? (totalHours / shifts.length).toFixed(1) : "0", color: [180, 83, 9] },
        ]);

        if (!isWeekly) {
          const weeks = getWeeksInRange();
          weeks.forEach(w => {
            const weekShifts = shifts.filter((sh: any) => {
              const d = parseISO(sh.date);
              return d >= w.start && d <= w.end;
            });
            if (weekShifts.length > 0) {
              addSubHeader(w.label);
              const wHours = weekShifts.reduce((s: number, sh: any) => s + (Number(sh.hours_worked) || 0), 0);
              addNote(`${weekShifts.length} shifts | ${wHours.toFixed(1)} total hours`);
              addTable(
                ["Employee", "Date", "Day", "Start", "End", "Break", "Hours"],
                weekShifts.map((sh: any) => [sh.employees?.name || "-", format(parseISO(sh.date), "dd MMM"), sh.day_of_week, sh.start_time?.slice(0, 5), sh.end_time?.slice(0, 5), `${sh.break_minutes}m`, Number(sh.hours_worked || 0).toFixed(2)]),
                SECTION_COLORS.Operations
              );
            }
          });

          addSubHeader("Monthly Summary by Employee");
          const byEmp: Record<string, { name: string; shifts: number; hours: number; dept: string }> = {};
          shifts.forEach((sh: any) => {
            const n = sh.employees?.name || "Unknown";
            if (!byEmp[n]) byEmp[n] = { name: n, shifts: 0, hours: 0, dept: sh.employees?.department || "-" };
            byEmp[n].shifts++;
            byEmp[n].hours += Number(sh.hours_worked) || 0;
          });
          addTable(
            ["Employee", "Department", "Shifts", "Total Hours", "Avg Hrs/Shift"],
            Object.values(byEmp).sort((a, b) => b.hours - a.hours).map(e => [e.name, e.dept, String(e.shifts), e.hours.toFixed(2), e.shifts ? (e.hours / e.shifts).toFixed(1) : "0"]),
            SECTION_COLORS.Operations
          );
        } else {
          addTable(
            ["Employee", "Date", "Day", "Start", "End", "Break", "Hours"],
            shifts.map((sh: any) => [sh.employees?.name || "-", format(parseISO(sh.date), "dd MMM"), sh.day_of_week, sh.start_time?.slice(0, 5), sh.end_time?.slice(0, 5), `${sh.break_minutes}m`, Number(sh.hours_worked || 0).toFixed(2)]),
            SECTION_COLORS.Operations
          );
        }
      }

      // ==========================================
      // SECTION: TIMESHEETS
      // ==========================================
      if (selectedReports.has("timesheets") && results.clockEvents) {
        addSectionHeader("Timesheets & Attendance", "Operations");
        const events = results.clockEvents;

        const byDateEmp: Record<string, Record<string, any[]>> = {};
        events.forEach((ev: any) => {
          const d = format(new Date(ev.timestamp), "yyyy-MM-dd");
          const n = ev.employees?.name || "Unknown";
          if (!byDateEmp[d]) byDateEmp[d] = {};
          if (!byDateEmp[d][n]) byDateEmp[d][n] = [];
          byDateEmp[d][n].push(ev);
        });

        const uniqueDays = Object.keys(byDateEmp).length;
        const uniqueEmployees = new Set(events.map((e: any) => e.employee_id)).size;
        const clockInCount = events.filter((e: any) => e.event_type === "clock_in").length;

        addStatsRow([
          { label: "Clock Events", value: String(events.length), color: [16, 124, 65] },
          { label: "Working Days", value: String(uniqueDays), color: [41, 98, 255] },
          { label: "Employees Active", value: String(uniqueEmployees), color: [124, 58, 237] },
          { label: "Total Clock-Ins", value: String(clockInCount), color: [180, 83, 9] },
        ]);

        const dailyRows: string[][] = [];
        Object.entries(byDateEmp).sort().forEach(([date, emps]) => {
          Object.entries(emps).forEach(([name, evts]) => {
            const clockIn = evts.find((e: any) => e.event_type === "clock_in");
            const clockOut = [...evts].reverse().find((e: any) => e.event_type === "clock_out");
            const breakStart = evts.find((e: any) => e.event_type === "break_start");
            const breakEnd = [...evts].reverse().find((e: any) => e.event_type === "break_end");
            const inTime = clockIn ? format(new Date(clockIn.timestamp), "hh:mm a") : "-";
            const outTime = clockOut ? format(new Date(clockOut.timestamp), "hh:mm a") : "-";
            let breakMins = "-";
            if (breakStart && breakEnd) {
              breakMins = `${Math.round((new Date(breakEnd.timestamp).getTime() - new Date(breakStart.timestamp).getTime()) / 60000)}m`;
            }
            let hours = "-";
            if (clockIn && clockOut) {
              const diff = (new Date(clockOut.timestamp).getTime() - new Date(clockIn.timestamp).getTime()) / 3600000;
              hours = diff.toFixed(2);
            }
            dailyRows.push([format(parseISO(date), "dd MMM"), name, inTime, outTime, breakMins, hours]);
          });
        });

        if (dailyRows.length > 0) {
          addSubHeader("Daily Attendance Log");
          addTable(["Date", "Employee", "Clock In", "Clock Out", "Break", "Total Hrs"], dailyRows, SECTION_COLORS.Operations);
        }
      }

      // ==========================================
      // SECTION: EMPLOYEE PAYROLL
      // ==========================================
      if (selectedReports.has("employee_payroll") && results.payroll) {
        addSectionHeader("Employee Payroll", "Finance");
        const payroll = results.payroll;
        const totalEmpPay = payroll.reduce((s: number, p: any) => s + Number(p.employee_pay), 0);
        const totalHours = payroll.reduce((s: number, p: any) => s + Number(p.employee_hours), 0);
        const avgRate = totalHours > 0 ? totalEmpPay / totalHours : 0;

        addStatsRow([
          { label: "Total Employee Pay", value: `$${totalEmpPay.toFixed(2)}`, color: [16, 124, 65] },
          { label: "Total Hours", value: totalHours.toFixed(1), color: [41, 98, 255] },
          { label: "Avg $/Hr", value: `$${avgRate.toFixed(2)}`, color: [124, 58, 237] },
          { label: "Entries", value: String(payroll.length), color: [180, 83, 9] },
        ]);

        addSubHeader("Employee Pay Entries");
        addTable(
          ["Employee", "Department", "Period", "Hours", "Employee Pay", "Rate $/Hr"],
          payroll.map((p: any) => {
            const hrs = Number(p.employee_hours);
            const pay = Number(p.employee_pay);
            return [p.employees?.name || "-", p.employees?.department || "-", p.period, hrs.toFixed(2), `$${pay.toFixed(2)}`, hrs > 0 ? `$${(pay / hrs).toFixed(2)}` : "-"];
          }),
          SECTION_COLORS.Finance
        );

        // Department breakdown
        const deptPay: Record<string, { hours: number; pay: number; count: number }> = {};
        payroll.forEach((p: any) => {
          const dept = p.employees?.department || "Unassigned";
          if (!deptPay[dept]) deptPay[dept] = { hours: 0, pay: 0, count: 0 };
          deptPay[dept].hours += Number(p.employee_hours);
          deptPay[dept].pay += Number(p.employee_pay);
          deptPay[dept].count++;
        });

        if (Object.keys(deptPay).length > 0) {
          addSubHeader("Employee Pay by Department");
          addTable(
            ["Department", "Entries", "Hours", "Total Pay", "% of Total", "Avg $/Hr"],
            Object.entries(deptPay).sort((a, b) => b[1].pay - a[1].pay).map(([dept, d]) => [
              dept, String(d.count), d.hours.toFixed(1), `$${d.pay.toFixed(2)}`,
              totalEmpPay ? `${((d.pay / totalEmpPay) * 100).toFixed(1)}%` : "0%",
              d.hours ? `$${(d.pay / d.hours).toFixed(2)}` : "-"
            ]),
            SECTION_COLORS.Finance
          );
        }
      }

      // ==========================================
      // SECTION: ADMIN PAYROLL
      // ==========================================
      if (selectedReports.has("admin_payroll") && results.payroll) {
        addSectionHeader("Admin Payroll", "Finance");
        const payroll = results.payroll;
        const totalAdminPay = payroll.reduce((s: number, p: any) => s + Number(p.admin_pay), 0);
        const totalHours = payroll.reduce((s: number, p: any) => s + Number(p.employee_hours), 0);
        const avgRate = totalHours > 0 ? totalAdminPay / totalHours : 0;
        const gstAmount = totalAdminPay / 11; // GST component (1/11th of total)

        addStatsRow([
          { label: "Total Admin Pay (Inc GST)", value: `$${totalAdminPay.toFixed(2)}`, color: [220, 38, 38] },
          { label: "GST Component", value: `$${gstAmount.toFixed(2)}`, color: [180, 83, 9] },
          { label: "Total Hours", value: totalHours.toFixed(1), color: [41, 98, 255] },
          { label: "Avg $/Hr", value: `$${avgRate.toFixed(2)}`, color: [124, 58, 237] },
        ]);

        addSubHeader("Admin Pay Entries");
        addTable(
          ["Employee", "Department", "Period", "Hours", "Admin Pay", "Rate $/Hr"],
          payroll.map((p: any) => {
            const hrs = Number(p.employee_hours);
            const pay = Number(p.admin_pay);
            return [p.employees?.name || "-", p.employees?.department || "-", p.period, hrs.toFixed(2), `$${pay.toFixed(2)}`, hrs > 0 ? `$${(pay / hrs).toFixed(2)}` : "-"];
          }),
          SECTION_COLORS.Finance
        );

        // Department breakdown
        const deptPay: Record<string, { hours: number; pay: number; count: number }> = {};
        payroll.forEach((p: any) => {
          const dept = p.employees?.department || "Unassigned";
          if (!deptPay[dept]) deptPay[dept] = { hours: 0, pay: 0, count: 0 };
          deptPay[dept].hours += Number(p.employee_hours);
          deptPay[dept].pay += Number(p.admin_pay);
          deptPay[dept].count++;
        });

        if (Object.keys(deptPay).length > 0) {
          addSubHeader("Admin Pay by Department");
          addTable(
            ["Department", "Entries", "Hours", "Total Pay", "% of Total", "Avg $/Hr"],
            Object.entries(deptPay).sort((a, b) => b[1].pay - a[1].pay).map(([dept, d]) => [
              dept, String(d.count), d.hours.toFixed(1), `$${d.pay.toFixed(2)}`,
              totalAdminPay ? `${((d.pay / totalAdminPay) * 100).toFixed(1)}%` : "0%",
              d.hours ? `$${(d.pay / d.hours).toFixed(2)}` : "-"
            ]),
            SECTION_COLORS.Finance
          );
        }
      }

      // ==========================================
      // SECTION: LABOUR COST ANALYSIS (based on Admin Payroll)
      // ==========================================
      if (selectedReports.has("labour_cost") && results.payroll) {
        addSectionHeader("Labour Cost Analysis", "Finance");
        const payroll = results.payroll;

        // Aggregate by department from payroll entries using admin_pay
        const deptCosts: Record<string, { hours: number; cost: number; empCount: Set<string> }> = {};
        payroll.forEach((p: any) => {
          const dept = p.employees?.department || "Unassigned";
          if (!deptCosts[dept]) deptCosts[dept] = { hours: 0, cost: 0, empCount: new Set() };
          deptCosts[dept].hours += Number(p.employee_hours);
          deptCosts[dept].cost += Number(p.admin_pay);
          deptCosts[dept].empCount.add(p.employee_id);
        });

        const totalLabourCost = Object.values(deptCosts).reduce((s, d) => s + d.cost, 0);
        const totalLabourHours = Object.values(deptCosts).reduce((s, d) => s + d.hours, 0);
        const gstComponent = totalLabourCost / 11;

        addStatsRow([
          { label: "Total Labour Cost", value: `$${totalLabourCost.toFixed(2)}`, color: [220, 38, 38] },
          { label: "Excl. GST", value: `$${(totalLabourCost - gstComponent).toFixed(2)}`, color: [180, 83, 9] },
          { label: "Total Hours", value: totalLabourHours.toFixed(1), color: [41, 98, 255] },
          { label: "Avg Cost/Hour", value: totalLabourHours ? `$${(totalLabourCost / totalLabourHours).toFixed(2)}` : "$0", color: [124, 58, 237] },
        ]);

        addSubHeader("Cost by Department (Admin Payroll)");
        addTable(
          ["Department", "Employees", "Hours", "Admin Pay Cost", "% of Total", "Avg $/Hr"],
          Object.entries(deptCosts).sort((a, b) => b[1].cost - a[1].cost).map(([dept, d]) => [
            dept, String(d.empCount.size), d.hours.toFixed(1), `$${d.cost.toFixed(2)}`,
            totalLabourCost ? `${((d.cost / totalLabourCost) * 100).toFixed(1)}%` : "0%",
            d.hours ? `$${(d.cost / d.hours).toFixed(2)}` : "-"
          ]),
          SECTION_COLORS.Finance
        );

        // Employee cost ranking from payroll
        const empCosts: Record<string, { name: string; hours: number; cost: number; dept: string }> = {};
        payroll.forEach((p: any) => {
          const n = p.employees?.name || "Unknown";
          if (!empCosts[n]) empCosts[n] = { name: n, hours: 0, cost: 0, dept: p.employees?.department || "-" };
          empCosts[n].hours += Number(p.employee_hours);
          empCosts[n].cost += Number(p.admin_pay);
        });

        addSubHeader("Employee Labour Cost Ranking (Admin Pay)");
        addTable(
          ["Employee", "Department", "Hours", "Admin Pay Cost", "Avg $/Hr"],
          Object.values(empCosts).sort((a, b) => b.cost - a.cost).map(e => [e.name, e.dept, e.hours.toFixed(1), `$${e.cost.toFixed(2)}`, e.hours ? `$${(e.cost / e.hours).toFixed(2)}` : "-"]),
          SECTION_COLORS.Finance
        );

        addNote("* Labour cost analysis is based on Admin Payroll (GST-inclusive rates) for accurate financial reporting.");
      }

      // ==========================================
      // SECTION: REQUESTS
      // ==========================================
      if (selectedReports.has("requests") && results.requests) {
        addSectionHeader("Employee Requests", "People");
        const reqs = results.requests;
        const pending = reqs.filter((r: any) => r.status === "pending").length;
        const approved = reqs.filter((r: any) => r.status === "approved").length;
        const rejected = reqs.filter((r: any) => r.status === "rejected").length;

        addStatsRow([
          { label: "Total Requests", value: String(reqs.length), color: [41, 98, 255] },
          { label: "Pending", value: String(pending), color: [180, 83, 9] },
          { label: "Approved", value: String(approved), color: [16, 124, 65] },
          { label: "Rejected", value: String(rejected), color: [220, 38, 38] },
        ]);

        // By type breakdown
        const byType: Record<string, number> = {};
        reqs.forEach((r: any) => { byType[r.request_type] = (byType[r.request_type] || 0) + 1; });
        if (Object.keys(byType).length > 1) {
          addSubHeader("Requests by Type");
          addTable(
            ["Request Type", "Count", "% of Total"],
            Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, c]) => [t, String(c), `${((c / reqs.length) * 100).toFixed(1)}%`]),
            SECTION_COLORS.People
          );
        }

        addSubHeader("All Requests");
        addTable(
          ["Employee", "Type", "Status", "Start", "End", "Reason", "Submitted"],
          reqs.map((r: any) => [r.employees?.name || "-", r.request_type, r.status, r.start_date || "-", r.end_date || "-", (r.reason || "-").slice(0, 40), format(new Date(r.created_at), "dd MMM")]),
          SECTION_COLORS.People
        );
      }

      // ==========================================
      // SECTION: INVENTORY
      // ==========================================
      if (selectedReports.has("inventory") && results.inventory) {
        addSectionHeader("FOH Inventory", "Stock");
        const items = results.inventory;
        const lowStock = items.filter((i: any) => i.current_count <= i.min_count);
        const categories = [...new Set(items.map((i: any) => i.category || "General"))] as string[];

        addStatsRow([
          { label: "Total Items", value: String(items.length), color: [124, 58, 237] },
          { label: "Low Stock Alerts", value: String(lowStock.length), color: [220, 38, 38] },
          { label: "Categories", value: String(categories.length), color: [41, 98, 255] },
        ]);

        if (lowStock.length > 0) {
          addSubHeader("Low Stock Alerts");
          addTable(
            ["Item", "Category", "Current", "Minimum", "Unit", "Status"],
            lowStock.map((i: any) => [i.name, i.category || "-", String(i.current_count), String(i.min_count), i.unit || "-", "LOW STOCK"]),
            SECTION_COLORS.Stock
          );
        }

        addSubHeader("Full Inventory");
        addTable(
          ["Item", "Category", "Current Stock", "Min Stock", "Unit", "Status"],
          items.map((i: any) => [i.name, i.category || "-", String(i.current_count), String(i.min_count), i.unit || "-", i.current_count <= i.min_count ? "LOW STOCK" : "OK"]),
          SECTION_COLORS.Stock
        );
      }

      // ==========================================
      // SECTION: BAR INVENTORY
      // ==========================================
      if (selectedReports.has("bar_inventory") && results.barInventory) {
        addSectionHeader("Bar Inventory & Orders", "Stock");
        const items = results.barInventory;
        const orders = results.barOrders || [];
        const lowStock = items.filter((i: any) => i.current_count <= i.min_count);

        addStatsRow([
          { label: "Bar Items", value: String(items.length), color: [124, 58, 237] },
          { label: "Low Stock", value: String(lowStock.length), color: [220, 38, 38] },
          { label: "Orders This Period", value: String(orders.length), color: [41, 98, 255] },
        ]);

        addSubHeader("Bar Stock Levels");
        addTable(
          ["Item", "Category", "Current", "Min", "Unit", "Status"],
          items.map((i: any) => [i.name, i.category || "-", String(i.current_count), String(i.min_count), i.unit || "-", i.current_count <= i.min_count ? "LOW STOCK" : "OK"]),
          SECTION_COLORS.Stock
        );

        if (orders.length > 0) {
          addSubHeader("Order History");
          addTable(
            ["Item", "Quantity", "Status", "Date"],
            orders.map((o: any) => [o.bar_inventory_items?.name || "-", String(o.quantity), o.status, format(new Date(o.created_at), "dd MMM")]),
            SECTION_COLORS.Stock
          );
        }
      }

      // ==========================================
      // SECTION: EVENTS
      // ==========================================
      if (selectedReports.has("events") && results.events) {
        addSectionHeader("Events & Functions", "Operations");
        const events = results.events;
        const totalGuests = events.reduce((s: number, e: any) => s + (e.adult_guests || 0) + (e.kids_guests || 0), 0);
        const avgGuests = events.length ? Math.round(totalGuests / events.length) : 0;

        addStatsRow([
          { label: "Total Events", value: String(events.length), color: [16, 124, 65] },
          { label: "Total Guests", value: String(totalGuests), color: [41, 98, 255] },
          { label: "Avg Guests/Event", value: String(avgGuests), color: [124, 58, 237] },
        ]);

        addSubHeader("Event Schedule");
        addTable(
          ["Date", "Type", "Space", "Time", "Host", "Adults", "Kids", "Tables", "Banquet Tier", "Bev Package"],
          events.map((e: any) => [
            format(parseISO(e.date), "dd MMM"), e.event_type || "-", e.event_space || "-", e.event_time || "-",
            e.host_name || "-", String(e.adult_guests || 0), String(e.kids_guests || 0),
            String(e.num_tables || 0), e.banquet_tier || "-", e.bev_package || "-"
          ]),
          SECTION_COLORS.Operations
        );

        // Setup details for each event
        events.forEach((e: any) => {
          if (e.host_name || e.notes) {
            addSubHeader(`${format(parseISO(e.date), "dd MMM")} - ${e.event_type || "Event"} (${e.host_name || "No host"})`);
            const details: string[][] = [];
            if (e.cold_sparkles) details.push(["Cold Sparkles", "Yes"]);
            if (e.dry_ice) details.push(["Dry Ice", "Yes"]);
            if (e.red_carpet) details.push(["Red Carpet", "Yes"]);
            if (e.smoke_machine) details.push(["Smoke Machine", "Yes"]);
            if (e.decor_access) details.push(["Decor Access", "Yes"]);
            if (e.live_stall) details.push(["Live Stall", e.live_stall_details || "Yes"]);
            if (e.tablecloth_color && e.tablecloth_color !== "white") details.push(["Tablecloth Color", e.tablecloth_color]);
            if (e.host_contact_number) details.push(["Host Contact", e.host_contact_number]);
            if (e.notes) details.push(["Notes", e.notes.slice(0, 80)]);
            if (details.length > 0) {
              addTable(["Detail", "Value"], details, SECTION_COLORS.Operations);
            }
          }
        });
      }

      // ==========================================
      // SECTION: SERVICE & MAINTENANCE
      // ==========================================
      if (selectedReports.has("service") && results.service) {
        addSectionHeader("Service & Maintenance", "Compliance");
        const tasks = results.service;
        const activeTasks = tasks.filter((t: any) => t.active);
        const overdue = activeTasks.filter((t: any) => t.next_service_date && new Date(t.next_service_date) < new Date());
        const upcoming = activeTasks.filter((t: any) => {
          if (!t.next_service_date) return false;
          const d = new Date(t.next_service_date);
          const now = new Date();
          return d >= now && d <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        });

        addStatsRow([
          { label: "Active Tasks", value: String(activeTasks.length), color: [16, 124, 65] },
          { label: "Overdue", value: String(overdue.length), color: [220, 38, 38] },
          { label: "Due This Week", value: String(upcoming.length), color: [180, 83, 9] },
        ]);

        if (overdue.length > 0) {
          addSubHeader("Overdue Tasks");
          addTable(
            ["Task", "Frequency", "Last Service", "Due Date", "Status"],
            overdue.map((t: any) => [t.name, `Every ${t.frequency_days} days`, t.last_service_date || "Never", t.next_service_date, "OVERDUE"]),
            SECTION_COLORS.Compliance
          );
        }

        addSubHeader("All Maintenance Tasks");
        addTable(
          ["Task", "Description", "Frequency", "Last Service", "Next Due", "Status"],
          tasks.map((t: any) => [
            t.name, (t.description || "-").slice(0, 40), `${t.frequency_days}d`,
            t.last_service_date || "Never", t.next_service_date || "-",
            !t.active ? "Inactive" : (t.next_service_date && new Date(t.next_service_date) < new Date() ? "OVERDUE" : "Active")
          ]),
          SECTION_COLORS.Compliance
        );
      }

      // ==========================================
      // SECTION: AUDIT LOGS
      // ==========================================
      if (selectedReports.has("audit") && results.audit) {
        addSectionHeader("Audit Trail", "Compliance");
        const logs = results.audit;

        // Action type breakdown
        const byAction: Record<string, number> = {};
        logs.forEach((l: any) => { byAction[l.action] = (byAction[l.action] || 0) + 1; });

        addStatsRow([
          { label: "Total Entries", value: String(logs.length), color: [107, 114, 128] },
          { label: "Action Types", value: String(Object.keys(byAction).length), color: [41, 98, 255] },
        ]);

        addSubHeader("Activity Breakdown");
        addTable(
          ["Action", "Count", "% of Total"],
          Object.entries(byAction).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([action, count]) => [action.replace(/_/g, " "), String(count), `${((count / logs.length) * 100).toFixed(1)}%`]),
          SECTION_COLORS.Compliance
        );

        addSubHeader("Recent Activity Log");
        addTable(
          ["Date/Time", "Action", "Details"],
          logs.slice(0, 150).map((l: any) => {
            const details = l.details || {};
            const summary = Object.entries(details).filter(([k]) => ["employee_name", "date", "status", "business_name"].includes(k)).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", ");
            return [format(new Date(l.timestamp), "dd MMM hh:mm a"), l.action.replace(/_/g, " "), summary.slice(0, 70) || "-"];
          }),
          SECTION_COLORS.Compliance
        );
      }

      // ==========================================
      // SECTION: DEPARTMENT BREAKDOWN
      // ==========================================
      if (selectedReports.has("dept_breakdown") && results.employees) {
        addSectionHeader("Department Breakdown", "Analytics");
        const employees = results.employees.filter((e: any) => e.active);
        const shifts = results.shifts || [];
        const clockEvents = results.clockEvents || [];

        const deptData: Record<string, { headcount: number; shiftHours: number; shiftCount: number; clockDays: Set<string>; avgRate: number[]; }> = {};

        employees.forEach((e: any) => {
          const dept = e.department || "Unassigned";
          if (!deptData[dept]) deptData[dept] = { headcount: 0, shiftHours: 0, shiftCount: 0, clockDays: new Set(), avgRate: [] };
          deptData[dept].headcount++;
          deptData[dept].avgRate.push(Number(e.pay_rate) || 0);
        });

        shifts.forEach((sh: any) => {
          const dept = sh.employees?.department || "Unassigned";
          if (!deptData[dept]) deptData[dept] = { headcount: 0, shiftHours: 0, shiftCount: 0, clockDays: new Set(), avgRate: [] };
          deptData[dept].shiftHours += Number(sh.hours_worked) || 0;
          deptData[dept].shiftCount++;
        });

        clockEvents.forEach((ev: any) => {
          if (ev.event_type === "clock_in") {
            const dept = ev.employees?.department || "Unassigned";
            const d = format(new Date(ev.timestamp), "yyyy-MM-dd");
            if (deptData[dept]) deptData[dept].clockDays.add(`${ev.employee_id}-${d}`);
          }
        });

        const totalHeadcount = employees.length;
        const totalShiftHours = Object.values(deptData).reduce((s, d) => s + d.shiftHours, 0);

        addStatsRow([
          { label: "Departments", value: String(Object.keys(deptData).length), color: [220, 38, 38] },
          { label: "Total Headcount", value: String(totalHeadcount), color: [41, 98, 255] },
          { label: "Total Shift Hours", value: totalShiftHours.toFixed(1), color: [16, 124, 65] },
        ]);

        addSubHeader("Department Performance Overview");
        addTable(
          ["Department", "Headcount", "% Staff", "Shifts", "Hours", "% Hours", "Avg Pay Rate", "Attendance Days"],
          Object.entries(deptData).sort((a, b) => b[1].shiftHours - a[1].shiftHours).map(([dept, d]) => [
            dept, String(d.headcount),
            totalHeadcount ? `${((d.headcount / totalHeadcount) * 100).toFixed(1)}%` : "0%",
            String(d.shiftCount), d.shiftHours.toFixed(1),
            totalShiftHours ? `${((d.shiftHours / totalShiftHours) * 100).toFixed(1)}%` : "0%",
            d.avgRate.length ? `$${(d.avgRate.reduce((a, b) => a + b, 0) / d.avgRate.length).toFixed(2)}` : "-",
            String(d.clockDays.size)
          ]),
          SECTION_COLORS.Analytics
        );
      }

      // ---- PAGE FOOTERS ----
      const totalPages = doc.getNumberOfPages();
      for (let i = 2; i <= totalPages; i++) {
        doc.setPage(i);
        // Top right page number
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${i - 1} of ${totalPages - 1}`, pageWidth - 14, 8, { align: "right" });
        // Bottom footer
        doc.setDrawColor(220, 220, 220);
        doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
        doc.text(`${business.name}  |  ${periodLabel}  |  Confidential`, pageWidth / 2, pageHeight - 8, { align: "center" });
      }

      // Save
      const fileName = isWeekly
        ? `${business.name.replace(/[^a-zA-Z0-9]/g, "_")}_Weekly_Report_${format(dateStart, "dd_MMM")}_${format(dateEnd, "dd_MMM_yyyy")}.pdf`
        : `${business.name.replace(/[^a-zA-Z0-9]/g, "_")}_Monthly_Report_${format(monthStart, "MMM_yyyy")}.pdf`;
      doc.save(fileName);

      toast({ title: "Report Generated", description: `${fileName} has been downloaded.` });
    } catch (err: any) {
      console.error("Report generation error:", err);
      toast({ title: "Error", description: err.message || "Failed to generate report", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  // Group options by category for UI
  const categories = [...new Set(REPORT_OPTIONS.map(r => r.category))];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" /> Business Reports
        </CardTitle>
        <CardDescription>
          Generate comprehensive analytics reports with detailed breakdowns
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Period Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Select Month</Label>
            <Select value={selectedMonth} onValueChange={(v) => { setSelectedMonth(v); setSelectedWeek("full-month"); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3" />{o.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Period</Label>
            <Select value={selectedWeek} onValueChange={setSelectedWeek}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full-month">Full Month (with weekly breakdown)</SelectItem>
                {weekOptions.map(w => (
                  <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Report Selection by Category */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Select Reports to Include</Label>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7">Select All</Button>
              <Button variant="ghost" size="sm" onClick={selectNone} className="text-xs h-7">Clear All</Button>
            </div>
          </div>
          {categories.map(cat => (
            <div key={cat} className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{cat}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {REPORT_OPTIONS.filter(o => o.category === cat).map(opt => (
                  <label
                    key={opt.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedReports.has(opt.id) ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                    }`}
                  >
                    <Checkbox
                      checked={selectedReports.has(opt.id)}
                      onCheckedChange={() => toggleReport(opt.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{opt.label}</p>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{cat}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Selected count */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {selectedReports.size} of {REPORT_OPTIONS.length} reports selected
          </span>
          {selectedWeek === "full-month" && (
            <Badge variant="secondary" className="text-xs">Includes weekly breakdown</Badge>
          )}
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={generating || selectedReports.size === 0}
          className="w-full gap-2"
          size="lg"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {generating ? "Generating Report..." : `Download ${selectedWeek === "full-month" ? "Monthly" : "Weekly"} Report PDF`}
        </Button>

        {selectedReports.size === 0 && (
          <p className="text-xs text-destructive text-center">Please select at least one report type.</p>
        )}
      </CardContent>
    </Card>
  );
}
