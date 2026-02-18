import { useEffect, useState, useMemo } from "react";
import { ausNow, toAusDate, ausStartOfDay, ausEndOfDay } from "@/lib/dateUtils";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Download, DollarSign, Clock as ClockIcon, Users, Coffee, Search, ChevronLeft, ChevronRight, ArrowUpDown, CalendarIcon, CheckCircle2, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailCSVDialog } from "@/components/EmailCSVDialog";
import { logAudit, getDeviceInfo } from "@/lib/auditLog";

const CHART_COLORS = [
  "hsl(45, 60%, 53%)", "hsl(142, 71%, 45%)", "hsl(217, 91%, 60%)",
  "hsl(0, 84%, 60%)", "hsl(280, 67%, 55%)", "hsl(30, 90%, 55%)",
  "hsl(190, 70%, 50%)", "hsl(320, 65%, 50%)", "hsl(60, 70%, 45%)", "hsl(10, 80%, 55%)",
];

const PAGE_SIZE = 20;

interface PayrollEntry {
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
}

type SortKey = "name" | "net_hours" | "employee_pay" | "admin_pay" | "total_hours";
type SortDir = "asc" | "desc";

function DateRangeSelector({ dateFrom, dateTo, onChangeFrom, onChangeTo }: {
  dateFrom: Date; dateTo: Date; onChangeFrom: (d: Date) => void; onChangeTo: (d: Date) => void;
}) {
  const goToPrevWeek = () => {
    const prev = subWeeks(dateFrom, 1);
    onChangeFrom(startOfWeek(prev, { weekStartsOn: 1 }));
    onChangeTo(endOfWeek(prev, { weekStartsOn: 1 }));
  };
  const goToNextWeek = () => {
    const next = addWeeks(dateFrom, 1);
    onChangeFrom(startOfWeek(next, { weekStartsOn: 1 }));
    onChangeTo(endOfWeek(next, { weekStartsOn: 1 }));
  };
  const goToThisWeek = () => {
    const now = ausNow();
    onChangeFrom(startOfWeek(now, { weekStartsOn: 1 }));
    onChangeTo(endOfWeek(now, { weekStartsOn: 1 }));
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={goToPrevWeek} className="h-9 w-9">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="min-w-[220px] justify-center text-left font-normal gap-2">
            <CalendarIcon className="h-4 w-4 text-primary" />
            <span>{format(dateFrom, "dd MMM")} — {format(dateTo, "dd MMM yyyy")}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <Calendar
            mode="range"
            selected={{ from: dateFrom, to: dateTo }}
            onSelect={(range) => {
              if (range?.from) onChangeFrom(range.from);
              if (range?.to) onChangeTo(range.to);
            }}
            weekStartsOn={1}
            numberOfMonths={2}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
      <Button variant="outline" size="icon" onClick={goToNextWeek} className="h-9 w-9">
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={goToThisWeek} className="text-primary text-xs">
        Today
      </Button>
    </div>
  );
}

