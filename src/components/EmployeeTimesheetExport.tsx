import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Download, FileSpreadsheet, FileText, Loader2, UserCheck } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { format, startOfWeek, subWeeks, endOfWeek, parseISO } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { buildExportFilename } from "@/lib/exportNaming";
import {
  computeTimesheetEntries,
  filterApprovedEntries,
  filterTimesheetEntriesByDateRange,
  getTimesheetEventWindow,
} from "@/lib/timesheetUtils";
import { toAusTime12 } from "@/lib/dateUtils";

interface EmployeeRow {
  id: string;
  name: string;
  department: string | null;
  pay_rate: number;
}

export default function EmployeeTimesheetExport() {
  const { business } = useBusiness();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [range, setRange] = useState<DateRange | undefined>({
    from: startOfWeek(subWeeks(new Date(), 4), { weekStartsOn: 1 }),
    to: endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }),
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!business?.id) return;
    supabase
      .from("employees")
      .select("id, name, department, pay_rate")
      .eq("business_id", business.id)
      .order("name")
      .then(({ data }) => setEmployees((data as EmployeeRow[]) || []));
  }, [business?.id]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === employeeId) || null,
    [employees, employeeId],
  );

  const rangeLabel = range?.from
    ? range.to
      ? `${format(range.from, "dd MMM yyyy")} – ${format(range.to, "dd MMM yyyy")}`
      : format(range.from, "dd MMM yyyy")
    : "Select date range";

  const loadRows = async () => {
    if (!business?.id || !employeeId || !range?.from) return null;
    const from = range.from;
    const to = range.to || range.from;
    const startStr = format(from, "yyyy-MM-dd");
    const endStr = format(to, "yyyy-MM-dd");
    const { fromISO, toISO } = getTimesheetEventWindow(startStr, endStr);

    const [eventsRes, approvalsRes] = await Promise.all([
      supabase
        .from("clock_events")
        .select("*")
        .eq("employee_id", employeeId)
        .gte("timestamp", fromISO)
        .lte("timestamp", toISO)
        .order("timestamp"),
      supabase
        .from("timesheet_approvals")
        .select("employee_id, date, approved")
        .eq("employee_id", employeeId)
        .eq("approved", true)
        .gte("date", startStr)
        .lte("date", endStr),
    ]);

    const approvedSet = new Set((approvalsRes.data || []).map((a: any) => `${a.employee_id}-${a.date}`));
    const entries = filterApprovedEntries(
      filterTimesheetEntriesByDateRange(computeTimesheetEntries(eventsRes.data || []), startStr, endStr),
      approvedSet,
    ).sort((a, b) => a.date.localeCompare(b.date));

    return { entries, startStr, endStr, from, to };
  };

  const handleExport = async (kind: "pdf" | "xlsx") => {
    if (!employeeId) {
      toast({ title: "Select an employee", description: "Choose an employee to export.", variant: "destructive" });
      return;
    }
    if (!range?.from) {
      toast({ title: "Select a date range", description: "Pick the period you want to export.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const result = await loadRows();
      if (!result) return;
      const { entries, from, to } = result;
      if (entries.length === 0) {
        toast({ title: "No approved timesheets", description: "No approved entries found in this period.", variant: "destructive" });
        return;
      }

      const emp = selectedEmployee;

      const fileName = buildExportFilename({
        businessCode: business?.business_code,
        businessName: business?.name,
        reportType: "Approved-Timesheets",
        scope: [emp?.department || undefined, emp?.name],
        dateFrom: from,
        dateTo: to,
        ext: kind,
      });

      // Group approved entries by week (Monday start) and build day rows + weekly subtotals
      const weekStartsOn = 1;
      const byWeek = new Map<string, typeof entries>();
      for (const e of entries) {
        const weekStart = format(startOfWeek(parseISO(e.date), { weekStartsOn }), "yyyy-MM-dd");
        if (!byWeek.has(weekStart)) byWeek.set(weekStart, []);
        byWeek.get(weekStart)!.push(e);
      }
      const sortedWeeks = Array.from(byWeek.keys()).sort();

      const dayRow = (e: (typeof entries)[0]) => [
        format(parseISO(e.date), "EEE dd MMM yyyy"),
        e.clock_in ? toAusTime12(e.clock_in) : "-",
        e.clock_out ? `${toAusTime12(e.clock_out)}${e.crossed_midnight ? " (+1d)" : ""}` : "-",
        String(e.break_minutes),
        e.total_hours.toFixed(2),
        e.net_hours.toFixed(2),
      ];

      let grandTotal = 0;
      let grandBreaks = 0;
      let grandNet = 0;
      const xlsxRows: any[][] = [];
      const pdfBody: string[][] = [];
      const pdfSubtotalRowIndexes: number[] = [];

      for (const weekStart of sortedWeeks) {
        const weekEntries = byWeek.get(weekStart)!;
        for (const e of weekEntries) {
          const row = dayRow(e);
          xlsxRows.push(row);
          pdfBody.push(row.map(String));
        }

        const weekTotal = weekEntries.reduce(
          (acc, e) => {
            acc.total += e.total_hours;
            acc.breaks += e.break_minutes;
            acc.net += e.net_hours;
            return acc;
          },
          { total: 0, breaks: 0, net: 0 },
        );
        grandTotal += weekTotal.total;
        grandBreaks += weekTotal.breaks;
        grandNet += weekTotal.net;

        const weekLabel = `Week total ${format(parseISO(weekStart), "dd MMM yyyy")}`;
        const subtotalRow = [
          weekLabel,
          "",
          "",
          weekTotal.breaks.toFixed(0),
          weekTotal.total.toFixed(2),
          weekTotal.net.toFixed(2),
        ];
        xlsxRows.push(subtotalRow);
        pdfSubtotalRowIndexes.push(pdfBody.length);
        pdfBody.push(subtotalRow.map(String));
      }

      if (kind === "xlsx") {
        const sheet = XLSX.utils.aoa_to_sheet([
          ["Employee", emp?.name || ""],
          ["Department", emp?.department || "-"],
          ["Period", `${format(from, "dd/MM/yyyy")} - ${format(to, "dd/MM/yyyy")}`],
          [],
          ["Date", "Clock In", "Clock Out", "Break (min)", "Total Hours", "Net Hours"],
          ...xlsxRows,
          [],
          ["Totals", "", "", grandBreaks.toFixed(0), grandTotal.toFixed(2), grandNet.toFixed(2)],
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, sheet, "Approved Timesheets");
        XLSX.writeFile(wb, fileName);
      } else {
        const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        doc.setFillColor(30, 30, 30);
        doc.rect(0, 0, 210, 26, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.text(business?.name || "Business", 14, 12);
        doc.setFontSize(10);
        doc.text("Approved Timesheets", 14, 19);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(11);
        doc.text(`Employee: ${emp?.name || "-"}`, 14, 36);
        doc.setFontSize(9);
        doc.text(`Department: ${emp?.department || "-"}`, 14, 42);
        doc.text(`Period: ${format(from, "dd/MM/yyyy")} - ${format(to, "dd/MM/yyyy")}`, 14, 48);

        autoTable(doc, {
          startY: 55,
          head: [["Date", "Clock In", "Clock Out", "Break (min)", "Total Hrs", "Net Hrs"]],
          body: pdfBody,
          foot: [["Totals", "", "", grandBreaks.toFixed(0), grandTotal.toFixed(2), grandNet.toFixed(2)]],
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [41, 98, 255], textColor: 255 },
          footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold" },
          didParseCell: (data) => {
            if (data.row.section === "body" && pdfSubtotalRowIndexes.includes(data.row.index)) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [245, 245, 245];
            }
          },
        });
        doc.save(fileName);
      }

      toast({ title: "Export ready", description: `${entries.length} approved day(s) exported.` });
    } catch (err: any) {
      toast({ title: "Export failed", description: err?.message || "Unable to export timesheets.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5" /> Employee Approved Timesheets
        </CardTitle>
        <CardDescription>
          Export an individual employee's approved timesheets for any past date range.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                    {e.department ? ` — ${e.department}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Date range</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !range?.from && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {rangeLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  defaultMonth={range?.from}
                  selected={range}
                  onSelect={setRange}
                  weekStartsOn={1}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <FileText className="h-3 w-3" /> Approved entries only
          </Badge>
          <Badge variant="secondary">Overnight shifts stay on the clock-in day</Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => handleExport("pdf")} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export PDF
          </Button>
          <Button variant="outline" onClick={() => handleExport("xlsx")} disabled={busy} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Export Excel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
