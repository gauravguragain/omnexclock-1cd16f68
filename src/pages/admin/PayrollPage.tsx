import { useEffect, useState, useMemo } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { ausNow, ausStartOfDay, ausEndOfDay } from "@/lib/dateUtils";
import { computeTimesheetEntries, filterApprovedEntries } from "@/lib/timesheetUtils";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Download, DollarSign, Clock as ClockIcon, Users, Coffee, Search, ChevronLeft, ChevronRight, ArrowUpDown, CalendarIcon, CheckCircle2, Mail, TrendingUp } from "lucide-react";
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
  admin_pay_incl_gst: number;
  pay_id: string | null;
  account_name: string | null;
  bsb: string | null;
  account_number: string | null;
}

interface DeliverySummary {
  count: number;
  cost_excl_gst: number;
  cost_incl_gst: number;
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
    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" onClick={goToPrevWeek} className="h-8 w-8 shrink-0">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="min-w-0 justify-center text-left font-normal gap-1.5 h-8 px-2.5 text-xs sm:text-sm sm:px-3">
              <CalendarIcon className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">{format(dateFrom, "dd MMM")} — {format(dateTo, "dd MMM yyyy")}</span>
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
        <Button variant="outline" size="icon" onClick={goToNextWeek} className="h-8 w-8 shrink-0">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <Button variant="ghost" size="sm" onClick={goToThisWeek} className="text-primary text-xs h-8 shrink-0">
        Today
      </Button>
    </div>
  );
}