export default function PayrollPage() {
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [allEmployees, setAllEmployees] = useState<{ id: string; name: string; department: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date>(() => startOfWeek(ausNow(), { weekStartsOn: 1 }));
  const [dateTo, setDateTo] = useState<Date>(() => endOfWeek(ausNow(), { weekStartsOn: 1 }));
  const [search, setSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("employee_pay");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [chartLimit, setChartLimit] = useState(25);
  const [activeTab, setActiveTab] = useState<"employee" | "admin">("employee");
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  useEffect(() => {
    fetchPayroll();
  }, [dateFrom, dateTo]);

  useEffect(() => { setPage(0); }, [search]);

  const fetchAllEvents = async (fromDate: Date, toDate: Date) => {
    const fromISO = ausStartOfDay(format(fromDate, "yyyy-MM-dd"));
    const toISO = ausEndOfDay(format(toDate, "yyyy-MM-dd"));
    const allEvents: any[] = [];
    let lastTimestamp: string | null = null;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from("clock_events")
        .select("*")
        .gte("timestamp", fromISO)
        .lte("timestamp", toISO)
        .order("timestamp")
        .limit(1000);

      if (lastTimestamp) {
        query = query.gt("timestamp", lastTimestamp);
      }

      const { data } = await query;
      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allEvents.push(...data);
        lastTimestamp = data[data.length - 1].timestamp;
        hasMore = data.length === 1000;
      }
    }
    return allEvents;
  };

  const fetchPayroll = async () => {
    setLoading(true);
    const from = format(dateFrom, "yyyy-MM-dd");
    const to = format(dateTo, "yyyy-MM-dd");

    const [{ data: employees }, events, { data: approvalData }] = await Promise.all([
      supabase.from("employees").select("*").eq("active", true),
      fetchAllEvents(dateFrom, dateTo),
      supabase.from("timesheet_approvals").select("employee_id, date, approved").gte("date", from).lte("date", to).eq("approved", true),
    ]);

    if (!employees) { setLoading(false); return; }

    // Build approved set: "employee_id-YYYY-MM-DD"
    const approvedSet = new Set<string>();
    if (approvalData) {
      for (const a of approvalData) {
        approvedSet.add(`${a.employee_id}-${a.date}`);
      }
    }

    const empMap = new Map(employees.map((e) => [e.id, e]));
    const eventsByEmp = new Map<string, typeof events>();

    // Only include events for approved days
    for (const ev of events) {
      const dayStr = toAusDate(new Date(ev.timestamp));
      const key = `${ev.employee_id}-${dayStr}`;
      if (!approvedSet.has(key)) continue; // Skip unapproved

      if (!eventsByEmp.has(ev.employee_id)) eventsByEmp.set(ev.employee_id, []);
      eventsByEmp.get(ev.employee_id)!.push(ev);
    }

    const result: PayrollEntry[] = [];

    for (const [empId, empEvents] of eventsByEmp) {
      const emp = empMap.get(empId);
      if (!emp) continue;

      const days = new Map<string, any[]>();
      for (const ev of empEvents) {
        const day = toAusDate(new Date(ev.timestamp));
        if (!days.has(day)) days.set(day, []);
        days.get(day)!.push(ev);
      }

      let totalHours = 0;
      let breakHours = 0;

      for (const dayEvents of days.values()) {
        let clockIn: Date | null = null;
        let clockOut: Date | null = null;
        let breakStart: Date | null = null;
        let dayBreak = 0;

        for (const ev of dayEvents) {
          const t = new Date(ev.timestamp);
          switch (ev.event_type) {
            case "clock_in": if (!clockIn || t < clockIn) clockIn = t; break;
            case "clock_out": if (!clockOut || t > clockOut) clockOut = t; break;
            case "break_start": breakStart = t; break;
            case "break_end":
              if (breakStart) { dayBreak += (t.getTime() - breakStart.getTime()) / 3600000; breakStart = null; }
              break;
          }
        }

        if (clockIn && clockOut) {
          totalHours += (clockOut.getTime() - clockIn.getTime()) / 3600000;
        }
        breakHours += dayBreak;
      }

      const netHours = Math.max(0, totalHours - breakHours);
      const employeePay = Math.round(netHours * emp.pay_rate * 100) / 100;
      // Admin pay: GST-inclusive rate, back-calculate by dividing by 1.10
      const adminPay = Math.round((netHours * emp.admin_hourly_rate) / 1.10 * 100) / 100;

      result.push({
        employee_id: empId,
        name: emp.name,
        department: emp.department,
        pay_rate: emp.pay_rate,
        admin_hourly_rate: emp.admin_hourly_rate,
        total_hours: Math.round(totalHours * 100) / 100,
        break_hours: Math.round(breakHours * 100) / 100,
        net_hours: Math.round(netHours * 100) / 100,
        employee_pay: employeePay,
        admin_pay: adminPay,
      });
    }

    setAllEmployees((employees || []).map(e => ({ id: e.id, name: e.name, department: e.department })));
    setEntries(result);
    setLoading(false);
  };

  // Filtered + sorted entries
  const filtered = useMemo(() => {
    let list = entries;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q));
    }
    if (selectedEmployee !== "all") {
      list = list.filter((e) => e.employee_id === selectedEmployee);
    }
    if (selectedDepartment !== "all") {
      list = list.filter((e) => e.department === selectedDepartment);
    }
    list = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return list;
  }, [entries, search, selectedEmployee, selectedDepartment, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageEntries = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const buildPayrollCSV = () => {
    const isEmp = activeTab === "employee";
    const headers = isEmp
      ? "Name,Rate ($/hr),Total Hours,Break Hours,Net Hours,Employee Pay\n"
      : "Name,Admin Rate ($/hr),Total Hours,Break Hours,Net Hours,Admin Cost (ex GST)\n";
    const rows = filtered.map((e) =>
      isEmp
        ? `${e.name},${e.pay_rate.toFixed(2)},${e.total_hours.toFixed(2)},${e.break_hours.toFixed(2)},${e.net_hours.toFixed(2)},${e.employee_pay.toFixed(2)}`
        : `${e.name},${e.admin_hourly_rate.toFixed(2)},${e.total_hours.toFixed(2)},${e.break_hours.toFixed(2)},${e.net_hours.toFixed(2)},${e.admin_pay.toFixed(2)}`
    ).join("\n");
    const totTotalHrs = filtered.reduce((s, e) => s + e.total_hours, 0);
    const totBreakHrs = filtered.reduce((s, e) => s + e.break_hours, 0);
    const totNetHrs = filtered.reduce((s, e) => s + e.net_hours, 0);
    const totPay = filtered.reduce((s, e) => s + (isEmp ? e.employee_pay : e.admin_pay), 0);
    const totalRow = `\nTOTAL,,${totTotalHrs.toFixed(2)},${totBreakHrs.toFixed(2)},${totNetHrs.toFixed(2)},${totPay.toFixed(2)}`;
    return headers + rows + totalRow;
  };

  const payrollCsvFilename = `${activeTab}-payroll-${format(dateFrom, "yyyy-MM-dd")}-to-${format(dateTo, "yyyy-MM-dd")}.csv`;
  const payrollCsvSubject = `${activeTab === "employee" ? "Employee" : "Admin"} Payroll Report – ${format(dateFrom, "dd MMM")} to ${format(dateTo, "dd MMM yyyy")}`;

  const exportCSV = () => {
    const csv = buildPayrollCSV();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = payrollCsvFilename;
    a.click();
    logAudit("csv_download", {
      source: "payroll",
      tab: activeTab,
      filename: payrollCsvFilename,
      device: getDeviceInfo(),
    });
  };

  const totalEmployeePay = filtered.reduce((sum, e) => sum + e.employee_pay, 0);
  const totalAdminPay = filtered.reduce((sum, e) => sum + e.admin_pay, 0);
  const totalNetHours = filtered.reduce((sum, e) => sum + e.net_hours, 0);
  const totalBreakHours = filtered.reduce((sum, e) => sum + e.break_hours, 0);

  const payKey = activeTab === "employee" ? "employee_pay" : "admin_pay";
  const topByPay = [...filtered].sort((a, b) => (b[payKey] as number) - (a[payKey] as number)).slice(0, chartLimit);
  const topByHours = [...filtered].sort((a, b) => b.net_hours - a.net_hours).slice(0, chartLimit);
  const othersPayCount = filtered.length - topByPay.length;
  const othersPay = filtered.reduce((s, e) => s + (e[payKey] as number), 0) - topByPay.reduce((s, e) => s + (e[payKey] as number), 0);
  const othersHours = filtered.reduce((s, e) => s + e.net_hours, 0) - topByHours.reduce((s, e) => s + e.net_hours, 0);

  const barData = othersPayCount > 0
    ? [...topByPay.map(e => ({ name: e.name, pay: e[payKey] as number })), { name: `Others (${othersPayCount})`, pay: Math.round(othersPay * 100) / 100 }]
    : topByPay.map(e => ({ name: e.name, pay: e[payKey] as number }));

  const pieData = filtered.length > chartLimit
    ? [...topByHours.map(e => ({ name: e.name, net_hours: e.net_hours })), { name: `Others (${filtered.length - chartLimit})`, net_hours: Math.round(othersHours * 100) / 100 }]
    : (topByHours.length > 0 ? topByHours : filtered).map(e => ({ name: e.name, net_hours: e.net_hours }));

  const empSummaryCards = [
    { title: "Total Employee Pay", value: `$${totalEmployeePay.toFixed(2)}`, icon: DollarSign, color: "text-primary" },
    { title: "Total Net Hours", value: totalNetHours.toFixed(2), icon: ClockIcon, color: "text-green-500" },
    { title: "Total Break Hours", value: totalBreakHours.toFixed(2), icon: Coffee, color: "text-yellow-500" },
    { title: "Employees", value: filtered.length, icon: Users, color: "text-primary" },
  ];

  const adminSummaryCards = [
    { title: "Total Admin Cost (ex GST)", value: `$${totalAdminPay.toFixed(2)}`, icon: DollarSign, color: "text-primary" },
    { title: "Total Net Hours", value: totalNetHours.toFixed(2), icon: ClockIcon, color: "text-green-500" },
    { title: "Total Break Hours", value: totalBreakHours.toFixed(2), icon: Coffee, color: "text-yellow-500" },
    { title: "Employees", value: filtered.length, icon: Users, color: "text-primary" },
  ];

  const summaryCards = activeTab === "employee" ? empSummaryCards : adminSummaryCards;

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(sortKeyName)}>
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === sortKeyName ? "text-primary" : "text-muted-foreground"}`} />
      </div>
    </TableHead>
  );

  const isEmployee = activeTab === "employee";
  const payLabel = isEmployee ? "Employee Pay" : "Admin Cost (ex GST)";
  const rateLabel = isEmployee ? "Rate ($/hr)" : "Admin Rate ($/hr)";
  const totalPay = isEmployee ? totalEmployeePay : totalAdminPay;

  const renderTable = () => (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {payLabel} Details ({filtered.length} employee{filtered.length !== 1 ? "s" : ""})
        </CardTitle>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader label="Employee" sortKeyName="name" />
                <TableHead>{rateLabel}</TableHead>
                <SortHeader label="Total Hrs" sortKeyName="total_hours" />
                <TableHead>Breaks</TableHead>
                <SortHeader label="Net Hrs" sortKeyName="net_hours" />
                <SortHeader label={payLabel} sortKeyName={isEmployee ? "employee_pay" : "admin_pay"} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageEntries.map((e) => (
                <TableRow key={e.employee_id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>${(isEmployee ? e.pay_rate : e.admin_hourly_rate).toFixed(2)}</TableCell>
                  <TableCell>{e.total_hours.toFixed(2)}</TableCell>
                  <TableCell>{e.break_hours.toFixed(2)}</TableCell>
                  <TableCell>{e.net_hours.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-semibold">${(isEmployee ? e.employee_pay : e.admin_pay).toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {pageEntries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {loading ? "Loading..." : "No approved payroll data for this period."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {pageEntries.length > 0 && (
              <tfoot>
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell>Totals</TableCell>
                  <TableCell />
                  <TableCell>{(entries.reduce((s, e) => s + e.total_hours, 0)).toFixed(2)}</TableCell>
                  <TableCell>{totalBreakHours.toFixed(2)}</TableCell>
                  <TableCell>{totalNetHours.toFixed(2)}</TableCell>
                  <TableCell className="text-right">${totalPay.toFixed(2)}</TableCell>
                </TableRow>
              </tfoot>
            )}
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderCharts = () => (
    <>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Show top</span>
        <Select value={String(chartLimit)} onValueChange={(v) => setChartLimit(Number(v))}>
          <SelectTrigger className="w-20 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50, 100].map((n) => (
              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">employees in charts</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {payLabel} Distribution{entries.length > chartLimit ? ` (Top ${chartLimit} of ${entries.length})` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={0} angle={-30} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                  <Bar dataKey="pay" name={`${payLabel} ($)`} fill={isEmployee ? "hsl(45, 60%, 53%)" : "hsl(217, 91%, 60%)"} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-16">No data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Hours Breakdown{entries.length > chartLimit ? ` (Top ${chartLimit} of ${entries.length})` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData} dataKey="net_hours" nameKey="name" cx="50%" cy="50%" outerRadius={90} labelLine={false}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-16">No data</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center flex-wrap">
          <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All employees" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border z-50">
              <SelectItem value="all">All Employees</SelectItem>
              {allEmployees.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border z-50">
              <SelectItem value="all">All Departments</SelectItem>
              {[...new Set(allEmployees.map(e => e.department).filter(Boolean))].sort().map((dept) => (
                <SelectItem key={dept!} value={dept!}>{dept}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangeSelector dateFrom={dateFrom} dateTo={dateTo} onChangeFrom={setDateFrom} onChangeTo={setDateTo} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => setEmailDialogOpen(true)}>
            <Mail className="mr-2 h-4 w-4" /> Email CSV
          </Button>
        </div>
      </div>

      {/* Approved-only notice */}
      <Badge variant="outline" className="text-xs px-3 py-1 text-green-500 border-green-500/30">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Showing approved timesheets only
      </Badge>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as "employee" | "admin"); setPage(0); }}>
        <TabsList>
          <TabsTrigger value="employee">Employee Payroll</TabsTrigger>
          <TabsTrigger value="admin">Admin Payroll</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4 mt-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {summaryCards.map(({ title, value, icon: Icon, color }) => (
              <Card key={title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
                  <Icon className={`h-4 w-4 ${color}`} />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {renderCharts()}
          {renderTable()}
        </TabsContent>
      </Tabs>

      <EmailCSVDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        csvData={buildPayrollCSV()}
        csvFilename={payrollCsvFilename}
        subject={payrollCsvSubject}
      />
    </div>
  );
}
