import { useEffect, useMemo, useState } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ausNow } from "@/lib/dateUtils";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays } from "date-fns";
import {
  computeTimesheetEntries,
  filterApprovedEntries,
  filterTimesheetEntriesByDateRange,
  getTimesheetEventWindow,
} from "@/lib/timesheetUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Navigate, useParams } from "react-router-dom";
import { CalendarIcon, ChevronLeft, ChevronRight, Download, FileText, RefreshCw, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { buildInvoicePdf, buildCombinedInvoicesPdf, InvoiceData } from "@/lib/invoicePdf";
import { buildExportFilename } from "@/lib/exportNaming";
import { logAudit, getDeviceInfo } from "@/lib/auditLog";

const HOURLY_RATE = 30;

// Business-specific bill-to. Fallback uses generic business.name/business_code.
const BILL_TO_OVERRIDES: Record<string, { name: string; abn: string; address_lines: string[] }> = {
  PRP: {
    name: "Pro Regal Pavilion Pty Ltd",
    abn: "86675963069",
    address_lines: ["82 Station Street", "Wentworthville NSW 2145"],
  },
};

interface Employee {
  id: string; name: string; abn: string | null;
  account_name: string | null; bsb: string | null; account_number: string | null;
}

interface EmployeeWeek {
  employee: Employee;
  net_hours: number;
  amount: number;
  invoice_code: string;
  existing?: {
    id: string; invoice_number: number; invoice_code: string;
    amount: number; net_hours: number; employee_abn: string | null;
    account_name: string | null; bsb: string | null; account_number: string | null;
    issue_date: string; due_date: string;
  };
}

const codeFor = (name: string, hours: number) =>
  `${name.trim().slice(0, 3).toUpperCase()}${hours.toFixed(2)}`;

const invoiceNumberDisplay = (bizCode: string, weekEnd: Date, n: number) =>
  `${bizCode.toUpperCase()}-${format(weekEnd, "yyyy")}-${String(n).padStart(4, "0")}`;

export default function InvoicesPage() {
  const { business } = useBusiness();
  const { isSuperAdminOf, loading } = useAuth();
  const { businessCode } = useParams();

  // Default to last completed week (previous Monday–Sunday)
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const w = startOfWeek(subWeeks(ausNow(), 1), { weekStartsOn: 1 });
    return w;
  });
  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);
  // Issue = Monday after weekEnd; Due = Thursday of that same week
  const issueDate = useMemo(() => addDays(weekEnd, 1), [weekEnd]);
  const dueDate = useMemo(() => addDays(issueDate, 3), [issueDate]);

  const [rows, setRows] = useState<EmployeeWeek[]>([]);
  const [fetching, setFetching] = useState(false);
  const [working, setWorking] = useState(false);

  const currentBusinessId = business?.id || "";
  const canAccess = business && isSuperAdminOf(currentBusinessId);

  useEffect(() => { if (business) fetchWeek(); }, [business, weekStart]);

  const fetchWeek = async () => {
    if (!business) return;
    setFetching(true);
    const from = format(weekStart, "yyyy-MM-dd");
    const to = format(weekEnd, "yyyy-MM-dd");
    const { fromISO, toISO } = getTimesheetEventWindow(from, to);

    const fetchAllEvents = async () => {
      const all: any[] = []; let last: string | null = null; let more = true;
      while (more) {
        let q = supabase.from("clock_events").select("*")
          .gte("timestamp", fromISO).lte("timestamp", toISO)
          .order("timestamp").limit(1000);
        if (last) q = q.gt("timestamp", last);
        const { data } = await q;
        if (!data || data.length === 0) { more = false; }
        else { all.push(...data); last = data[data.length - 1].timestamp; more = data.length === 1000; }
      }
      return all;
    };

    const [{ data: employees }, events, { data: approvals }, { data: invoices }] = await Promise.all([
      supabase.from("employees").select("id, name, abn, account_name, bsb, account_number, active")
        .eq("business_id", business.id).eq("active", true),
      fetchAllEvents(),
      supabase.from("timesheet_approvals").select("employee_id, date, approved")
        .gte("date", from).lte("date", to).eq("approved", true),
      supabase.from("invoices").select("*").eq("business_id", business.id).eq("week_start", from),
    ]);

    if (!employees) { setFetching(false); return; }
    const approvedSet = new Set<string>((approvals || []).map((a: any) => `${a.employee_id}-${a.date}`));
    const entries = filterApprovedEntries(
      filterTimesheetEntriesByDateRange(computeTimesheetEntries(events), from, to),
      approvedSet,
    );

    const empMap = new Map(employees.map((e: any) => [e.id, e]));
    const hoursByEmp = new Map<string, number>();
    for (const e of entries) {
      if (!empMap.has(e.employee_id)) continue;
      hoursByEmp.set(e.employee_id, (hoursByEmp.get(e.employee_id) || 0) + e.net_hours);
    }

    const invByEmp = new Map<string, any>();
    for (const inv of invoices || []) invByEmp.set(inv.employee_id, inv);

    const result: EmployeeWeek[] = [];
    for (const [empId, hoursRaw] of hoursByEmp) {
      const emp = empMap.get(empId)! as Employee;
      const hours = Math.round(hoursRaw * 100) / 100;
      if (hours <= 0) continue;
      const amount = Math.round(hours * HOURLY_RATE * 100) / 100;
      const existing = invByEmp.get(empId);
      result.push({
        employee: emp,
        net_hours: hours,
        amount,
        invoice_code: codeFor(emp.name, hours),
        existing: existing ? {
          id: existing.id, invoice_number: existing.invoice_number, invoice_code: existing.invoice_code,
          amount: Number(existing.amount), net_hours: Number(existing.net_hours),
          employee_abn: existing.employee_abn, account_name: existing.account_name,
          bsb: existing.bsb, account_number: existing.account_number,
          issue_date: existing.issue_date, due_date: existing.due_date,
        } : undefined,
      });
    }

    result.sort((a, b) => a.employee.name.localeCompare(b.employee.name));
    setRows(result);
    setFetching(false);
  };

  const getBillTo = () => {
    const code = (business?.business_code || "").toUpperCase();
    if (BILL_TO_OVERRIDES[code]) return BILL_TO_OVERRIDES[code];
    return { name: business?.name || "Business", abn: "", address_lines: [] };
  };

  const buildPdfFor = (row: EmployeeWeek, invoiceNumber: number, snapshot?: { abn: string | null; account_name: string | null; bsb: string | null; account_number: string | null; }): jsPDF => {
    const emp = row.employee;
    const snap = snapshot || {
      abn: emp.abn, account_name: emp.account_name, bsb: emp.bsb, account_number: emp.account_number,
    };
    const data: InvoiceData = {
      invoice_number: invoiceNumber,
      invoice_number_display: invoiceNumberDisplay(business!.business_code, weekEnd, invoiceNumber),
      invoice_code: row.existing?.invoice_code || row.invoice_code,
      week_start: weekStart,
      week_end: weekEnd,
      issue_date: row.existing ? new Date(row.existing.issue_date + "T00:00:00") : issueDate,
      due_date: row.existing ? new Date(row.existing.due_date + "T00:00:00") : dueDate,
      net_hours: row.existing?.net_hours ?? row.net_hours,
      hourly_rate: HOURLY_RATE,
      amount: row.existing?.amount ?? row.amount,
      employee: { name: emp.name, abn: snap.abn, account_name: snap.account_name, bsb: snap.bsb, account_number: snap.account_number },
      billTo: getBillTo(),
    };
    return buildInvoicePdf(data);
  };

  const generateOne = async (row: EmployeeWeek) => {
    if (!business) return;
    if (!row.employee.abn) { toast.error(`${row.employee.name} has no ABN on file.`); return; }

    // Get next number
    const { data: nextNum } = await supabase.rpc("next_employee_invoice_number", { _employee_id: row.employee.id });
    const invoiceNumber = Number(nextNum) || 1;

    const { error } = await supabase.from("invoices").insert({
      business_id: business.id,
      employee_id: row.employee.id,
      week_start: format(weekStart, "yyyy-MM-dd"),
      week_end: format(weekEnd, "yyyy-MM-dd"),
      issue_date: format(issueDate, "yyyy-MM-dd"),
      due_date: format(dueDate, "yyyy-MM-dd"),
      invoice_number: invoiceNumber,
      invoice_code: row.invoice_code,
      net_hours: row.net_hours,
      hourly_rate: HOURLY_RATE,
      amount: row.amount,
      employee_name: row.employee.name,
      employee_abn: row.employee.abn,
      account_name: row.employee.account_name,
      bsb: row.employee.bsb,
      account_number: row.employee.account_number,
    });
    if (error) { toast.error(`Failed for ${row.employee.name}: ${error.message}`); return false; }
    return true;
  };

  const generateAll = async () => {
    setWorking(true);
    let ok = 0, skipped = 0;
    for (const r of rows) {
      if (r.existing) { skipped++; continue; }
      if (!r.employee.abn) { toast.warning(`Skipped ${r.employee.name} — no ABN.`); skipped++; continue; }
      const success = await generateOne(r);
      if (success) ok++;
    }
    await fetchWeek();
    setWorking(false);
    toast.success(`Generated ${ok} invoice${ok === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""}.`);
    logAudit("invoices_generated", { week_start: format(weekStart, "yyyy-MM-dd"), generated: ok, skipped, device: getDeviceInfo() });
  };

  const regenerate = async (row: EmployeeWeek) => {
    if (!business || !row.existing) return;
    setWorking(true);
    const { error } = await supabase.from("invoices").update({
      net_hours: row.net_hours,
      amount: row.amount,
      invoice_code: row.invoice_code,
      employee_abn: row.employee.abn,
      account_name: row.employee.account_name,
      bsb: row.employee.bsb,
      account_number: row.employee.account_number,
    }).eq("id", row.existing.id);
    if (error) { toast.error(error.message); setWorking(false); return; }
    await fetchWeek();
    setWorking(false);
    toast.success(`Refreshed invoice for ${row.employee.name}.`);
  };

  const downloadOne = (row: EmployeeWeek) => {
    if (!row.existing) { toast.error("Generate the invoice first."); return; }
    const doc = buildPdfFor(row, row.existing.invoice_number, {
      abn: row.existing.employee_abn, account_name: row.existing.account_name,
      bsb: row.existing.bsb, account_number: row.existing.account_number,
    });
    const filename = buildExportFilename({
      businessCode: business?.business_code, businessName: business?.name,
      reportType: "Invoice", scope: [row.employee.name.replace(/\s+/g, "-")],
      dateFrom: weekStart, dateTo: weekEnd, ext: "pdf",
    });
    doc.save(filename);
  };

  const buildInvoiceDataFor = (row: EmployeeWeek): InvoiceData => {
    const emp = row.employee;
    const ex = row.existing;
    return {
      invoice_number: ex?.invoice_number ?? 0,
      invoice_number_display: invoiceNumberDisplay(business!.business_code, weekEnd, ex?.invoice_number ?? 0),
      invoice_code: ex?.invoice_code || row.invoice_code,
      week_start: weekStart,
      week_end: weekEnd,
      issue_date: ex ? new Date(ex.issue_date + "T00:00:00") : issueDate,
      due_date: ex ? new Date(ex.due_date + "T00:00:00") : dueDate,
      net_hours: ex?.net_hours ?? row.net_hours,
      hourly_rate: HOURLY_RATE,
      amount: ex?.amount ?? row.amount,
      employee: {
        name: emp.name,
        abn: ex?.employee_abn ?? emp.abn,
        account_name: ex?.account_name ?? emp.account_name,
        bsb: ex?.bsb ?? emp.bsb,
        account_number: ex?.account_number ?? emp.account_number,
      },
      billTo: getBillTo(),
    };
  };

  const downloadCombined = () => {
    const generated = rows.filter((r) => r.existing);
    if (generated.length === 0) { toast.error("No generated invoices for this week."); return; }
    const list = generated.map((r) => buildInvoiceDataFor(r));
    const combined = buildCombinedInvoicesPdf(list);
    const filename = buildExportFilename({
      businessCode: business?.business_code, businessName: business?.name,
      reportType: "Invoices-Combined", dateFrom: weekStart, dateTo: weekEnd, ext: "pdf",
    });
    combined.save(filename);
  };

  const goPrev = () => setWeekStart(startOfWeek(subWeeks(weekStart, 1), { weekStartsOn: 1 }));
  const goNext = () => setWeekStart(startOfWeek(addWeeks(weekStart, 1), { weekStartsOn: 1 }));

  if (loading) return null;
  if (!canAccess) return <Navigate to={`/b/${businessCode}/admin`} replace />;

  const readyCount = rows.filter((r) => !r.existing && r.employee.abn).length;
  const missingAbnCount = rows.filter((r) => !r.employee.abn).length;
  const generatedCount = rows.filter((r) => r.existing).length;

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Weekly Invoices</h1>
          <p className="text-sm text-muted-foreground">
            One tax invoice per employee per week from approved timesheets · Rate ${HOURLY_RATE.toFixed(2)}/hr
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goPrev} className="h-9 w-9"><ChevronLeft className="h-4 w-4" /></Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("h-9 justify-start text-left font-normal min-w-[220px]")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(weekStart, "dd MMM")} – {format(weekEnd, "dd MMM yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={weekStart} onSelect={(d) => d && setWeekStart(startOfWeek(d, { weekStartsOn: 1 }))} />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" onClick={goNext} className="h-9 w-9"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Employees" value={String(rows.length)} />
        <StatCard label="Ready" value={String(readyCount)} tone="primary" />
        <StatCard label="Generated" value={String(generatedCount)} tone="success" />
        <StatCard label="Missing ABN" value={String(missingAbnCount)} tone={missingAbnCount > 0 ? "warning" : "muted"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={generateAll} disabled={working || readyCount === 0}>
          <Wand2 className="mr-1.5 h-4 w-4" /> Generate All ({readyCount})
        </Button>
        <Button variant="outline" onClick={downloadCombined} disabled={generatedCount === 0}>
          <Download className="mr-1.5 h-4 w-4" /> Download Combined PDF
        </Button>
        <Button variant="ghost" onClick={fetchWeek} disabled={fetching}>
          <RefreshCw className={cn("mr-1.5 h-4 w-4", fetching && "animate-spin")} /> Refresh
        </Button>
        <div className="ml-auto text-xs text-muted-foreground">
          Issue {format(issueDate, "dd/MM/yyyy")} · Due {format(dueDate, "dd/MM/yyyy")}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Week of {format(weekStart, "dd MMM yyyy")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>ABN</TableHead>
                  <TableHead className="text-right">Net Hours</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                      {fetching ? "Loading…" : "No approved timesheets found for this week."}
                    </TableCell>
                  </TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.employee.id}>
                    <TableCell className="font-medium">{r.employee.name}</TableCell>
                    <TableCell className="font-mono text-xs">{r.employee.abn || <span className="text-warning">Missing</span>}</TableCell>
                    <TableCell className="text-right font-mono">{r.net_hours.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">${r.amount.toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.existing?.invoice_code || r.invoice_code}</TableCell>
                    <TableCell>
                      {r.existing ? (
                        <Badge className="bg-success/15 text-success">
                          #{invoiceNumberDisplay(business!.business_code, weekEnd, r.existing.invoice_number)}
                        </Badge>
                      ) : !r.employee.abn ? (
                        <Badge variant="outline" className="text-warning border-warning/50">No ABN</Badge>
                      ) : (
                        <Badge variant="outline">Ready</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {r.existing ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => downloadOne(r)}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => regenerate(r)} disabled={working}>
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" onClick={async () => { setWorking(true); await generateOne(r); await fetchWeek(); setWorking(false); }} disabled={working || !r.employee.abn}>
                          Generate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "primary" | "success" | "warning" | "muted" }) {
  const toneCls =
    tone === "primary" ? "text-primary"
    : tone === "success" ? "text-success"
    : tone === "warning" ? "text-warning"
    : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={cn("text-2xl font-bold", toneCls)}>{value}</p>
      </CardContent>
    </Card>
  );
}
