import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FileText, Download, Loader2, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addWeeks, isWithinInterval, parseISO, eachWeekOfInterval } from "date-fns";

const REPORT_OPTIONS = [
  { id: "employees", label: "Employee Summary", description: "Active employees, departments, job titles" },
  { id: "shifts", label: "Roster / Shifts", description: "Scheduled shifts, hours by employee" },
  { id: "timesheets", label: "Timesheets & Attendance", description: "Clock events, hours worked, breaks" },
  { id: "payroll", label: "Payroll", description: "Pay entries, totals by employee" },
  { id: "requests", label: "Employee Requests", description: "Leave, availability, and other requests" },
  { id: "inventory", label: "Inventory", description: "Stock levels, low stock alerts" },
  { id: "bar_inventory", label: "Bar Inventory", description: "Bar stock levels and orders" },
  { id: "events", label: "Roster Events", description: "Day events, banquet details" },
  { id: "service", label: "Service & Maintenance", description: "Maintenance tasks and schedules" },
  { id: "audit", label: "Audit Logs", description: "Admin actions and changes" },
] as const;

type ReportId = typeof REPORT_OPTIONS[number]["id"];

function getMonthOptions() {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: format(d, "yyyy-MM"),
      label: format(d, "MMMM yyyy"),
    });
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
      label: `Week ${idx + 1}: ${format(clampedStart, "dd MMM")} – ${format(clampedEnd, "dd MMM")}`,
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

      // First fetch employee IDs for this business
      const { data: empRows } = await supabase.from("employees").select("id").eq("business_id", businessId);
      const empIds = empRows?.map(e => e.id) || [];

      // Fetch all required data in parallel
      const fetchers: Record<string, Promise<any>> = {};
      const wrap = <T,>(q: PromiseLike<T>): Promise<T> => Promise.resolve(q);

      if (selectedReports.has("employees")) {
        fetchers.employees = wrap(supabase.from("employees").select("*").eq("business_id", businessId).then(r => r.data || []));
      }
      if (selectedReports.has("shifts") && empIds.length > 0) {
        fetchers.shifts = wrap(supabase.from("shifts").select("*, employees!inner(name, department)").gte("date", startStr).lte("date", endStr).in("employee_id", empIds).then(r => r.data || []));
      }
      if (selectedReports.has("timesheets") && empIds.length > 0) {
        fetchers.clockEvents = wrap(supabase.from("clock_events").select("*, employees!inner(name, department)").gte("timestamp", `${startStr}T00:00:00`).lte("timestamp", `${endStr}T23:59:59`).in("employee_id", empIds).then(r => r.data || []));
      }
      if (selectedReports.has("payroll") && empIds.length > 0) {
        fetchers.payroll = wrap(supabase.from("payroll_entries").select("*, employees!inner(name, department)").gte("period", startStr).lte("period", endStr).in("employee_id", empIds).then(r => r.data || []));
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

      // Generate PDF
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPos = 20;

      // Header
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(business.name, pageWidth / 2, yPos, { align: "center" });
      yPos += 8;
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      const periodLabel = isWeekly
        ? `Weekly Report: ${format(dateStart, "dd MMM yyyy")} – ${format(dateEnd, "dd MMM yyyy")}`
        : `Monthly Report: ${format(monthStart, "MMMM yyyy")}`;
      doc.text(periodLabel, pageWidth / 2, yPos, { align: "center" });
      yPos += 6;
      doc.setFontSize(8);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, pageWidth / 2, yPos, { align: "center" });
      yPos += 10;

      doc.setDrawColor(200); doc.line(14, yPos, pageWidth - 14, yPos); yPos += 6;

      const addSectionTitle = (title: string) => {
        if (yPos > 260) { doc.addPage(); yPos = 20; }
        doc.setFontSize(14); doc.setFont("helvetica", "bold");
        doc.text(title, 14, yPos); yPos += 8;
        doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      };

      const addSubTitle = (title: string) => {
        if (yPos > 265) { doc.addPage(); yPos = 20; }
        doc.setFontSize(10); doc.setFont("helvetica", "bold");
        doc.text(title, 14, yPos); yPos += 6;
        doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      };

      const addTable = (headers: string[], rows: string[][]) => {
        autoTable(doc, {
          startY: yPos,
          head: [headers],
          body: rows,
          margin: { left: 14, right: 14 },
          styles: { fontSize: 7, cellPadding: 2 },
          headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [245, 245, 245] },
          didDrawPage: () => {},
        });
        yPos = (doc as any).lastAutoTable.finalY + 8;
      };

      const addKeyValue = (items: [string, string][]) => {
        items.forEach(([k, v]) => {
          if (yPos > 275) { doc.addPage(); yPos = 20; }
          doc.setFont("helvetica", "bold"); doc.text(`${k}: `, 14, yPos);
          doc.setFont("helvetica", "normal"); doc.text(v, 14 + doc.getTextWidth(`${k}: `), yPos);
          yPos += 5;
        });
        yPos += 3;
      };

      // Helper to get weeks for monthly breakdown
      const getWeeksInRange = () => {
        if (isWeekly) return [{ start: dateStart, end: dateEnd, label: `${format(dateStart, "dd MMM")} – ${format(dateEnd, "dd MMM")}` }];
        const weeks = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 });
        return weeks.map((ws, idx) => {
          const we = endOfWeek(ws, { weekStartsOn: 1 });
          const s = ws < monthStart ? monthStart : ws;
          const e = we > monthEnd ? monthEnd : we;
          return { start: s, end: e, label: `Week ${idx + 1}: ${format(s, "dd MMM")} – ${format(e, "dd MMM")}` };
        });
      };

      // === EMPLOYEES ===
      if (selectedReports.has("employees") && results.employees) {
        addSectionTitle("📋 Employee Summary");
        const emps = results.employees;
        const active = emps.filter((e: any) => e.active);
        const inactive = emps.filter((e: any) => !e.active);
        const depts = [...new Set(active.map((e: any) => e.department || "Unassigned"))];
        
        addKeyValue([
          ["Total Employees", String(emps.length)],
          ["Active", String(active.length)],
          ["Inactive", String(inactive.length)],
          ["Departments", depts.join(", ") || "None"],
        ]);

        addTable(
          ["Name", "Code", "Department", "Job Title", "Status", "Pay Rate"],
          active.map((e: any) => [e.name, e.employee_code, e.department || "-", e.job_title || "-", e.active ? "Active" : "Inactive", `$${Number(e.pay_rate).toFixed(2)}`])
        );
      }

      // === SHIFTS / ROSTER ===
      if (selectedReports.has("shifts") && results.shifts) {
        addSectionTitle("📅 Roster / Shifts");
        const shifts = results.shifts;

        if (!isWeekly) {
          // Monthly overview
          const totalHours = shifts.reduce((s: number, sh: any) => s + (Number(sh.hours_worked) || 0), 0);
          addKeyValue([
            ["Total Shifts", String(shifts.length)],
            ["Total Scheduled Hours", totalHours.toFixed(2)],
          ]);

          // Weekly breakdown
          const weeks = getWeeksInRange();
          weeks.forEach(w => {
            const weekShifts = shifts.filter((sh: any) => {
              const d = parseISO(sh.date);
              return d >= w.start && d <= w.end;
            });
            if (weekShifts.length > 0) {
              addSubTitle(w.label);
              const wHours = weekShifts.reduce((s: number, sh: any) => s + (Number(sh.hours_worked) || 0), 0);
              doc.text(`Shifts: ${weekShifts.length} | Hours: ${wHours.toFixed(2)}`, 14, yPos); yPos += 5;
              addTable(
                ["Employee", "Date", "Day", "Start", "End", "Break (min)", "Hours"],
                weekShifts.map((sh: any) => [sh.employees?.name || "-", sh.date, sh.day_of_week, sh.start_time, sh.end_time, String(sh.break_minutes), Number(sh.hours_worked || 0).toFixed(2)])
              );
            }
          });

          // Overall summary by employee
          addSubTitle("Monthly Summary by Employee");
          const byEmp: Record<string, { name: string; shifts: number; hours: number }> = {};
          shifts.forEach((sh: any) => {
            const n = sh.employees?.name || "Unknown";
            if (!byEmp[n]) byEmp[n] = { name: n, shifts: 0, hours: 0 };
            byEmp[n].shifts++;
            byEmp[n].hours += Number(sh.hours_worked) || 0;
          });
          addTable(
            ["Employee", "Total Shifts", "Total Hours"],
            Object.values(byEmp).map(e => [e.name, String(e.shifts), e.hours.toFixed(2)])
          );
        } else {
          addTable(
            ["Employee", "Date", "Day", "Start", "End", "Break (min)", "Hours"],
            shifts.map((sh: any) => [sh.employees?.name || "-", sh.date, sh.day_of_week, sh.start_time, sh.end_time, String(sh.break_minutes), Number(sh.hours_worked || 0).toFixed(2)])
          );
        }
      }

      // === TIMESHEETS ===
      if (selectedReports.has("timesheets") && results.clockEvents) {
        addSectionTitle("⏰ Timesheets & Attendance");
        const events = results.clockEvents;
        
        // Group by date and employee
        const byDateEmp: Record<string, Record<string, any[]>> = {};
        events.forEach((ev: any) => {
          const d = format(new Date(ev.timestamp), "yyyy-MM-dd");
          const n = ev.employees?.name || "Unknown";
          if (!byDateEmp[d]) byDateEmp[d] = {};
          if (!byDateEmp[d][n]) byDateEmp[d][n] = [];
          byDateEmp[d][n].push(ev);
        });

        // Summary
        const uniqueDays = Object.keys(byDateEmp).length;
        const uniqueEmployees = new Set(events.map((e: any) => e.employee_id)).size;
        addKeyValue([
          ["Total Clock Events", String(events.length)],
          ["Days with Activity", String(uniqueDays)],
          ["Employees with Activity", String(uniqueEmployees)],
        ]);

        // Compute daily hours per employee
        const dailyRows: string[][] = [];
        Object.entries(byDateEmp).sort().forEach(([date, emps]) => {
          Object.entries(emps).forEach(([name, evts]) => {
            const clockIn = evts.find((e: any) => e.event_type === "clock_in");
            const clockOut = evts.find((e: any) => e.event_type === "clock_out");
            const inTime = clockIn ? format(new Date(clockIn.timestamp), "hh:mm a") : "-";
            const outTime = clockOut ? format(new Date(clockOut.timestamp), "hh:mm a") : "-";
            let hours = "-";
            if (clockIn && clockOut) {
              const diff = (new Date(clockOut.timestamp).getTime() - new Date(clockIn.timestamp).getTime()) / 3600000;
              hours = diff.toFixed(2);
            }
            dailyRows.push([date, name, inTime, outTime, hours]);
          });
        });

        if (dailyRows.length > 0) {
          addTable(["Date", "Employee", "Clock In", "Clock Out", "Hours"], dailyRows);
        }
      }

      // === PAYROLL ===
      if (selectedReports.has("payroll") && results.payroll) {
        addSectionTitle("💰 Payroll");
        const payroll = results.payroll;
        const totalEmpPay = payroll.reduce((s: number, p: any) => s + Number(p.employee_pay), 0);
        const totalAdminPay = payroll.reduce((s: number, p: any) => s + Number(p.admin_pay), 0);
        const totalHours = payroll.reduce((s: number, p: any) => s + Number(p.employee_hours), 0);

        addKeyValue([
          ["Total Entries", String(payroll.length)],
          ["Total Employee Pay", `$${totalEmpPay.toFixed(2)}`],
          ["Total Admin Pay", `$${totalAdminPay.toFixed(2)}`],
          ["Total Hours", totalHours.toFixed(2)],
        ]);

        addTable(
          ["Employee", "Period", "Hours", "Employee Pay", "Admin Pay", "Status"],
          payroll.map((p: any) => [p.employees?.name || "-", p.period, Number(p.employee_hours).toFixed(2), `$${Number(p.employee_pay).toFixed(2)}`, `$${Number(p.admin_pay).toFixed(2)}`, p.status])
        );
      }

      // === REQUESTS ===
      if (selectedReports.has("requests") && results.requests) {
        addSectionTitle("📝 Employee Requests");
        const reqs = results.requests;
        const pending = reqs.filter((r: any) => r.status === "pending").length;
        const approved = reqs.filter((r: any) => r.status === "approved").length;
        const rejected = reqs.filter((r: any) => r.status === "rejected").length;

        addKeyValue([
          ["Total Requests", String(reqs.length)],
          ["Pending", String(pending)],
          ["Approved", String(approved)],
          ["Rejected", String(rejected)],
        ]);

        addTable(
          ["Employee", "Type", "Status", "Start Date", "End Date", "Reason", "Created"],
          reqs.map((r: any) => [r.employees?.name || "-", r.request_type, r.status, r.start_date || "-", r.end_date || "-", r.reason || "-", format(new Date(r.created_at), "dd MMM")])
        );
      }

      // === INVENTORY ===
      if (selectedReports.has("inventory") && results.inventory) {
        addSectionTitle("📦 Inventory");
        const items = results.inventory;
        const lowStock = items.filter((i: any) => i.current_count <= i.min_count);

        addKeyValue([
          ["Total Items", String(items.length)],
          ["Low Stock Items", String(lowStock.length)],
        ]);

        addTable(
          ["Name", "Category", "Current Stock", "Min Stock", "Unit", "Status"],
          items.map((i: any) => [i.name, i.category || "-", String(i.current_count), String(i.min_count), i.unit || "-", i.current_count <= i.min_count ? "⚠️ LOW" : "OK"])
        );
      }

      // === BAR INVENTORY ===
      if (selectedReports.has("bar_inventory") && results.barInventory) {
        addSectionTitle("🍹 Bar Inventory");
        const items = results.barInventory;
        const orders = results.barOrders || [];
        const lowStock = items.filter((i: any) => i.current_count <= i.min_count);

        addKeyValue([
          ["Total Bar Items", String(items.length)],
          ["Low Stock Items", String(lowStock.length)],
          ["Orders in Period", String(orders.length)],
        ]);

        addTable(
          ["Name", "Category", "Current Stock", "Min Stock", "Unit", "Status"],
          items.map((i: any) => [i.name, i.category || "-", String(i.current_count), String(i.min_count), i.unit || "-", i.current_count <= i.min_count ? "⚠️ LOW" : "OK"])
        );

        if (orders.length > 0) {
          addSubTitle("Bar Orders");
          addTable(
            ["Item", "Quantity", "Status", "Date"],
            orders.map((o: any) => [o.bar_inventory_items?.name || "-", String(o.quantity), o.status, format(new Date(o.created_at), "dd MMM")])
          );
        }
      }

      // === EVENTS ===
      if (selectedReports.has("events") && results.events) {
        addSectionTitle("🎉 Roster Events");
        const events = results.events;

        addKeyValue([["Total Events", String(events.length)]]);

        addTable(
          ["Date", "Event Type", "Space", "Time", "Host", "Adults", "Kids", "Tables", "Banquet Tier"],
          events.map((e: any) => [e.date, e.event_type || "-", e.event_space || "-", e.event_time || "-", e.host_name || "-", String(e.adult_guests || 0), String(e.kids_guests || 0), String(e.num_tables || 0), e.banquet_tier || "-"])
        );
      }

      // === SERVICE & MAINTENANCE ===
      if (selectedReports.has("service") && results.service) {
        addSectionTitle("🔧 Service & Maintenance");
        const tasks = results.service;
        const activeTasks = tasks.filter((t: any) => t.active);
        const overdue = tasks.filter((t: any) => t.next_service_date && new Date(t.next_service_date) < new Date());

        addKeyValue([
          ["Total Tasks", String(tasks.length)],
          ["Active", String(activeTasks.length)],
          ["Overdue", String(overdue.length)],
        ]);

        addTable(
          ["Name", "Frequency (days)", "Last Service", "Next Service", "Status"],
          tasks.map((t: any) => [t.name, String(t.frequency_days), t.last_service_date || "Never", t.next_service_date || "-", t.active ? (t.next_service_date && new Date(t.next_service_date) < new Date() ? "⚠️ Overdue" : "Active") : "Inactive"])
        );
      }

      // === AUDIT LOGS ===
      if (selectedReports.has("audit") && results.audit) {
        addSectionTitle("📜 Audit Logs");
        const logs = results.audit;

        addKeyValue([["Total Log Entries", String(logs.length)]]);

        addTable(
          ["Timestamp", "Action", "Details"],
          logs.slice(0, 200).map((l: any) => [format(new Date(l.timestamp), "dd MMM hh:mm a"), l.action, l.details ? JSON.stringify(l.details).slice(0, 80) : "-"])
        );
      }

      // Footer on each page
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(`${business.name} – ${periodLabel} | Page ${i} of ${totalPages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
        doc.setTextColor(0);
      }

      // Save
      const fileName = isWeekly
        ? `${business.name.replace(/\s+/g, "_")}_Weekly_Report_${format(dateStart, "dd_MMM")}_${format(dateEnd, "dd_MMM_yyyy")}.pdf`
        : `${business.name.replace(/\s+/g, "_")}_Monthly_Report_${format(monthStart, "MMM_yyyy")}.pdf`;
      doc.save(fileName);

      toast({ title: "Report Generated", description: `${fileName} has been downloaded.` });
    } catch (err: any) {
      console.error("Report generation error:", err);
      toast({ title: "Error", description: err.message || "Failed to generate report", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" /> Monthly Reports
        </CardTitle>
        <CardDescription>
          Generate comprehensive analytics reports for any month or week
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Period Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Select Month</Label>
            <Select value={selectedMonth} onValueChange={(v) => { setSelectedMonth(v); setSelectedWeek("full-month"); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      {o.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Period</Label>
            <Select value={selectedWeek} onValueChange={setSelectedWeek}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full-month">Full Month</SelectItem>
                {weekOptions.map(w => (
                  <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Report Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Select Reports to Include</Label>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7">Select All</Button>
              <Button variant="ghost" size="sm" onClick={selectNone} className="text-xs h-7">Clear</Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {REPORT_OPTIONS.map(opt => (
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
                <div>
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={generating || selectedReports.size === 0}
          className="w-full gap-2"
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
