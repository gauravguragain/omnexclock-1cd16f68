import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, DollarSign, Clock as ClockIcon, Users, Coffee } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const CHART_COLORS = [
  "hsl(45, 60%, 53%)", "hsl(142, 71%, 45%)", "hsl(217, 91%, 60%)",
  "hsl(0, 84%, 60%)", "hsl(280, 67%, 55%)", "hsl(30, 90%, 55%)",
];

interface PayrollEntry {
  employee_id: string;
  name: string;
  pay_rate: number;
  total_hours: number;
  break_hours: number;
  net_hours: number;
  gross_pay: number;
}

export default function PayrollPage() {
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - (d.getDay() || 7));
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  useEffect(() => {
    fetchPayroll();
  }, [dateFrom, dateTo]);

  const fetchPayroll = async () => {
    const [{ data: employees }, { data: events }] = await Promise.all([
      supabase.from("employees").select("*").eq("active", true),
      supabase.from("clock_events").select("*").gte("timestamp", `${dateFrom}T00:00:00`).lte("timestamp", `${dateTo}T23:59:59`).order("timestamp"),
    ]);

    if (!employees || !events) return;

    const empMap = new Map(employees.map((e) => [e.id, e]));
    const eventsByEmp = new Map<string, typeof events>();

    for (const ev of events) {
      if (!eventsByEmp.has(ev.employee_id)) eventsByEmp.set(ev.employee_id, []);
      eventsByEmp.get(ev.employee_id)!.push(ev);
    }

    const result: PayrollEntry[] = [];

    for (const [empId, empEvents] of eventsByEmp) {
      const emp = empMap.get(empId);
      if (!emp) continue;

      // Group by day
      const days = new Map<string, any[]>();
      for (const ev of empEvents) {
        const day = new Date(ev.timestamp).toDateString();
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

      result.push({
        employee_id: empId,
        name: emp.name,
        pay_rate: emp.pay_rate,
        total_hours: Math.round(totalHours * 100) / 100,
        break_hours: Math.round(breakHours * 100) / 100,
        net_hours: Math.round(netHours * 100) / 100,
        gross_pay: Math.round(netHours * emp.pay_rate * 100) / 100,
      });
    }

    setEntries(result);
  };

  const exportCSV = () => {
    const headers = "Name,Pay Rate,Total Hours,Break Hours,Net Hours,Gross Pay\n";
    const rows = entries.map((e) => `${e.name},${e.pay_rate},${e.total_hours},${e.break_hours},${e.net_hours},${e.gross_pay}`).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${dateFrom}-to-${dateTo}.csv`;
    a.click();
  };

  const totalPayrollAmount = entries.reduce((sum, e) => sum + e.gross_pay, 0);
  const totalNetHours = entries.reduce((sum, e) => sum + e.net_hours, 0);
  const totalBreakHours = entries.reduce((sum, e) => sum + e.break_hours, 0);

  const summaryCards = [
    { title: "Total Payroll", value: `$${totalPayrollAmount.toFixed(2)}`, icon: DollarSign, color: "text-primary" },
    { title: "Total Net Hours", value: Math.round(totalNetHours * 10) / 10, icon: ClockIcon, color: "text-success" },
    { title: "Total Break Hours", value: Math.round(totalBreakHours * 10) / 10, icon: Coffee, color: "text-warning" },
    { title: "Employees", value: entries.length, icon: Users, color: "text-primary" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="flex gap-3">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
        </div>
        <Button variant="outline" onClick={exportCSV}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Pay Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {entries.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={entries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                  <Bar dataKey="gross_pay" name="Gross Pay ($)" fill="hsl(45, 60%, 53%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-16">No data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Hours Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {entries.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={entries} dataKey="net_hours" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}h`} labelLine={false}>
                    {entries.map((_, i) => (
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
      {/* Payroll Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Payroll Details</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Rate ($/hr)</TableHead>
                  <TableHead>Total Hours</TableHead>
                  <TableHead>Breaks (hrs)</TableHead>
                  <TableHead>Net Hours</TableHead>
                  <TableHead className="text-right">Gross Pay</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.employee_id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell>${e.pay_rate}</TableCell>
                    <TableCell>{e.total_hours}</TableCell>
                    <TableCell>{e.break_hours}</TableCell>
                    <TableCell>{e.net_hours}</TableCell>
                    <TableCell className="text-right font-semibold">${e.gross_pay.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {entries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No payroll data for this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
