import { useEffect, useState } from "react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CalendarIcon, Search, Pencil, Trash2, Plus, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Download, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { TimeDropdownPicker } from "@/components/TimeDropdownPicker";
import { logAudit } from "@/lib/auditLog";
import { toAusDate, toAusDisplayDate, toAusTime24, toAusTime12, buildAusTimestamp } from "@/lib/dateUtils";
import { EmailCSVDialog } from "@/components/EmailCSVDialog";


interface TimesheetEntry {
  employee_id: string;
  employee_name: string;
  employee_department: string | null;
  date: string;
  raw_date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_start: string | null;
  break_end: string | null;
  break_minutes: number;
  total_hours: number;
  net_hours: number;
  raw_clock_in: string | null;
  raw_clock_out: string | null;
  raw_break_start: string | null;
  raw_break_end: string | null;
  event_ids: string[];
  approved: boolean;
}

interface EditForm {
  employee_id: string;
  date: string;
  clock_in: string;
  clock_out: string;
  break_start: string;
  break_end: string;
  comment: string;
}

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
    const now = new Date();
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




export default function TimesheetsPage() {
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; department: string | null }[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [dateTo, setDateTo] = useState<Date>(() => endOfWeek(new Date(), { weekStartsOn: 1 }));
  const [editDialog, setEditDialog] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({ employee_id: "", date: "", clock_in: "", clock_out: "", break_start: "", break_end: "", comment: "" });
  const [editingEntry, setEditingEntry] = useState<TimesheetEntry | null>(null);
  const [addDialog, setAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [approvals, setApprovals] = useState<Map<string, boolean>>(new Map());
  const [saving, setSaving] = useState(false);
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  useEffect(() => {
    supabase.from("employees").select("id, name, department").eq("active", true).order("name").then(({ data }) => setEmployees(data || []));
  }, []);

  useEffect(() => {
    fetchTimesheets();
  }, [selectedEmployee, dateFrom, dateTo]);

  const fetchTimesheets = async () => {
    const from = format(dateFrom, "yyyy-MM-dd");
    const to = format(dateTo, "yyyy-MM-dd");
    const fromISO = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), dateFrom.getDate(), 0, 0, 0).toISOString();
    const toISO = new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59).toISOString();

    let query = supabase
      .from("clock_events")
      .select("*, employees(name, department)")
      .gte("timestamp", fromISO)
      .lte("timestamp", toISO)
      .order("timestamp", { ascending: true });

    if (selectedEmployee !== "all") {
      query = query.eq("employee_id", selectedEmployee);
    }

    const [{ data }, { data: approvalData }] = await Promise.all([
      query,
      supabase.from("timesheet_approvals").select("employee_id, date, approved").gte("date", from).lte("date", to),
    ]);

    // Build approvals map
    const appMap = new Map<string, boolean>();
    if (approvalData) {
      for (const a of approvalData) {
        appMap.set(`${a.employee_id}-${a.date}`, a.approved);
      }
    }
    setApprovals(appMap);

    if (!data) return;

    const dailyMap = new Map<string, any>();

    for (const ev of data) {
      const evDate = new Date(ev.timestamp);
      const date = toAusDisplayDate(evDate);
      const localDate = toAusDate(evDate);
      const key = `${ev.employee_id}-${localDate}`;
      const empName = (ev.employees as any)?.name || "Unknown";
      const empDept = (ev.employees as any)?.department || null;

      if (!dailyMap.has(key)) {
        dailyMap.set(key, {
          employee_id: ev.employee_id,
          employee_name: empName,
          employee_department: empDept,
          date,
          raw_date: localDate,
          clock_in: null,
          clock_out: null,
          first_break_start: null,
          last_break_end: null,
          break_start: null,
          break_minutes: 0,
          raw_clock_in: null,
          raw_clock_out: null,
          raw_break_start: null,
          raw_break_end: null,
          event_ids: [],
          
        });
      }

      const entry = dailyMap.get(key)!;
      entry.event_ids.push(ev.id);
      const time = new Date(ev.timestamp);

      switch (ev.event_type) {
        case "clock_in":
          if (!entry.clock_in || time < new Date(entry.clock_in)) {
            entry.clock_in = ev.timestamp;
            entry.raw_clock_in = ev.timestamp;
          }
          break;
        case "clock_out":
          if (!entry.clock_out || time > new Date(entry.clock_out)) {
            entry.clock_out = ev.timestamp;
            entry.raw_clock_out = ev.timestamp;
          }
          break;
        case "break_start":
          entry.break_start = ev.timestamp;
          entry.raw_break_start = ev.timestamp;
          if (!entry.first_break_start) entry.first_break_start = ev.timestamp;
          break;
        case "break_end":
          if (entry.break_start) {
            entry.break_minutes += (time.getTime() - new Date(entry.break_start).getTime()) / 60000;
            entry.last_break_end = ev.timestamp;
            entry.raw_break_end = ev.timestamp;
            entry.break_start = null;
          }
          break;
      }
    }

    const result: TimesheetEntry[] = Array.from(dailyMap.values()).map((e) => {
      const totalHours = e.clock_in && e.clock_out
        ? (new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()) / 3600000
        : 0;
      const netHours = Math.max(0, totalHours - e.break_minutes / 60);
      const approvalKey = `${e.employee_id}-${e.raw_date}`;

      return {
        employee_id: e.employee_id,
        employee_name: e.employee_name,
        employee_department: e.employee_department,
        date: e.date,
        raw_date: e.raw_date,
        clock_in: e.clock_in ? toAusTime12(new Date(e.clock_in)) : null,
        clock_out: e.clock_out ? toAusTime12(new Date(e.clock_out)) : null,
        break_start: e.first_break_start ? toAusTime12(new Date(e.first_break_start)) : null,
        break_end: e.last_break_end ? toAusTime12(new Date(e.last_break_end)) : null,
        break_minutes: Math.round(e.break_minutes),
        total_hours: Math.round(totalHours * 100) / 100,
        net_hours: Math.round(netHours * 100) / 100,
        raw_clock_in: e.raw_clock_in,
        raw_clock_out: e.raw_clock_out,
        raw_break_start: e.raw_break_start,
        raw_break_end: e.raw_break_end,
        event_ids: e.event_ids,
        approved: appMap.get(approvalKey) || false,
      };
    });

    setEntries(result);
  };

  const isShiftActive = (entry: TimesheetEntry): boolean => {
    // Shift is active if clocked in but not clocked out
    return !!entry.clock_in && !entry.clock_out;
  };

  const toggleApproval = async (entry: TimesheetEntry) => {
    if (isShiftActive(entry) && !entry.approved) {
      toast.error("Cannot approve: shift is still active. Wait for clock out.");
      return;
    }
    const key = `${entry.employee_id}-${entry.raw_date}`;
    if (approvingIds.has(key)) return;
    setApprovingIds(prev => new Set(prev).add(key));
    try {
      const newApproved = !entry.approved;
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from("timesheet_approvals").upsert({
        employee_id: entry.employee_id,
        date: entry.raw_date,
        approved: newApproved,
        approved_by: user?.id || null,
        approved_at: newApproved ? new Date().toISOString() : null,
      }, { onConflict: "employee_id,date" });

      if (error) { toast.error("Failed to update approval: " + error.message); return; }
      await logAudit(newApproved ? "timesheet_approve" : "timesheet_unapprove", { employee_id: entry.employee_id, employee_name: entry.employee_name, date: entry.date });
      toast.success(newApproved ? "Timesheet approved" : "Approval revoked");
      fetchTimesheets();
    } finally {
      setApprovingIds(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  };

  const approveAll = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const unapproved = filtered.filter(e => !e.approved && !isShiftActive(e));
      if (unapproved.length === 0) { toast.info("No completed shifts to approve"); setSaving(false); return; }

      const records = unapproved.map(e => ({
        employee_id: e.employee_id,
        date: e.raw_date,
        approved: true,
        approved_by: user?.id || null,
        approved_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from("timesheet_approvals").upsert(records, { onConflict: "employee_id,date" });
      if (error) { toast.error("Failed: " + error.message); return; }
      const skippedCount = filtered.filter(e => !e.approved && isShiftActive(e)).length;
      await logAudit("timesheet_approve_all", { count: unapproved.length, employees: unapproved.map(e => ({ id: e.employee_id, name: e.employee_name, date: e.date })) });
      let msg = `Approved ${unapproved.length} timesheets`;
      if (skippedCount > 0) msg += `. Skipped ${skippedCount} active shift(s).`;
      toast.success(msg);
      fetchTimesheets();
    } finally {
      setSaving(false);
    }
  };

  const toTimeInput = (isoTimestamp: string | null) => {
    if (!isoTimestamp) return "";
    return toAusTime24(new Date(isoTimestamp));
  };

  const openEdit = (entry: TimesheetEntry) => {
    if (entry.approved) { toast.error("Cannot edit an approved timesheet. Revoke approval first."); return; }
    setEditingEntry(entry);
    setEditForm({
      employee_id: entry.employee_id,
      date: entry.raw_date,
      clock_in: toTimeInput(entry.raw_clock_in),
      clock_out: toTimeInput(entry.raw_clock_out),
      break_start: toTimeInput(entry.raw_break_start),
      break_end: toTimeInput(entry.raw_break_end),
      comment: "",
    });
    setEditDialog(true);
  };

  const openAdd = () => {
    setEditingEntry(null);
    setEditForm({
      employee_id: employees[0]?.id || "",
      date: format(new Date(), "yyyy-MM-dd"),
      clock_in: "09:00",
      clock_out: "17:00",
      break_start: "",
      break_end: "",
      comment: "",
    });
    setAddDialog(true);
  };

  const saveEdit = async () => {
    if (saving || !editingEntry) return;
    if (!editForm.comment.trim()) { toast.error("Comment is required when editing timesheets"); return; }
    setSaving(true);
    try {
      for (const id of editingEntry.event_ids) {
        await supabase.from("clock_events").delete().eq("id", id);
      }
      const events: { employee_id: string; event_type: "clock_in" | "clock_out" | "break_start" | "break_end"; timestamp: string }[] = [];
      if (editForm.clock_in) events.push({ employee_id: editForm.employee_id, event_type: "clock_in", timestamp: buildAusTimestamp(editForm.date, editForm.clock_in) });
      if (editForm.break_start) events.push({ employee_id: editForm.employee_id, event_type: "break_start", timestamp: buildAusTimestamp(editForm.date, editForm.break_start) });
      if (editForm.break_end) events.push({ employee_id: editForm.employee_id, event_type: "break_end", timestamp: buildAusTimestamp(editForm.date, editForm.break_end) });
      if (editForm.clock_out) events.push({ employee_id: editForm.employee_id, event_type: "clock_out", timestamp: buildAusTimestamp(editForm.date, editForm.clock_out) });
      if (events.length > 0) {
        const { error } = await supabase.from("clock_events").insert(events);
        if (error) { toast.error("Failed to save: " + error.message); return; }
      }
      await logAudit("timesheet_edit", { employee_id: editForm.employee_id, employee_name: editingEntry.employee_name, date: editForm.date, comment: editForm.comment.trim() });
      toast.success("Timesheet updated");
      setEditDialog(false);
      fetchTimesheets();
    } finally {
      setSaving(false);
    }
  };

  const saveAdd = async () => {
    if (saving) return;
    if (!editForm.comment.trim()) { toast.error("Comment is required when adding timesheets"); return; }
    setSaving(true);
    try {
      const events: { employee_id: string; event_type: "clock_in" | "clock_out" | "break_start" | "break_end"; timestamp: string }[] = [];
      if (editForm.clock_in) events.push({ employee_id: editForm.employee_id, event_type: "clock_in", timestamp: buildAusTimestamp(editForm.date, editForm.clock_in) });
      if (editForm.break_start) events.push({ employee_id: editForm.employee_id, event_type: "break_start", timestamp: buildAusTimestamp(editForm.date, editForm.break_start) });
      if (editForm.break_end) events.push({ employee_id: editForm.employee_id, event_type: "break_end", timestamp: buildAusTimestamp(editForm.date, editForm.break_end) });
      if (editForm.clock_out) events.push({ employee_id: editForm.employee_id, event_type: "clock_out", timestamp: buildAusTimestamp(editForm.date, editForm.clock_out) });
      if (events.length === 0) { toast.error("Enter at least one time"); return; }
      const { error } = await supabase.from("clock_events").insert(events);
      if (error) { toast.error("Failed to add: " + error.message); return; }
      const emp = employees.find(e => e.id === editForm.employee_id);
      await logAudit("timesheet_add", { employee_id: editForm.employee_id, employee_name: emp?.name || "Unknown", date: editForm.date, comment: editForm.comment.trim() });
      toast.success("Entry added");
      setAddDialog(false);
      fetchTimesheets();
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entry: TimesheetEntry) => {
    if (entry.approved) { toast.error("Cannot delete an approved timesheet. Revoke approval first."); return; }
    if (saving) return;
    if (!confirm(`Delete all timesheet entries for ${entry.employee_name} on ${entry.date}?`)) return;
    setSaving(true);
    try {
      for (const id of entry.event_ids) {
        await supabase.from("clock_events").delete().eq("id", id);
      }
      await logAudit("timesheet_delete", { employee_id: entry.employee_id, employee_name: entry.employee_name, date: entry.date });
      toast.success("Entry deleted");
      fetchTimesheets();
    } finally {
      setSaving(false);
    }
  };

  const filtered = entries.filter((e) => {
    if (searchQuery && !e.employee_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (selectedDepartment !== "all" && e.employee_department !== selectedDepartment) return false;
    return true;
  });

  const approvedCount = filtered.filter(e => e.approved).length;
  const pendingCount = filtered.length - approvedCount;

  const buildCSV = () => {
    const headers = ["Status", "Employee", "Date", "Clock In", "Clock Out", "Break Start", "Break End", "Break (min)", "Total (hrs)", "Net (hrs)"];
    const rows = filtered.map(e => [
      e.approved ? "Approved" : "Pending",
      e.employee_name,
      e.date,
      e.clock_in || "",
      e.clock_out || "",
      e.break_start || "",
      e.break_end || "",
      e.break_minutes.toString(),
      e.total_hours.toString(),
      e.net_hours.toString(),
    ]);
    return [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  };

  const downloadCSV = () => {
    if (filtered.length === 0) { toast.info("No data to download"); return; }
    const csv = buildCSV();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded timesheet data");
  };

  const csvFilename = `timesheets_${format(dateFrom, "yyyy-MM-dd")}_to_${format(dateTo, "yyyy-MM-dd")}.csv`;
  const csvSubject = `Timesheet Report – ${format(dateFrom, "dd MMM")} to ${format(dateTo, "dd MMM yyyy")}`;

  const editFormFields = (
    <div className="space-y-4">
      {!editingEntry && (
        <div className="space-y-2">
          <Label>Employee</Label>
          <Select value={editForm.employee_id} onValueChange={(v) => setEditForm({ ...editForm, employee_id: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <Label>Date</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !editForm.date && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {editForm.date ? format(new Date(editForm.date + "T00:00:00"), "dd MMM yyyy") : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={editForm.date ? new Date(editForm.date + "T00:00:00") : undefined}
              onSelect={(d) => {
                if (d) setEditForm({ ...editForm, date: format(d, "yyyy-MM-dd") });
              }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Clock In</Label>
          <TimeDropdownPicker value={editForm.clock_in} onChange={(v) => setEditForm({ ...editForm, clock_in: v })} />
        </div>
        <div className="space-y-2">
          <Label>Clock Out</Label>
          <TimeDropdownPicker value={editForm.clock_out} onChange={(v) => setEditForm({ ...editForm, clock_out: v })} />
        </div>
        <div className="space-y-2">
          <Label>Break Start</Label>
          <TimeDropdownPicker value={editForm.break_start} onChange={(v) => setEditForm({ ...editForm, break_start: v })} />
        </div>
        <div className="space-y-2">
          <Label>Break End</Label>
          <TimeDropdownPicker value={editForm.break_end} onChange={(v) => setEditForm({ ...editForm, break_end: v })} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Reason for change <span className="text-destructive">*</span></Label>
        <textarea
          value={editForm.comment}
          onChange={(e) => setEditForm({ ...editForm, comment: e.target.value })}
          placeholder="Enter reason for this timesheet change..."
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          maxLength={500}
          required
        />
        <p className="text-xs text-muted-foreground">{editForm.comment.length}/500 characters</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Filters row */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center flex-wrap">
          <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All employees" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border z-50">
              <SelectItem value="all">All Employees</SelectItem>
              {employees.map((e) => (
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
              {[...new Set(employees.map(e => e.department).filter(Boolean))].sort().map((dept) => (
                <SelectItem key={dept!} value={dept!}>{dept}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangeSelector dateFrom={dateFrom} dateTo={dateTo} onChangeFrom={setDateFrom} onChangeTo={setDateTo} />
        </div>

        {/* Action buttons - wrap on mobile */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={downloadCSV} disabled={filtered.length === 0}>
            <Download className="mr-1.5 h-4 w-4" /> <span className="hidden xs:inline">Download</span> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEmailDialogOpen(true)} disabled={filtered.length === 0}>
            <Mail className="mr-1.5 h-4 w-4" /> Email CSV
          </Button>
          <Button variant="outline" size="sm" onClick={approveAll} disabled={saving} className="text-green-500 border-green-500/30 hover:bg-green-500/10">
            <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve All
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Entry
          </Button>
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="text-xs px-2.5 py-1">
          Total: {filtered.length}
        </Badge>
        <Badge variant="outline" className="text-xs px-2.5 py-1 text-green-500 border-green-500/30">
          <CheckCircle2 className="mr-1 h-3 w-3" /> Approved: {approvedCount}
        </Badge>
        <Badge variant="outline" className="text-xs px-2.5 py-1 text-yellow-500 border-yellow-500/30">
          Pending: {pendingCount}
        </Badge>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-3 sm:px-6">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Timesheets ({filtered.length} entries)
          </CardTitle>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search employees..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile card view */}
          <div className="block md:hidden divide-y divide-border">
            {filtered.map((e, i) => (
              <div key={i} className={cn("p-3 space-y-2", e.approved && "bg-green-500/5")}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleApproval(e)}
                      disabled={approvingIds.has(`${e.employee_id}-${e.raw_date}`)}
                      className={cn("h-7 w-7 p-0", e.approved ? "text-green-500 hover:text-green-400" : "text-muted-foreground hover:text-yellow-500")}
                    >
                      {e.approved ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    </Button>
                    <span className="font-medium text-foreground">{e.employee_name}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(e)} disabled={saving || e.approved} className="h-7 w-7 p-0">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteEntry(e)} disabled={saving || e.approved} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Date</span><span>Clock In</span><span>Clock Out</span>
                  <span className="text-foreground">{e.date}</span>
                  <span className="text-foreground">{e.clock_in || "-"}</span>
                  <span className="text-foreground">{e.clock_out || "-"}</span>
                </div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Break</span><span>Total</span><span className="font-medium">Net</span>
                  <span className="text-foreground">{e.break_minutes}m</span>
                  <span className="text-foreground">{e.total_hours}h</span>
                  <span className="text-foreground font-semibold">{e.net_hours}h</span>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No timesheet data for this period.
              </div>
            )}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Status</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead className="hidden lg:table-cell">Break Start</TableHead>
                  <TableHead className="hidden lg:table-cell">Break End</TableHead>
                  <TableHead>Break</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead className="text-right w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e, i) => (
                  <TableRow key={i} className={e.approved ? "bg-green-500/5" : ""}>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleApproval(e)}
                        disabled={approvingIds.has(`${e.employee_id}-${e.raw_date}`)}
                        className={cn("h-7 px-2", e.approved ? "text-green-500 hover:text-green-400" : "text-muted-foreground hover:text-yellow-500")}
                      >
                        {e.approved ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{e.employee_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{e.date}</TableCell>
                    <TableCell>{e.clock_in || "-"}</TableCell>
                    <TableCell>{e.clock_out || "-"}</TableCell>
                    <TableCell className="hidden lg:table-cell">{e.break_start || "-"}</TableCell>
                    <TableCell className="hidden lg:table-cell">{e.break_end || "-"}</TableCell>
                    <TableCell>{e.break_minutes}m</TableCell>
                    <TableCell>{e.total_hours}h</TableCell>
                    <TableCell className="font-semibold">{e.net_hours}h</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(e)} disabled={saving || e.approved} className="h-7 w-7 p-0">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteEntry(e)} disabled={saving || e.approved} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                      No timesheet data for this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Timesheet — {editingEntry?.employee_name}</DialogTitle>
          </DialogHeader>
          {editFormFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Manual Entry</DialogTitle>
          </DialogHeader>
          {editFormFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Cancel</Button>
            <Button onClick={saveAdd} disabled={saving}>{saving ? "Adding..." : "Add Entry"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EmailCSVDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        csvData={buildCSV()}
        csvFilename={csvFilename}
        subject={csvSubject}
      />
    </div>
  );
}
