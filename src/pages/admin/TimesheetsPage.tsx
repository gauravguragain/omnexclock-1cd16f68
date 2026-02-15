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
import { CalendarIcon, Search, Pencil, Trash2, Plus, ChevronLeft, ChevronRight, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { TimeDropdownPicker } from "@/components/TimeDropdownPicker";
import { logAudit } from "@/lib/auditLog";

interface TimesheetEntry {
  employee_id: string;
  employee_name: string;
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
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [dateTo, setDateTo] = useState<Date>(() => endOfWeek(new Date(), { weekStartsOn: 1 }));
  const [editDialog, setEditDialog] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({ employee_id: "", date: "", clock_in: "", clock_out: "", break_start: "", break_end: "", comment: "" });
  const [editingEntry, setEditingEntry] = useState<TimesheetEntry | null>(null);
  const [addDialog, setAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [approvals, setApprovals] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    supabase.from("employees").select("id, name").eq("active", true).order("name").then(({ data }) => setEmployees(data || []));
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
      .select("*, employees(name)")
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
      const date = evDate.toLocaleDateString("en-AU");
      const localDate = `${evDate.getFullYear()}-${String(evDate.getMonth() + 1).padStart(2, "0")}-${String(evDate.getDate()).padStart(2, "0")}`;
      const key = `${ev.employee_id}-${date}`;
      const empName = (ev.employees as any)?.name || "Unknown";

      if (!dailyMap.has(key)) {
        dailyMap.set(key, {
          employee_id: ev.employee_id,
          employee_name: empName,
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
        date: e.date,
        raw_date: e.raw_date,
        clock_in: e.clock_in ? new Date(e.clock_in).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true }) : null,
        clock_out: e.clock_out ? new Date(e.clock_out).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true }) : null,
        break_start: e.first_break_start ? new Date(e.first_break_start).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true }) : null,
        break_end: e.last_break_end ? new Date(e.last_break_end).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true }) : null,
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

  const toggleApproval = async (entry: TimesheetEntry) => {
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
  };

  const approveAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const unapproved = filtered.filter(e => !e.approved);
    if (unapproved.length === 0) { toast.info("All timesheets already approved"); return; }

    const records = unapproved.map(e => ({
      employee_id: e.employee_id,
      date: e.raw_date,
      approved: true,
      approved_by: user?.id || null,
      approved_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("timesheet_approvals").upsert(records, { onConflict: "employee_id,date" });
    if (error) { toast.error("Failed: " + error.message); return; }
    await logAudit("timesheet_approve_all", { count: unapproved.length, employees: unapproved.map(e => ({ id: e.employee_id, name: e.employee_name, date: e.date })) });
    toast.success(`Approved ${unapproved.length} timesheets`);
    fetchTimesheets();
  };

  const toTimeInput = (isoTimestamp: string | null) => {
    if (!isoTimestamp) return "";
    const d = new Date(isoTimestamp);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const openEdit = (entry: TimesheetEntry) => {
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
    if (!editingEntry) return;
    if (!editForm.comment.trim()) { toast.error("Comment is required when editing timesheets"); return; }
    for (const id of editingEntry.event_ids) {
      await supabase.from("clock_events").delete().eq("id", id);
    }
    const events: { employee_id: string; event_type: "clock_in" | "clock_out" | "break_start" | "break_end"; timestamp: string }[] = [];
    if (editForm.clock_in) events.push({ employee_id: editForm.employee_id, event_type: "clock_in", timestamp: `${editForm.date}T${editForm.clock_in}:00` });
    if (editForm.break_start) events.push({ employee_id: editForm.employee_id, event_type: "break_start", timestamp: `${editForm.date}T${editForm.break_start}:00` });
    if (editForm.break_end) events.push({ employee_id: editForm.employee_id, event_type: "break_end", timestamp: `${editForm.date}T${editForm.break_end}:00` });
    if (editForm.clock_out) events.push({ employee_id: editForm.employee_id, event_type: "clock_out", timestamp: `${editForm.date}T${editForm.clock_out}:00` });
    if (events.length > 0) {
      const { error } = await supabase.from("clock_events").insert(events);
      if (error) { toast.error("Failed to save: " + error.message); return; }
    }
    // Log to audit
    await logAudit("timesheet_edit", { employee_id: editForm.employee_id, employee_name: editingEntry.employee_name, date: editForm.date, comment: editForm.comment.trim() });
    toast.success("Timesheet updated");
    setEditDialog(false);
    fetchTimesheets();
  };

  const saveAdd = async () => {
    if (!editForm.comment.trim()) { toast.error("Comment is required when adding timesheets"); return; }
    const events: { employee_id: string; event_type: "clock_in" | "clock_out" | "break_start" | "break_end"; timestamp: string }[] = [];
    if (editForm.clock_in) events.push({ employee_id: editForm.employee_id, event_type: "clock_in", timestamp: `${editForm.date}T${editForm.clock_in}:00` });
    if (editForm.break_start) events.push({ employee_id: editForm.employee_id, event_type: "break_start", timestamp: `${editForm.date}T${editForm.break_start}:00` });
    if (editForm.break_end) events.push({ employee_id: editForm.employee_id, event_type: "break_end", timestamp: `${editForm.date}T${editForm.break_end}:00` });
    if (editForm.clock_out) events.push({ employee_id: editForm.employee_id, event_type: "clock_out", timestamp: `${editForm.date}T${editForm.clock_out}:00` });
    if (events.length === 0) { toast.error("Enter at least one time"); return; }
    const { error } = await supabase.from("clock_events").insert(events);
    if (error) { toast.error("Failed to add: " + error.message); return; }
    const emp = employees.find(e => e.id === editForm.employee_id);
    await logAudit("timesheet_add", { employee_id: editForm.employee_id, employee_name: emp?.name || "Unknown", date: editForm.date, comment: editForm.comment.trim() });
    toast.success("Entry added");
    setAddDialog(false);
    fetchTimesheets();
  };

  const deleteEntry = async (entry: TimesheetEntry) => {
    if (!confirm(`Delete all timesheet entries for ${entry.employee_name} on ${entry.date}?`)) return;
    for (const id of entry.event_ids) {
      await supabase.from("clock_events").delete().eq("id", id);
    }
    await logAudit("timesheet_delete", { employee_id: entry.employee_id, employee_name: entry.employee_name, date: entry.date });
    toast.success("Entry deleted");
    fetchTimesheets();
  };

  const filtered = searchQuery
    ? entries.filter((e) => e.employee_name.toLowerCase().includes(searchQuery.toLowerCase()))
    : entries;

  const approvedCount = filtered.filter(e => e.approved).length;
  const pendingCount = filtered.length - approvedCount;

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
        <Input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
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
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
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
          <DateRangeSelector dateFrom={dateFrom} dateTo={dateTo} onChangeFrom={setDateFrom} onChangeTo={setDateTo} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={approveAll} className="text-green-500 border-green-500/30 hover:bg-green-500/10">
            <CheckCircle2 className="mr-2 h-4 w-4" /> Approve All
          </Button>
          <Button onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" /> Add Entry
          </Button>
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex gap-3">
        <Badge variant="outline" className="text-xs px-3 py-1">
          Total: {filtered.length}
        </Badge>
        <Badge variant="outline" className="text-xs px-3 py-1 text-green-500 border-green-500/30">
          <CheckCircle2 className="mr-1 h-3 w-3" /> Approved: {approvedCount}
        </Badge>
        <Badge variant="outline" className="text-xs px-3 py-1 text-yellow-500 border-yellow-500/30">
          Pending: {pendingCount}
        </Badge>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Timesheets ({filtered.length} entries)
          </CardTitle>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search employees..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead>Break Start</TableHead>
                  <TableHead>Break End</TableHead>
                  <TableHead>Break (min)</TableHead>
                  <TableHead>Total (hrs)</TableHead>
                  <TableHead>Net (hrs)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                        className={cn("h-7 px-2", e.approved ? "text-green-500 hover:text-green-400" : "text-muted-foreground hover:text-yellow-500")}
                      >
                        {e.approved ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{e.employee_name}</TableCell>
                    <TableCell>{e.date}</TableCell>
                    <TableCell>{e.clock_in || "-"}</TableCell>
                    <TableCell>{e.clock_out || "-"}</TableCell>
                    <TableCell>{e.break_start || "-"}</TableCell>
                    <TableCell>{e.break_end || "-"}</TableCell>
                    <TableCell>{e.break_minutes}</TableCell>
                    <TableCell>{e.total_hours}</TableCell>
                    <TableCell className="font-semibold">{e.net_hours}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(e)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteEntry(e)} className="text-destructive hover:text-destructive">
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
            <Button onClick={saveEdit}>Save Changes</Button>
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
            <Button onClick={saveAdd}>Add Entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