export default function PayrollPage() {
  const { business } = useBusiness();
  const { isSuperAdminOf } = useAuth();
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
  const [activeTab, setActiveTab] = useState<"employee" | "admin" | "margin">("employee");
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  const currentBusinessId = business?.id || "";
  const isSuperAdmin = isSuperAdminOf(currentBusinessId);

  useEffect(() => {
    if (business) fetchPayroll();
  }, [dateFrom, dateTo, business]);

  useEffect(() => {
    if (!business) return;
    const channel = supabase
      .channel("payroll-approvals-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "timesheet_approvals" }, () => {
        fetchPayroll();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [business, dateFrom, dateTo]);

  useEffect(() => { setPage(0); }, [search]);

  const fetchPayroll = async () => {
    setLoading(true);
    const from = format(dateFrom, "yyyy-MM-dd");
    const to = format(dateTo, "yyyy-MM-dd");
    const fromISO = ausStartOfDay(from);
    const toISO = ausEndOfDay(to);

    // Fetch all clock events (paginated), employees, and approved timesheets
    const fetchAllEvents = async () => {
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
        if (lastTimestamp) query = query.gt("timestamp", lastTimestamp);
        const { data } = await query;
        if (!data || data.length === 0) { hasMore = false; }
        else { allEvents.push(...data); lastTimestamp = data[data.length - 1].timestamp; hasMore = data.length === 1000; }
      }
      return allEvents;
    };

    const [{ data: employees }, events, { data: approvalData }, { data: deliveryData }] = await Promise.all([
      supabase.from("employees").select("*").eq("active", true).eq("business_id", business!.id),
      fetchAllEvents(),
      supabase.from("timesheet_approvals").select("employee_id, date, approved").gte("date", from).lte("date", to).eq("approved", true),
      supabase.from("catering_deliveries").select("driver_id, cost_excl_gst, cost_incl_gst, status").eq("business_id", business!.id).gte("delivery_date", from).lte("delivery_date", to).eq("status", "delivered"),
    ]);

    if (!employees) { setLoading(false); return; }

    // Build approved set
    const approvedSet = new Set<string>();
    if (approvalData) {
      for (const a of approvalData) {
        approvedSet.add(`${a.employee_id}-${a.date}`);
      }
    }

    // Aggregate deliveries per driver
    const deliveryAgg = new Map<string, { count: number; exclGst: number; inclGst: number }>();
    if (deliveryData) {
      for (const d of deliveryData as any[]) {
        if (!d.driver_id) continue;
        if (!deliveryAgg.has(d.driver_id)) deliveryAgg.set(d.driver_id, { count: 0, exclGst: 0, inclGst: 0 });
        const agg = deliveryAgg.get(d.driver_id)!;
        agg.count += 1;
        agg.exclGst += Number(d.cost_excl_gst) || 0;
        agg.inclGst += Number(d.cost_incl_gst) || 0;
      }
    }

    // Use shared timesheet computation (same as Timesheets page)
    const allTimesheetEntries = computeTimesheetEntries(events);
    const approvedEntries = filterApprovedEntries(allTimesheetEntries, approvedSet);

    // Aggregate per employee
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const empAgg = new Map<string, { totalHours: number; breakHours: number; netHours: number }>();

    for (const entry of approvedEntries) {
      if (!empMap.has(entry.employee_id)) continue;
      if (!empAgg.has(entry.employee_id)) {
        empAgg.set(entry.employee_id, { totalHours: 0, breakHours: 0, netHours: 0 });
      }
      const agg = empAgg.get(entry.employee_id)!;
      agg.totalHours += entry.total_hours;
      agg.breakHours += entry.break_minutes / 60;
      agg.netHours += entry.net_hours;
    }

    // Merge: ensure drivers with deliveries but no shifts also appear
    const allEmpIds = new Set([...empAgg.keys(), ...deliveryAgg.keys()]);

    const result: PayrollEntry[] = [];
    for (const empId of allEmpIds) {
      const emp = empMap.get(empId);
      if (!emp) continue;
      const agg = empAgg.get(empId) || { totalHours: 0, breakHours: 0, netHours: 0 };
      const delAgg = deliveryAgg.get(empId) || { count: 0, exclGst: 0, inclGst: 0 };
      const netHours = Math.round(agg.netHours * 100) / 100;
      const totalHours = Math.round(agg.totalHours * 100) / 100;
      const breakHours = Math.round(agg.breakHours * 100) / 100;
      const employeePay = Math.round(netHours * emp.pay_rate * 100) / 100;
      const adminPayInclGst = Math.round(netHours * emp.admin_hourly_rate * 100) / 100;
      const adminPay = Math.round(adminPayInclGst / 1.10 * 100) / 100;

      result.push({
        employee_id: empId,
        name: emp.name,
        department: emp.department,
        pay_rate: emp.pay_rate,
        admin_hourly_rate: emp.admin_hourly_rate,
        total_hours: totalHours,
        break_hours: breakHours,
        net_hours: netHours,
        employee_pay: employeePay,
        admin_pay: adminPay,
        admin_pay_incl_gst: adminPayInclGst,
        pay_id: (emp as any).pay_id || null,
        account_name: (emp as any).account_name || null,
        bsb: (emp as any).bsb || null,
        account_number: (emp as any).account_number || null,
        delivery_count: delAgg.count,
        delivery_employee_pay: Math.round(delAgg.exclGst * 100) / 100,
        delivery_admin_pay: Math.round(delAgg.exclGst * 100) / 100,
        delivery_admin_pay_incl_gst: Math.round(delAgg.inclGst * 100) / 100,
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
    if (activeTab === "margin") {
      const headers = "Name,Department,Net Hours,Employee Pay,Admin Cost (ex GST),Admin Cost (incl GST),Margin (ex GST),Margin (incl GST),Margin %\n";
      const rows = filtered.map((e) => {
        const marginEx = e.admin_pay - e.employee_pay;
        const marginIncl = e.admin_pay_incl_gst - e.employee_pay;
        const marginPct = e.admin_pay > 0 ? (marginEx / e.admin_pay * 100) : 0;
        return `${e.name},${e.department || "-"},${e.net_hours.toFixed(2)},${e.employee_pay.toFixed(2)},${e.admin_pay.toFixed(2)},${e.admin_pay_incl_gst.toFixed(2)},${marginEx.toFixed(2)},${marginIncl.toFixed(2)},${marginPct.toFixed(1)}%`;
      }).join("\n");
      const totEmpPay = filtered.reduce((s, e) => s + e.employee_pay, 0);
      const totAdminPay = filtered.reduce((s, e) => s + e.admin_pay, 0);
      const totAdminPayIncl = filtered.reduce((s, e) => s + e.admin_pay_incl_gst, 0);
      const totMarginEx = totAdminPay - totEmpPay;
      const totMarginIncl = totAdminPayIncl - totEmpPay;
      const totNetHrs = filtered.reduce((s, e) => s + e.net_hours, 0);
      const totalRow = `\nTOTAL,,${totNetHrs.toFixed(2)},${totEmpPay.toFixed(2)},${totAdminPay.toFixed(2)},${totAdminPayIncl.toFixed(2)},${totMarginEx.toFixed(2)},${totMarginIncl.toFixed(2)},${totAdminPay > 0 ? (totMarginEx / totAdminPay * 100).toFixed(1) : 0}%`;
      return headers + rows + totalRow;
    }

    const isEmp = activeTab === "employee";
    const headers = isEmp
      ? "Name,Rate ($/hr),Total Hours,Break Hours,Net Hours,Employee Pay,Pay ID,Account Name,BSB,Account Number\n"
      : "Name,Admin Rate ($/hr incl GST),Total Hours,Break Hours,Net Hours,Admin Cost (ex GST),Admin Cost (incl GST)\n";
    // Helper: wrap value so Excel/Sheets won't strip leading + or interpret as formula
    const csvSafe = (v: string | null | undefined) => {
      if (!v) return "";
      // Force Excel/Sheets to treat as literal text using ="value" pattern
      if (/^[+=@\-0]/.test(v) || /^o/i.test(v)) return `"=""${v.replace(/"/g, '""')}"""`;
      if (v.includes(",") || v.includes('"')) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const rows = filtered.map((e) =>
      isEmp
        ? `${e.name},${e.pay_rate.toFixed(2)},${e.total_hours.toFixed(2)},${e.break_hours.toFixed(2)},${e.net_hours.toFixed(2)},${e.employee_pay.toFixed(2)},${csvSafe(e.pay_id)},${csvSafe(e.account_name)},${csvSafe(e.bsb)},${csvSafe(e.account_number)}`
        : `${e.name},${e.admin_hourly_rate.toFixed(2)},${e.total_hours.toFixed(2)},${e.break_hours.toFixed(2)},${e.net_hours.toFixed(2)},${e.admin_pay.toFixed(2)},${e.admin_pay_incl_gst.toFixed(2)}`
    ).join("\n");
    const totTotalHrs = filtered.reduce((s, e) => s + e.total_hours, 0);
    const totBreakHrs = filtered.reduce((s, e) => s + e.break_hours, 0);
    const totNetHrs = filtered.reduce((s, e) => s + e.net_hours, 0);
    const totPay = filtered.reduce((s, e) => s + (isEmp ? e.employee_pay : e.admin_pay), 0);
    const totPayIncl = isEmp ? 0 : filtered.reduce((s, e) => s + e.admin_pay_incl_gst, 0);
    const totalRow = isEmp
      ? `\nTOTAL,,${totTotalHrs.toFixed(2)},${totBreakHrs.toFixed(2)},${totNetHrs.toFixed(2)},${totPay.toFixed(2)}`
      : `\nTOTAL,,${totTotalHrs.toFixed(2)},${totBreakHrs.toFixed(2)},${totNetHrs.toFixed(2)},${totPay.toFixed(2)},${totPayIncl.toFixed(2)}`;
    return headers + rows + totalRow;
  };

  const payrollCsvFilename = `${activeTab}-payroll-${format(dateFrom, "yyyy-MM-dd")}-to-${format(dateTo, "yyyy-MM-dd")}.csv`;
  const payrollCsvSubject = `${activeTab === "employee" ? "Employee" : activeTab === "admin" ? "Admin" : "Margin"} Payroll Report – ${format(dateFrom, "dd MMM")} to ${format(dateTo, "dd MMM yyyy")}`;

  const exportCSV = () => {
    const csv = buildPayrollCSV();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = payrollCsvFilename;
    a.click();
    if (activeTab !== "margin") {
      logAudit("csv_download", {
        source: "payroll",
        tab: activeTab,
        filename: payrollCsvFilename,
        device: getDeviceInfo(),
      });
    }
  };

  const totalEmployeePay = filtered.reduce((sum, e) => sum + e.employee_pay + e.delivery_employee_pay, 0);
  const totalAdminPay = filtered.reduce((sum, e) => sum + e.admin_pay + e.delivery_admin_pay, 0);
  const totalNetHours = filtered.reduce((sum, e) => sum + e.net_hours, 0);
  const totalBreakHours = filtered.reduce((sum, e) => sum + e.break_hours, 0);
  const totalAdminPayInclGst = filtered.reduce((sum, e) => sum + e.admin_pay_incl_gst + e.delivery_admin_pay_incl_gst, 0);
  const totalDeliveryCount = filtered.reduce((sum, e) => sum + e.delivery_count, 0);
  const totalMargin = totalAdminPay - totalEmployeePay;
  const totalMarginInclGst = totalAdminPayInclGst - totalEmployeePay;
  const marginPercentage = totalAdminPay > 0 ? (totalMargin / totalAdminPay * 100) : 0;

  const payKey = activeTab === "margin" ? "admin_pay" : (activeTab === "employee" ? "employee_pay" : "admin_pay");
  const topByPay = [...filtered].sort((a, b) => (b[payKey] as number) - (a[payKey] as number)).slice(0, chartLimit);
  const topByHours = [...filtered].sort((a, b) => b.net_hours - a.net_hours).slice(0, chartLimit);
  const othersPayCount = filtered.length - topByPay.length;
  const othersPay = filtered.reduce((s, e) => s + (e[payKey] as number), 0) - topByPay.reduce((s, e) => s + (e[payKey] as number), 0);
  const othersHours = filtered.reduce((s, e) => s + e.net_hours, 0) - topByHours.reduce((s, e) => s + e.net_hours, 0);

  const empSummaryCards = [
    { title: "Total Employee Pay", value: `$${totalEmployeePay.toFixed(2)}`, icon: DollarSign, color: "text-primary" },
    { title: "Total Net Hours", value: totalNetHours.toFixed(2), icon: ClockIcon, color: "text-green-500" },
    { title: "Total Break Hours", value: totalBreakHours.toFixed(2), icon: Coffee, color: "text-yellow-500" },
    { title: "Employees", value: filtered.length, icon: Users, color: "text-primary" },
  ];

  const adminSummaryCards = [
    { title: "Total Admin Cost (incl GST)", value: `$${totalAdminPayInclGst.toFixed(2)}`, icon: DollarSign, color: "text-primary" },
    { title: "Total Admin Cost (ex GST)", value: `$${totalAdminPay.toFixed(2)}`, icon: DollarSign, color: "text-muted-foreground" },
    { title: "Total Net Hours", value: totalNetHours.toFixed(2), icon: ClockIcon, color: "text-green-500" },
    { title: "Employees", value: filtered.length, icon: Users, color: "text-primary" },
  ];

  const marginSummaryCards = [
    { title: "Margin (ex GST)", value: `$${totalMargin.toFixed(2)}`, icon: TrendingUp, color: "text-green-500" },
    { title: "Margin (incl GST)", value: `$${totalMarginInclGst.toFixed(2)}`, icon: TrendingUp, color: "text-green-400" },
    { title: "Margin %", value: `${marginPercentage.toFixed(1)}%`, icon: TrendingUp, color: "text-primary" },
    { title: "Employee Pay", value: `$${totalEmployeePay.toFixed(2)}`, icon: DollarSign, color: "text-yellow-500" },
  ];

  const summaryCards = activeTab === "employee" ? empSummaryCards : activeTab === "admin" ? adminSummaryCards : marginSummaryCards;

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(sortKeyName)}>
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === sortKeyName ? "text-primary" : "text-muted-foreground"}`} />
      </div>
    </TableHead>
  );

  const isEmployee = activeTab === "employee";
  const isMargin = activeTab === "margin";
  const payLabel = isEmployee ? "Employee Pay" : isMargin ? "Margin" : "Admin Cost (ex GST)";
  const rateLabel = isEmployee ? "Rate ($/hr)" : "Admin Rate ($/hr incl GST)";
  const totalPay = isEmployee ? totalEmployeePay : isMargin ? totalMargin : totalAdminPay;

  const renderMarginTable = () => (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Margin Breakdown ({filtered.length} employee{filtered.length !== 1 ? "s" : ""})
        </CardTitle>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto scrollbar-thin">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none sticky left-0 bg-card z-20 border-r border-border/60 min-w-[140px]" onClick={() => toggleSort("name")}>
                  <div className="flex items-center gap-1">
                    Employee
                    <ArrowUpDown className={`h-3 w-3 ${sortKey === "name" ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                </TableHead>
                <TableHead>Department</TableHead>
                <SortHeader label="Net Hrs" sortKeyName="net_hours" />
                <SortHeader label="Employee Pay" sortKeyName="employee_pay" />
                <SortHeader label="Admin (ex GST)" sortKeyName="admin_pay" />
                <TableHead>Admin (incl GST)</TableHead>
                <TableHead className="text-right">Margin (ex GST)</TableHead>
                <TableHead className="text-right">Margin (incl GST)</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageEntries.map((e) => {
                const totalEmpPay = e.employee_pay + e.delivery_employee_pay;
                const totalAdmPay = e.admin_pay + e.delivery_admin_pay;
                const totalAdmPayIncl = e.admin_pay_incl_gst + e.delivery_admin_pay_incl_gst;
                const marginEx = totalAdmPay - totalEmpPay;
                const marginIncl = totalAdmPayIncl - totalEmpPay;
                const marginPct = totalAdmPay > 0 ? (marginEx / totalAdmPay * 100) : 0;
                return (
                  <TableRow key={e.employee_id}>
                    <TableCell className="font-medium sticky left-0 bg-card z-20 border-r border-border/60">
                      {e.name}
                      {e.delivery_count > 0 && <Badge variant="outline" className="ml-1.5 text-[9px] px-1 py-0">{e.delivery_count} del</Badge>}
                    </TableCell>
                    <TableCell>{e.department || "-"}</TableCell>
                    <TableCell>{e.net_hours.toFixed(2)}</TableCell>
                    <TableCell>${totalEmpPay.toFixed(2)}</TableCell>
                    <TableCell>${totalAdmPay.toFixed(2)}</TableCell>
                    <TableCell>${totalAdmPayIncl.toFixed(2)}</TableCell>
                    <TableCell className={`text-right font-semibold ${marginEx >= 0 ? "text-green-500" : "text-red-500"}`}>
                      ${marginEx.toFixed(2)}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${marginIncl >= 0 ? "text-green-500" : "text-red-500"}`}>
                      ${marginIncl.toFixed(2)}
                    </TableCell>
                    <TableCell className={`text-right ${marginEx >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {marginPct.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                );
              })}
              {pageEntries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    {loading ? "Loading..." : "No approved payroll data for this period."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {pageEntries.length > 0 && (
              <tfoot>
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell className="sticky left-0 bg-muted/50 z-20 border-r border-border/60">Totals</TableCell>
                  <TableCell />
                  <TableCell>{totalNetHours.toFixed(2)}</TableCell>
                  <TableCell>${totalEmployeePay.toFixed(2)}</TableCell>
                  <TableCell>${totalAdminPay.toFixed(2)}</TableCell>
                  <TableCell>${totalAdminPayInclGst.toFixed(2)}</TableCell>
                  <TableCell className={`text-right ${totalMargin >= 0 ? "text-green-500" : "text-red-500"}`}>
                    ${totalMargin.toFixed(2)}
                  </TableCell>
                  <TableCell className={`text-right ${totalMarginInclGst >= 0 ? "text-green-500" : "text-red-500"}`}>
                    ${totalMarginInclGst.toFixed(2)}
                  </TableCell>
                  <TableCell className={`text-right ${totalMargin >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {marginPercentage.toFixed(1)}%
                  </TableCell>
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

  const renderMarginCharts = () => {
    // Chart 1: Employee Pay vs Admin Cost comparison per employee
    const comparisonData = [...filtered]
      .sort((a, b) => (b.admin_pay - b.employee_pay) - (a.admin_pay - a.employee_pay))
      .slice(0, chartLimit)
      .map(e => ({
        name: e.name,
        employee_pay: Math.round(e.employee_pay * 100) / 100,
        admin_cost: Math.round(e.admin_pay * 100) / 100,
      }));

    // Chart 2: Department stacked cost breakdown
    const deptAgg: Record<string, { empPay: number; adminPay: number; hours: number; headcount: number }> = {};
    filtered.forEach(e => {
      const dept = e.department || "Unassigned";
      if (!deptAgg[dept]) deptAgg[dept] = { empPay: 0, adminPay: 0, hours: 0, headcount: 0 };
      deptAgg[dept].empPay += e.employee_pay;
      deptAgg[dept].adminPay += e.admin_pay;
      deptAgg[dept].hours += e.net_hours;
      deptAgg[dept].headcount += 1;
    });
    const deptStackData = Object.entries(deptAgg)
      .map(([dept, d]) => ({
        name: dept,
        employee_pay: Math.round(d.empPay * 100) / 100,
        margin: Math.round((d.adminPay - d.empPay) * 100) / 100,
        hours: Math.round(d.hours * 100) / 100,
        headcount: d.headcount,
        margin_pct: d.adminPay > 0 ? Math.round((d.adminPay - d.empPay) / d.adminPay * 1000) / 10 : 0,
      }))
      .sort((a, b) => (b.employee_pay + b.margin) - (a.employee_pay + a.margin));

    const customTooltip = ({ active, payload, label }: any) => {
      if (!active || !payload?.length) return null;
      return (
        <div style={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
          <p style={{ color: "hsl(var(--popover-foreground))", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{label}</p>
          {payload.map((p: any, i: number) => (
            <p key={i} style={{ color: "hsl(var(--popover-foreground))", fontSize: 12, margin: "2px 0" }}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, backgroundColor: p.color, marginRight: 6 }} />
              {p.name}: ${p.value.toFixed(2)}
            </p>
          ))}
        </div>
      );
    };

    const deptTooltip = ({ active, payload, label }: any) => {
      if (!active || !payload?.length) return null;
      const data = deptStackData.find(d => d.name === label);
      return (
        <div style={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
          <p style={{ color: "hsl(var(--popover-foreground))", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{label}</p>
          {payload.map((p: any, i: number) => (
            <p key={i} style={{ color: "hsl(var(--popover-foreground))", fontSize: 12, margin: "2px 0" }}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, backgroundColor: p.color, marginRight: 6 }} />
              {p.name}: ${p.value.toFixed(2)}
            </p>
          ))}
          {data && (
            <p style={{ color: "hsl(var(--popover-foreground))", fontSize: 11, marginTop: 6, opacity: 0.7 }}>
              {data.headcount} employee{data.headcount !== 1 ? "s" : ""} · {data.hours}h · {data.margin_pct}% margin
            </p>
          )}
        </div>
      );
    };

    return (
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
                Pay vs Cost per Employee{filtered.length > chartLimit ? ` (Top ${chartLimit})` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {comparisonData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={comparisonData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={0} angle={-30} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip content={customTooltip} />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(value: string) => <span style={{ color: "hsl(var(--foreground))" }}>{value}</span>}
                    />
                    <Bar dataKey="employee_pay" name="Employee Pay" fill="hsl(45, 60%, 53%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="admin_cost" name="Admin Cost (ex GST)" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} />
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
                Department Cost Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {deptStackData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={deptStackData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip content={deptTooltip} />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(value: string) => <span style={{ color: "hsl(var(--foreground))" }}>{value}</span>}
                    />
                    <Bar dataKey="employee_pay" name="Employee Pay" stackId="cost" fill="hsl(45, 60%, 53%)" />
                    <Bar dataKey="margin" name="Margin (ex GST)" stackId="cost" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-16">No data</p>
              )}
            </CardContent>
          </Card>
        </div>
      </>
    );
  };

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
        <div className="overflow-x-auto scrollbar-thin">
          <Table>
             <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none sticky left-0 bg-card z-20 border-r border-border/60 min-w-[140px]" onClick={() => toggleSort("name")}>
                  <div className="flex items-center gap-1">
                    Employee
                    <ArrowUpDown className={`h-3 w-3 ${sortKey === "name" ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                </TableHead>
                <TableHead>{rateLabel}</TableHead>
                <SortHeader label="Total Hrs" sortKeyName="total_hours" />
                <TableHead>Breaks</TableHead>
                <SortHeader label="Net Hrs" sortKeyName="net_hours" />
                <SortHeader label={payLabel} sortKeyName={isEmployee ? "employee_pay" : "admin_pay"} />
                {!isEmployee && <TableHead className="text-right">Incl GST</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageEntries.flatMap((e) => {
                const hasDelivery = e.delivery_count > 0;
                const rows = [];
                // Shift row (only if they have hours)
                if (e.net_hours > 0) {
                  rows.push(
                    <TableRow key={e.employee_id + "-shift"}>
                      <TableCell className="font-medium sticky left-0 bg-card z-20 border-r border-border/60">{e.name}</TableCell>
                      <TableCell>${(isEmployee ? e.pay_rate : e.admin_hourly_rate).toFixed(2)}</TableCell>
                      <TableCell>{e.total_hours.toFixed(2)}</TableCell>
                      <TableCell>{e.break_hours.toFixed(2)}</TableCell>
                      <TableCell>{e.net_hours.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">${(isEmployee ? e.employee_pay : e.admin_pay).toFixed(2)}</TableCell>
                      {!isEmployee && <TableCell className="text-right text-muted-foreground">${e.admin_pay_incl_gst.toFixed(2)}</TableCell>}
                    </TableRow>
                  );
                }
                // Delivery row
                if (hasDelivery) {
                  const delPay = isEmployee ? e.delivery_employee_pay : e.delivery_admin_pay;
                  rows.push(
                    <TableRow key={e.employee_id + "-delivery"} className="bg-primary/5 border-l-2 border-l-primary">
                      <TableCell className="font-medium sticky left-0 bg-primary/5 z-20 border-r border-border/60">
                        <span className="flex items-center gap-1.5">
                          {e.net_hours > 0 ? "" : e.name}
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">
                            🚚 Delivery ×{e.delivery_count}
                          </Badge>
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground italic">flat rate</TableCell>
                      <TableCell className="text-xs text-muted-foreground">—</TableCell>
                      <TableCell className="text-xs text-muted-foreground">—</TableCell>
                      <TableCell className="text-xs text-muted-foreground">—</TableCell>
                      <TableCell className="text-right font-semibold">${delPay.toFixed(2)}</TableCell>
                      {!isEmployee && <TableCell className="text-right text-muted-foreground">${e.delivery_admin_pay_incl_gst.toFixed(2)}</TableCell>}
                    </TableRow>
                  );
                }
                // If employee has neither shifts nor deliveries, show empty row
                if (rows.length === 0) {
                  rows.push(
                    <TableRow key={e.employee_id}>
                      <TableCell className="font-medium sticky left-0 bg-card z-20 border-r border-border/60">{e.name}</TableCell>
                      <TableCell>${(isEmployee ? e.pay_rate : e.admin_hourly_rate).toFixed(2)}</TableCell>
                      <TableCell>{e.total_hours.toFixed(2)}</TableCell>
                      <TableCell>{e.break_hours.toFixed(2)}</TableCell>
                      <TableCell>{e.net_hours.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">$0.00</TableCell>
                      {!isEmployee && <TableCell className="text-right text-muted-foreground">$0.00</TableCell>}
                    </TableRow>
                  );
                }
                return rows;
              })}
              {pageEntries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isEmployee ? 6 : 7} className="text-center text-muted-foreground py-8">
                    {loading ? "Loading..." : "No approved payroll data for this period."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {pageEntries.length > 0 && (
              <tfoot>
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell className="sticky left-0 bg-muted/50 z-20 border-r border-border/60">Totals</TableCell>
                  <TableCell />
                  <TableCell>{filtered.reduce((s, e) => s + e.total_hours, 0).toFixed(2)}</TableCell>
                  <TableCell>{totalBreakHours.toFixed(2)}</TableCell>
                  <TableCell>{totalNetHours.toFixed(2)}</TableCell>
                  <TableCell className="text-right">${totalPay.toFixed(2)}</TableCell>
                  {!isEmployee && <TableCell className="text-right text-muted-foreground">${totalAdminPayInclGst.toFixed(2)}</TableCell>}
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

  const barData = othersPayCount > 0
    ? [...topByPay.map(e => ({ name: e.name, pay: e[payKey] as number })), { name: `Others (${othersPayCount})`, pay: Math.round(othersPay * 100) / 100 }]
    : topByPay.map(e => ({ name: e.name, pay: e[payKey] as number }));

  const pieData = filtered.length > chartLimit
    ? [...topByHours.map(e => ({ name: e.name, net_hours: e.net_hours })), { name: `Others (${filtered.length - chartLimit})`, net_hours: Math.round(othersHours * 100) / 100 }]
    : (topByHours.length > 0 ? topByHours : filtered).map(e => ({ name: e.name, net_hours: e.net_hours }));

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
    <div className="space-y-4 overflow-x-hidden pb-20 lg:pb-0">
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:items-center sm:flex-wrap">
          <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
            <SelectTrigger className="w-full sm:w-44 h-8 text-xs sm:text-sm">
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
            <SelectTrigger className="w-full sm:w-44 h-8 text-xs sm:text-sm">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border z-50">
              <SelectItem value="all">All Departments</SelectItem>
              {[...new Set(allEmployees.map(e => e.department).filter(Boolean))].sort().map((dept) => (
                <SelectItem key={dept!} value={dept!}>{dept}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <DateRangeSelector dateFrom={dateFrom} dateTo={dateTo} onChangeFrom={setDateFrom} onChangeTo={setDateTo} />
          <div className="flex gap-1.5 shrink-0">
            <Button variant="outline" size="sm" onClick={exportCSV} className="h-8 text-xs gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEmailDialogOpen(true)} className="h-8 text-xs gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Email
            </Button>
          </div>
        </div>
      </div>

      {/* Approved-only notice */}
      <Badge variant="outline" className="text-xs px-3 py-1 text-green-500 border-green-500/30">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Showing approved timesheets only
      </Badge>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as "employee" | "admin" | "margin"); setPage(0); }}>
        <TabsList className="w-full flex overflow-x-auto scrollbar-hide">
          <TabsTrigger value="employee" className="flex-1 text-xs sm:text-sm whitespace-nowrap">Employee</TabsTrigger>
          <TabsTrigger value="admin" className="flex-1 text-xs sm:text-sm whitespace-nowrap">Admin</TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="margin" className="flex-1 text-xs sm:text-sm whitespace-nowrap gap-1">
              <TrendingUp className="h-3 w-3" /> Margin
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="employee" className="space-y-3 mt-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 stagger-children">
            {empSummaryCards.map(({ title, value, icon: Icon, color }) => (
              <Card key={title} className="stat-card group">
                <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">{title}</CardTitle>
                  <div className="h-7 w-7 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0">
                    <Icon className={`h-3.5 w-3.5 ${color}`} />
                  </div>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold tabular-smooth truncate">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {renderCharts()}
          {renderTable()}
        </TabsContent>

        <TabsContent value="admin" className="space-y-3 mt-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 stagger-children">
            {adminSummaryCards.map(({ title, value, icon: Icon, color }) => (
              <Card key={title} className="stat-card group">
                <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">{title}</CardTitle>
                  <div className="h-7 w-7 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0">
                    <Icon className={`h-3.5 w-3.5 ${color}`} />
                  </div>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold tabular-smooth truncate">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {renderCharts()}
          {renderTable()}
        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="margin" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 stagger-children">
              {marginSummaryCards.map(({ title, value, icon: Icon, color }) => (
                <Card key={title} className="stat-card group">
                  <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">{title}</CardTitle>
                    <div className="h-7 w-7 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0">
                      <Icon className={`h-3.5 w-3.5 ${color}`} />
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 pt-0">
                    <p className="text-lg sm:text-xl lg:text-2xl font-bold tabular-smooth truncate">{value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            {renderMarginCharts()}
            {renderMarginTable()}
          </TabsContent>
        )}
      </Tabs>

      <EmailCSVDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        csvData={buildPayrollCSV()}
        csvFilename={payrollCsvFilename}
        subject={payrollCsvSubject}
        skipAudit={activeTab === "margin"}
      />
    </div>
  );
}
