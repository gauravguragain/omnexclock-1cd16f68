import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Search } from "lucide-react";

interface TimesheetEntry {
  employee_id: string;
  employee_name: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_start: string | null;
  break_end: string | null;
  break_minutes: number;
  total_hours: number;
  net_hours: number;
}

export default function TimesheetsPage() {
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  useEffect(() => {
    supabase.from("employees").select("id, name").order("name").then(({ data }) => setEmployees(data || []));
  }, []);

  useEffect(() => {
    fetchTimesheets();
  }, [selectedEmployee, dateFrom, dateTo]);

  const fetchTimesheets = async () => {
    let query = supabase
      .from("clock_events")
      .select("*, employees(name)")
      .gte("timestamp", `${dateFrom}T00:00:00`)
      .lte("timestamp", `${dateTo}T23:59:59`)
      .order("timestamp", { ascending: true });

    if (selectedEmployee !== "all") {
      query = query.eq("employee_id", selectedEmployee);
    }

    const { data } = await query;
    if (!data) return;

    // Process events into daily summaries
    const dailyMap = new Map<string, any>();

    for (const ev of data) {
      const date = new Date(ev.timestamp).toLocaleDateString("en-AU");
      const key = `${ev.employee_id}-${date}`;
      const empName = (ev.employees as any)?.name || "Unknown";

      if (!dailyMap.has(key)) {
        dailyMap.set(key, {
          employee_id: ev.employee_id,
          employee_name: empName,
          date,
          clock_in: null,
          clock_out: null,
          first_break_start: null,
          last_break_end: null,
          break_start: null,
          break_minutes: 0,
        });
      }

      const entry = dailyMap.get(key)!;
      const time = new Date(ev.timestamp);

      switch (ev.event_type) {
        case "clock_in":
          if (!entry.clock_in || time < new Date(entry.clock_in)) entry.clock_in = ev.timestamp;
          break;
        case "clock_out":
          if (!entry.clock_out || time > new Date(entry.clock_out)) entry.clock_out = ev.timestamp;
          break;
        case "break_start":
          entry.break_start = ev.timestamp;
          if (!entry.first_break_start) entry.first_break_start = ev.timestamp;
          break;
          break;
        case "break_end":
          if (entry.break_start) {
            entry.break_minutes += (time.getTime() - new Date(entry.break_start).getTime()) / 60000;
            entry.last_break_end = ev.timestamp;
            entry.break_start = null;
          }
          break;
          }
          break;
      }
    }

    const result: TimesheetEntry[] = Array.from(dailyMap.values()).map((e) => {
      const totalHours = e.clock_in && e.clock_out
        ? (new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()) / 3600000
        : 0;
      const netHours = Math.max(0, totalHours - e.break_minutes / 60);

      return {
        employee_id: e.employee_id,
        employee_name: e.employee_name,
        date: e.date,
        clock_in: e.clock_in ? new Date(e.clock_in).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true }) : null,
        clock_out: e.clock_out ? new Date(e.clock_out).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true }) : null,
        break_start: e.first_break_start ? new Date(e.first_break_start).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true }) : null,
        break_end: e.last_break_end ? new Date(e.last_break_end).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true }) : null,
        break_minutes: Math.round(e.break_minutes),
        total_hours: Math.round(totalHours * 100) / 100,
        net_hours: Math.round(netHours * 100) / 100,
      };
    });

    setEntries(result);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All employees" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full sm:w-40" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full sm:w-40" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead>Break Start</TableHead>
                  <TableHead>Break End</TableHead>
                  <TableHead>Break (min)</TableHead>
                  <TableHead>Total (hrs)</TableHead>
                  <TableHead>Net (hrs)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{e.employee_name}</TableCell>
                    <TableCell>{e.date}</TableCell>
                    <TableCell>{e.clock_in || "-"}</TableCell>
                    <TableCell>{e.clock_out || "-"}</TableCell>
                    <TableCell>{e.break_start || "-"}</TableCell>
                    <TableCell>{e.break_end || "-"}</TableCell>
                    <TableCell>{e.break_minutes}</TableCell>
                    <TableCell>{e.total_hours}</TableCell>
                    <TableCell className="font-semibold">{e.net_hours}</TableCell>
                  </TableRow>
                ))}
                {entries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No timesheet data for this period.
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
