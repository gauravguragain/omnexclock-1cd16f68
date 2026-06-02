import { useEffect, useState } from "react";
import { useActionLock } from "@/contexts/ActionLockContext";
import { useBusiness } from "@/contexts/BusinessContext";
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
import { CalendarIcon, Search, Pencil, Trash2, Plus, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Download, Mail, History, FileDown, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { TimeDropdownPicker } from "@/components/TimeDropdownPicker";
import { logAudit, getDeviceInfo } from "@/lib/auditLog";
import { toAusDate, toAusDisplayDate, toAusTime24, toAusTime12, buildAusTimestamp, ausToday, ausNow, ausStartOfDay, ausEndOfDay, ensureTime12 } from "@/lib/dateUtils";
import { useAuth } from "@/contexts/AuthContext";
import { EmailPDFDialog } from "@/components/EmailPDFDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { buildExportFilename } from "@/lib/exportNaming";
import { getPublicHolidayName } from "@/lib/publicHolidays";

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
  clock_out_notes: string | null;
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
    const now = ausNow();
    onChangeFrom(startOfWeek(now, { weekStartsOn: 1 }));
    onChangeTo(endOfWeek(now, { weekStartsOn: 1 }));
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="icon" onClick={goToPrevWeek} className="h-9 w-9 shrink-0">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="min-w-0 justify-center text-left font-normal gap-2 text-xs sm:text-sm">
              <CalendarIcon className="h-4 w-4 text-primary shrink-0" />
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
        <Button variant="outline" size="icon" onClick={goToNextWeek} className="h-9 w-9 shrink-0">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <Button variant="ghost" size="sm" onClick={goToThisWeek} className="text-primary text-xs shrink-0">
        Today
      </Button>
    </div>
  );
}



export default function TimesheetsPage() {
  const { runAction } = useActionLock();
  const { isViewer, isAdminOf, isSuperAdminOf, isRosterAdminOf, getRosterAdminDepartments } = useAuth();
  const { business } = useBusiness();
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [allEmployees, setAllEmployees] = useState<{ id: string; name: string; department: string | null }[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date>(() => startOfWeek(ausNow(), { weekStartsOn: 1 }));
  const [dateTo, setDateTo] = useState<Date>(() => endOfWeek(ausNow(), { weekStartsOn: 1 }));
  const [editDialog, setEditDialog] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({ employee_id: "", date: "", clock_in: "", clock_out: "", break_start: "", break_end: "", comment: "" });
  const [editingEntry, setEditingEntry] = useState<TimesheetEntry | null>(null);
  const [addDialog, setAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [approvals, setApprovals] = useState<Map<string, boolean>>(new Map());
  const [saving, setSaving] = useState(false);
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [historyDialog, setHistoryDialog] = useState(false);
  const [historyEntry, setHistoryEntry] = useState<{ employee_name: string; date: string } | null>(null);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const currentBusinessId = business?.id || "";
  const isAdmin = isAdminOf(currentBusinessId) || isSuperAdminOf(currentBusinessId);
  const isRosterAdmin = isRosterAdminOf(currentBusinessId) && !isAdmin;
  const rosterDepts = getRosterAdminDepartments(currentBusinessId);
  const lockedDepartment = isRosterAdmin && rosterDepts.length > 0 ? rosterDepts[0] : null;

  // Filter employees to only those in roster admin's department
  const employees = isRosterAdmin && rosterDepts.length > 0
    ? allEmployees.filter(e => e.department && rosterDepts.map(d => d.toUpperCase()).includes(e.department.toUpperCase()))
    : allEmployees;

  // Auto-lock department filter for roster admins
  useEffect(() => {
    if (lockedDepartment) {
      setSelectedDepartment(lockedDepartment);
    }
  }, [lockedDepartment]);

  const openHistory = async (entry: TimesheetEntry) => {
    setHistoryEntry({ employee_name: entry.employee_name, date: entry.date });
    setHistoryDialog(true);
    setHistoryLoading(true);
    try {
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .in("action", ["timesheet_edit", "timesheet_add", "timesheet_delete", "timesheet_approve", "timesheet_unapprove"])
        .order("timestamp", { ascending: false });
      const filtered = (data || []).filter((log: any) => {
        const d = log.details as any;
        return d?.employee_name === entry.employee_name && (d?.date === entry.raw_date || d?.date === entry.date);
      });
      setHistoryLogs(filtered);
    } catch {
      setHistoryLogs([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!business) return;
    supabase.from("employees").select("id, name, department").eq("active", true).eq("business_id", business.id).order("name").then(({ data }) => setAllEmployees(data || []));
  }, [business]);

  useEffect(() => {
    if (business) fetchTimesheets();
  }, [selectedEmployee, dateFrom, dateTo, business]);

  const fetchTimesheets = async () => {
    const from = format(dateFrom, "yyyy-MM-dd");
    const to = format(dateTo, "yyyy-MM-dd");
    const fromISO = ausStartOfDay(from);
    const toISO = ausEndOfDay(to);

    let query = supabase
      .from("clock_events")
      .select("*, employees!inner(name, department, business_id)")
      .eq("employees.business_id", business!.id)
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
          clock_out_notes: null,
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
          if ((ev as any).notes) {
            entry.clock_out_notes = (ev as any).notes;
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
      let totalHours = e.clock_in && e.clock_out
        ? (new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()) / 3600000
        : 0;
      // Handle overnight shifts: if result is negative, the shift crossed midnight
      if (totalHours < 0) totalHours += 24;
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
        clock_out_notes: e.clock_out_notes || null,
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
    await runAction(async () => {
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
    });
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
      date: ausToday(),
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
    await runAction(async () => {
      setSaving(true);
      try {
        for (const id of editingEntry.event_ids) {
          await supabase.from("clock_events").delete().eq("id", id);
        }
        // Handle overnight shifts: if a time is earlier than clock_in, it's the next day
        const nextDate = (() => {
          const [y, m, d] = editForm.date.split("-").map(Number);
          const nd = new Date(y, m - 1, d + 1);
          return nd.toISOString().slice(0, 10);
        })();
        const isOvernight = (time: string) => editForm.clock_in && time < editForm.clock_in;
        const dateFor = (time: string) => isOvernight(time) ? nextDate : editForm.date;

        const events: { employee_id: string; event_type: "clock_in" | "clock_out" | "break_start" | "break_end"; timestamp: string; created_at: string }[] = [];
        if (editForm.clock_in) events.push({ employee_id: editForm.employee_id, event_type: "clock_in", timestamp: buildAusTimestamp(editForm.date, editForm.clock_in), created_at: buildAusTimestamp(editForm.date, editForm.clock_in) });
        if (editForm.break_start) events.push({ employee_id: editForm.employee_id, event_type: "break_start", timestamp: buildAusTimestamp(dateFor(editForm.break_start), editForm.break_start), created_at: buildAusTimestamp(dateFor(editForm.break_start), editForm.break_start) });
        if (editForm.break_end) events.push({ employee_id: editForm.employee_id, event_type: "break_end", timestamp: buildAusTimestamp(dateFor(editForm.break_end), editForm.break_end), created_at: buildAusTimestamp(dateFor(editForm.break_end), editForm.break_end) });
        if (editForm.clock_out) events.push({ employee_id: editForm.employee_id, event_type: "clock_out", timestamp: buildAusTimestamp(dateFor(editForm.clock_out), editForm.clock_out), created_at: buildAusTimestamp(dateFor(editForm.clock_out), editForm.clock_out) });
        if (events.length > 0) {
          const { error } = await supabase.from("clock_events").insert(events);
          if (error) { toast.error("Failed to save: " + error.message); return; }
        }
        await logAudit("timesheet_edit", {
          employee_id: editForm.employee_id,
          employee_name: editingEntry.employee_name,
          date: editForm.date,
          comment: editForm.comment.trim(),
          previous: {
            clock_in: editingEntry.clock_in,
            clock_out: editingEntry.clock_out,
            break_start: editingEntry.break_start,
            break_end: editingEntry.break_end,
          },
          updated: {
            clock_in: editForm.clock_in || null,
            clock_out: editForm.clock_out || null,
            break_start: editForm.break_start || null,
            break_end: editForm.break_end || null,
          },
        });
        toast.success("Timesheet updated");
        setEditDialog(false);
        fetchTimesheets();
      } finally {
        setSaving(false);
      }
    });
  };

  const saveAdd = async () => {
    if (saving) return;
    if (!editForm.comment.trim()) { toast.error("Comment is required when adding timesheets"); return; }
    await runAction(async () => {
      setSaving(true);
      try {
        // Handle overnight shifts: if a time is earlier than clock_in, it's the next day
        const nextDate = (() => {
          const [y, m, d] = editForm.date.split("-").map(Number);
          const nd = new Date(y, m - 1, d + 1);
          return nd.toISOString().slice(0, 10);
        })();
        const isOvernight = (time: string) => editForm.clock_in && time < editForm.clock_in;
        const dateFor = (time: string) => isOvernight(time) ? nextDate : editForm.date;

        const events: { employee_id: string; event_type: "clock_in" | "clock_out" | "break_start" | "break_end"; timestamp: string; created_at: string }[] = [];
        if (editForm.clock_in) events.push({ employee_id: editForm.employee_id, event_type: "clock_in", timestamp: buildAusTimestamp(editForm.date, editForm.clock_in), created_at: buildAusTimestamp(editForm.date, editForm.clock_in) });
        if (editForm.break_start) events.push({ employee_id: editForm.employee_id, event_type: "break_start", timestamp: buildAusTimestamp(dateFor(editForm.break_start), editForm.break_start), created_at: buildAusTimestamp(dateFor(editForm.break_start), editForm.break_start) });
        if (editForm.break_end) events.push({ employee_id: editForm.employee_id, event_type: "break_end", timestamp: buildAusTimestamp(dateFor(editForm.break_end), editForm.break_end), created_at: buildAusTimestamp(dateFor(editForm.break_end), editForm.break_end) });
        if (editForm.clock_out) events.push({ employee_id: editForm.employee_id, event_type: "clock_out", timestamp: buildAusTimestamp(dateFor(editForm.clock_out), editForm.clock_out), created_at: buildAusTimestamp(dateFor(editForm.clock_out), editForm.clock_out) });
        if (events.length === 0) { toast.error("Enter at least one time"); return; }
        const { error } = await supabase.from("clock_events").insert(events);
        if (error) { toast.error("Failed to add: " + error.message); return; }
        const emp = employees.find(e => e.id === editForm.employee_id);
        await logAudit("timesheet_add", {
          employee_id: editForm.employee_id,
          employee_name: emp?.name || "Unknown",
          date: editForm.date,
          comment: editForm.comment.trim(),
          times: {
            clock_in: editForm.clock_in || null,
            clock_out: editForm.clock_out || null,
            break_start: editForm.break_start || null,
            break_end: editForm.break_end || null,
          },
        });
        toast.success("Entry added");
        setAddDialog(false);
        fetchTimesheets();
      } finally {
        setSaving(false);
      }
    });
  };

  const deleteEntry = async (entry: TimesheetEntry) => {
    if (entry.approved) { toast.error("Cannot delete an approved timesheet. Revoke approval first."); return; }
    if (saving) return;
    if (!confirm(`Delete all timesheet entries for ${entry.employee_name} on ${entry.date}?`)) return;
    await runAction(async () => {
      setSaving(true);
      try {
        for (const id of entry.event_ids) {
          await supabase.from("clock_events").delete().eq("id", id);
        }
        await logAudit("timesheet_delete", {
          employee_id: entry.employee_id,
          employee_name: entry.employee_name,
          date: entry.date,
          deleted_times: {
            clock_in: entry.clock_in,
            clock_out: entry.clock_out,
            break_start: entry.break_start,
            break_end: entry.break_end,
          },
        });
        toast.success("Entry deleted");
        fetchTimesheets();
      } finally {
        setSaving(false);
      }
    });
  };

  const filtered = entries.filter((e) => {
    if (searchQuery && !e.employee_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    // Roster admins: only show their department's entries
    if (isRosterAdmin && rosterDepts.length > 0) {
      if (!e.employee_department || !rosterDepts.map(d => d.toUpperCase()).includes(e.employee_department.toUpperCase())) return false;
    } else if (selectedDepartment !== "all" && e.employee_department !== selectedDepartment) {
      return false;
    }
    return true;
  });

  // Group filtered entries by date, sorted chronologically
  const groupedByDay = filtered.reduce<{ date: string; label: string; entries: TimesheetEntry[] }[]>((acc, e) => {
    const existing = acc.find(g => g.date === e.raw_date);
    if (existing) {
      existing.entries.push(e);
    } else {
      acc.push({ date: e.raw_date, label: e.date, entries: [e] });
    }
    return acc;
  }, []).sort((a, b) => b.date.localeCompare(a.date));

  const approvedCount = filtered.filter(e => e.approved).length;
  const pendingCount = filtered.length - approvedCount;

  const buildCSV = () => {
    const headers = ["Employee", "Date", "Status", "Clock In", "Clock Out", "Break Start", "Break End", "Break (min)", "Total (hrs)", "Net (hrs)"];
    const byEmployee = new Map<string, typeof filtered>();
    for (const e of filtered) {
      const list = byEmployee.get(e.employee_name) || [];
      list.push(e);
      byEmployee.set(e.employee_name, list);
    }
    const allRows: string[][] = [];
    const sortedNames = [...byEmployee.keys()].sort((a, b) => a.localeCompare(b));
    for (const name of sortedNames) {
      const entries = byEmployee.get(name)!;
      entries.sort((a, b) => b.raw_date.localeCompare(a.raw_date));
      let empBreakMins = 0, empTotalHrs = 0, empNetHrs = 0;
      for (const e of entries) {
        allRows.push([
          e.employee_name, e.date, e.approved ? "Approved" : "Pending",
          e.clock_in || "", e.clock_out || "", e.break_start || "", e.break_end || "",
          e.break_minutes.toString(), e.total_hours.toFixed(2), e.net_hours.toFixed(2),
        ]);
        empBreakMins += e.break_minutes;
        empTotalHrs += e.total_hours;
        empNetHrs += e.net_hours;
      }
      allRows.push([
        `▶ TOTAL: ${name} (${entries.length} days)`,
        "────────", "────────", "────────", "────────", "────────", "────────",
        `► ${empBreakMins}`, `► ${empTotalHrs.toFixed(2)}`, `► ${empNetHrs.toFixed(2)}`,
      ]);
      allRows.push(Array(headers.length).fill(""));
    }
    return [headers, ...allRows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  };

  // Parse HSL string like "43 72% 52%" to RGB
  const hslToRgb = (hsl: string): [number, number, number] => {
    const parts = hsl.replace(/%/g, "").split(/\s+/).map(Number);
    const h = (parts[0] || 0) / 360;
    const s = (parts[1] || 0) / 100;
    const l = (parts[2] || 0) / 100;
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    if (s === 0) {
      const v = Math.round(l * 255);
      return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
      Math.round(hue2rgb(p, q, h + 1/3) * 255),
      Math.round(hue2rgb(p, q, h) * 255),
      Math.round(hue2rgb(p, q, h - 1/3) * 255),
    ];
  };

  /** Generate the PDF doc object — reused for download and email */
  const generatePdfDoc = async () => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const theme = business?.theme as unknown as Record<string, string> | null;
    const primaryRgb = hslToRgb(theme?.primary || "43 72% 52%");
    const accentRgb = hslToRgb(theme?.accent || "43 72% 52%");
    const bgDark: [number, number, number] = [26, 26, 26];
    const textLight: [number, number, number] = [245, 245, 245];

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    // Header bar
    doc.setFillColor(...bgDark);
    doc.rect(0, 0, pageW, 22, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...primaryRgb);
    doc.text(business?.name || "Timesheet Report", 14, 14);
    doc.setFontSize(9);
    doc.setTextColor(...textLight);
    doc.text(`${format(dateFrom, "dd MMM yyyy")} – ${format(dateTo, "dd MMM yyyy")}`, pageW - 14, 14, { align: "right" });

    // Sub-header
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text(`Generated ${format(new Date(), "dd MMM yyyy 'at' h:mm a")}  •  ${filtered.length} entries  •  ${new Set(filtered.map(e => e.employee_name)).size} employees`, 14, 28);

    // Build grouped data
    const byEmployee = new Map<string, typeof filtered>();
    for (const e of filtered) {
      const list = byEmployee.get(e.employee_name) || [];
      list.push(e);
      byEmployee.set(e.employee_name, list);
    }
    const sortedNames = [...byEmployee.keys()].sort((a, b) => a.localeCompare(b));

    const tableBody: any[] = [];
    let grandBreak = 0, grandTotal = 0, grandNet = 0;

    for (const name of sortedNames) {
      const empEntries = byEmployee.get(name)!;
      empEntries.sort((a, b) => a.raw_date.localeCompare(b.raw_date));

      tableBody.push([{
        content: `${name}  (${empEntries[0]?.employee_department || "—"})`,
        colSpan: 9,
        styles: {
          fillColor: bgDark,
          textColor: primaryRgb,
          fontStyle: "bold",
          fontSize: 9,
          cellPadding: { top: 4, bottom: 3, left: 4, right: 4 },
        }
      }]);

      let empBreak = 0, empTotal = 0, empNet = 0;
      empEntries.forEach((e, i) => {
        const isApproved = e.approved;
        const rowBg: [number, number, number] = i % 2 === 0 ? [255, 255, 255] : [248, 249, 250];
        tableBody.push([
          { content: e.date, styles: { fillColor: rowBg, fontSize: 8 } },
          { content: isApproved ? "✓ Approved" : "○ Pending", styles: { fillColor: rowBg, textColor: isApproved ? [34, 139, 34] : [200, 140, 40], fontStyle: "bold", fontSize: 7.5 } },
          { content: e.clock_in || "—", styles: { fillColor: rowBg, fontSize: 8 } },
          { content: e.clock_out || "—", styles: { fillColor: rowBg, fontSize: 8 } },
          { content: e.break_start || "—", styles: { fillColor: rowBg, fontSize: 8, textColor: [150, 150, 150] } },
          { content: e.break_end || "—", styles: { fillColor: rowBg, fontSize: 8, textColor: [150, 150, 150] } },
          { content: String(e.break_minutes), styles: { fillColor: rowBg, halign: "center", fontSize: 8 } },
          { content: e.total_hours.toFixed(2), styles: { fillColor: rowBg, halign: "center", fontSize: 8 } },
          { content: e.net_hours.toFixed(2), styles: { fillColor: rowBg, halign: "center", fontStyle: "bold", fontSize: 8.5 } },
        ]);
        empBreak += e.break_minutes;
        empTotal += e.total_hours;
        empNet += e.net_hours;
      });

      const totalBg: [number, number, number] = [
        Math.min(255, primaryRgb[0] + Math.round((255 - primaryRgb[0]) * 0.85)),
        Math.min(255, primaryRgb[1] + Math.round((255 - primaryRgb[1]) * 0.85)),
        Math.min(255, primaryRgb[2] + Math.round((255 - primaryRgb[2]) * 0.85)),
      ];
      tableBody.push([
        { content: `TOTAL — ${empEntries.length} day${empEntries.length !== 1 ? "s" : ""}`, colSpan: 6, styles: { fillColor: totalBg, textColor: bgDark, fontStyle: "bold", fontSize: 8, halign: "right" } },
        { content: String(empBreak), styles: { fillColor: totalBg, textColor: primaryRgb, fontStyle: "bold", halign: "center", fontSize: 9 } },
        { content: empTotal.toFixed(2), styles: { fillColor: totalBg, textColor: primaryRgb, fontStyle: "bold", halign: "center", fontSize: 9 } },
        { content: empNet.toFixed(2), styles: { fillColor: totalBg, textColor: primaryRgb, fontStyle: "bold", halign: "center", fontSize: 9 } },
      ]);

      grandBreak += empBreak;
      grandTotal += empTotal;
      grandNet += empNet;
    }

    tableBody.push([
      { content: `GRAND TOTAL — ${sortedNames.length} employee${sortedNames.length !== 1 ? "s" : ""}, ${filtered.length} entries`, colSpan: 6, styles: { fillColor: bgDark, textColor: primaryRgb, fontStyle: "bold", fontSize: 9, halign: "right" } },
      { content: String(grandBreak), styles: { fillColor: bgDark, textColor: textLight, fontStyle: "bold", halign: "center", fontSize: 9 } },
      { content: grandTotal.toFixed(2), styles: { fillColor: bgDark, textColor: textLight, fontStyle: "bold", halign: "center", fontSize: 9 } },
      { content: grandNet.toFixed(2), styles: { fillColor: bgDark, textColor: accentRgb, fontStyle: "bold", halign: "center", fontSize: 10 } },
    ]);

    autoTable(doc, {
      startY: 32,
      head: [["Date", "Status", "Clock In", "Clock Out", "Break Start", "Break End", "Break (min)", "Total (hrs)", "Net (hrs)"]],
      body: tableBody,
      theme: "plain",
      headStyles: {
        fillColor: [45, 45, 45],
        textColor: primaryRgb,
        fontStyle: "bold",
        fontSize: 8,
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
        halign: "left",
      },
      styles: {
        cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
        fontSize: 8,
        textColor: [50, 50, 50],
        lineColor: [230, 230, 230],
        lineWidth: 0.2,
      },
      columnStyles: {
        6: { halign: "center" },
        7: { halign: "center" },
        8: { halign: "center" },
      },
      margin: { left: 10, right: 10 },
      didDrawPage: (data: any) => {
        const pageH = doc.internal.pageSize.getHeight();
        doc.setFillColor(248, 249, 250);
        doc.rect(0, pageH - 10, pageW, 10, "F");
        doc.setFontSize(7);
        doc.setTextColor(160, 160, 160);
        doc.text(`${business?.name || "OmnexClock"} — Timesheet Report`, 14, pageH - 4);
        doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, pageW - 14, pageH - 4, { align: "right" });
      },
    });

    return doc;
  };

  const downloadPDF = async () => {
    if (filtered.length === 0) { toast.info("No data to export"); return; }
    const doc = await generatePdfDoc();
    const filename = pdfFilename;
    doc.save(filename);
    toast.success("Downloaded timesheet PDF");
    logAudit("pdf_download", {
      source: "timesheets",
      filename,
      row_count: filtered.length,
      device: getDeviceInfo(),
    });
  };

  const downloadExcel = () => {
    if (filtered.length === 0) { toast.info("No data to export"); return; }
    const rows = filtered.map(e => ({
      "Employee": e.employee_name,
      "Department": e.employee_department || "",
      "Date": e.date,
      "Clock In": e.clock_in || "",
      "Clock Out": e.clock_out || "",
      "Break Start": e.break_start || "",
      "Break End": e.break_end || "",
      "Break (min)": e.break_minutes,
      "Total Hours": e.total_hours,
      "Net Hours": e.net_hours,
      "Approved": e.approved ? "Yes" : "No",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Timesheets");
    const filename = buildExportFilename({
      businessCode: business?.business_code,
      businessName: business?.name,
      reportType: "Timesheets",
      scope: [searchQuery.trim() ? `Search-${searchQuery.trim()}` : null],
      dateFrom,
      dateTo,
      ext: "xlsx",
    });
    XLSX.writeFile(wb, filename);
    toast.success("Downloaded timesheet Excel");
    logAudit("excel_download", {
      source: "timesheets",
      filename,
      row_count: filtered.length,
      device: getDeviceInfo(),
    });
  };

  const generatePdfBase64 = async (): Promise<string> => {
    const doc = await generatePdfDoc();
    // Get raw binary string then convert to base64
    const binaryStr = doc.output("datauristring");
    // datauristring format: "data:application/pdf;filename=generated.pdf;base64,XXXX"
    const base64 = binaryStr.split(",")[1];
    return base64;
  };

  const pdfFilename = buildExportFilename({
    businessCode: business?.business_code,
    businessName: business?.name,
    reportType: "Timesheets",
    scope: [searchQuery.trim() ? `Search-${searchQuery.trim()}` : null],
    dateFrom,
    dateTo,
    ext: "pdf",
  });
  const pdfSubject = `Timesheet Report – ${format(dateFrom, "dd MMM")} to ${format(dateTo, "dd MMM yyyy")}`;

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
    <TooltipProvider>
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
          <Select
            value={lockedDepartment || selectedDepartment}
            onValueChange={setSelectedDepartment}
            disabled={!!lockedDepartment}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border z-50">
              {!lockedDepartment && <SelectItem value="all">All Departments</SelectItem>}
              {(lockedDepartment ? rosterDepts : [...new Set(allEmployees.map(e => e.department).filter(Boolean))].sort()).map((dept) => (
                <SelectItem key={dept!} value={dept!}>{dept}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangeSelector dateFrom={dateFrom} dateTo={dateTo} onChangeFrom={setDateFrom} onChangeTo={setDateTo} />
        </div>

        {/* Action buttons - wrap on mobile */}
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={filtered.length === 0}>
                <FileDown className="mr-1.5 h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={downloadPDF}>
                <Download className="mr-2 h-4 w-4" /> Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEmailDialogOpen(true)}>
                <Mail className="mr-2 h-4 w-4" /> Email PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={downloadExcel}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Download Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {!isViewer && (
            <>
              <Button variant="outline" size="sm" onClick={approveAll} disabled={saving} className="text-green-500 border-green-500/30 hover:bg-green-500/10">
                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve All
              </Button>
              <Button size="sm" onClick={openAdd}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Entry
              </Button>
            </>
          )}
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
          {/* Mobile card view — grouped by day */}
          <div className="block md:hidden">
            {groupedByDay.length === 0 && (
              <div className="text-center text-muted-foreground py-8">No timesheet data for this period.</div>
            )}
            {groupedByDay.map((group) => {
              const dayNet = group.entries.reduce((s, e) => s + e.net_hours, 0);
              const dayApproved = group.entries.filter(e => e.approved).length;
              return (
                <div key={group.date}>
                  {/* Day header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-y border-border/60 sticky top-0 z-10">
                    <span className="text-xs font-semibold text-foreground">
                      {format(new Date(group.date + "T00:00:00"), "EEEE")}
                      <span className="font-normal text-muted-foreground ml-1.5">· {group.label}</span>
                    </span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{dayApproved}/{group.entries.length} approved</span>
                      <span className="font-medium text-foreground">{dayNet.toFixed(2)}h net</span>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {group.entries.map((e, i) => (
                      <div key={i} className={cn("p-3 space-y-2", e.approved && "bg-green-500/5")}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {!isViewer && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleApproval(e)}
                                disabled={approvingIds.has(`${e.employee_id}-${e.raw_date}`)}
                                className={cn("h-7 w-7 p-0", e.approved ? "text-green-500 hover:text-green-400" : "text-muted-foreground hover:text-yellow-500")}
                              >
                                {e.approved ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                              </Button>
                            )}
                            <span className="font-medium text-foreground">{e.employee_name}</span>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openHistory(e)} className="h-7 w-7 p-0 text-muted-foreground hover:text-primary">
                              <History className="h-3.5 w-3.5" />
                            </Button>
                            {!isViewer && (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => openEdit(e)} disabled={saving || e.approved} className="h-7 w-7 p-0">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => deleteEntry(e)} disabled={saving || e.approved} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>Clock In</span><span>Clock Out</span><span>Break</span>
                          <span className="text-foreground">{e.clock_in || "-"}</span>
                          <span className="text-foreground">{e.clock_out || "-"}</span>
                          <span className="text-foreground">{e.break_minutes}m</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>Total</span><span className="font-medium">Net</span>
                          <span className="text-foreground">{e.total_hours.toFixed(2)}h</span>
                          <span className="text-foreground font-semibold">{e.net_hours.toFixed(2)}h</span>
                        </div>
                        {e.clock_out_notes && (
                          <div className="text-xs text-muted-foreground italic bg-muted/40 rounded px-2 py-1">
                            <span className="font-medium text-foreground not-italic">Note:</span> {e.clock_out_notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table view — grouped by day */}
          <div className="hidden md:block overflow-x-auto overflow-y-auto max-h-[70vh] scroll-native scrollbar-thin relative" style={{ WebkitOverflowScrolling: 'touch' }}>
            <Table>
              <TableHeader className="sticky top-0 z-20 bg-background">
                <TableRow>
                  <TableHead className="w-12">Status</TableHead>
                  <TableHead>Employee</TableHead>
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
                {groupedByDay.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                      No timesheet data for this period.
                    </TableCell>
                  </TableRow>
                )}
                {groupedByDay.map((group) => {
                  const dayNet = group.entries.reduce((s, e) => s + e.net_hours, 0);
                  const dayApproved = group.entries.filter(e => e.approved).length;
                  return (
                    <>
                      {/* Day group header row */}
                      <TableRow key={`hdr-${group.date}`} className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={10} className="py-1.5 px-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">
                              {format(new Date(group.date + "T00:00:00"), "EEEE")}
                              <span className="font-normal text-muted-foreground ml-1.5">· {group.label}</span>
                            </span>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{dayApproved}/{group.entries.length} approved</span>
                              <span className="font-semibold text-foreground">{dayNet.toFixed(2)}h net</span>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                      {group.entries.map((e, i) => (
                        <TableRow key={`${group.date}-${i}`} className={e.approved ? "bg-green-500/5" : ""}>
                          <TableCell>
                            {!isViewer ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleApproval(e)}
                                disabled={approvingIds.has(`${e.employee_id}-${e.raw_date}`)}
                                className={cn("h-7 px-2", e.approved ? "text-green-500 hover:text-green-400" : "text-muted-foreground hover:text-yellow-500")}
                              >
                                {e.approved ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                              </Button>
                            ) : (
                              e.approved ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{e.employee_name}</TableCell>
                          <TableCell>{e.clock_in || "-"}</TableCell>
                          <TableCell>
                            {e.clock_out_notes ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="underline decoration-dotted cursor-help">{e.clock_out || "-"}</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs text-xs">
                                    <p className="font-medium mb-0.5">Employee Note:</p>
                                    <p>{e.clock_out_notes}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              e.clock_out || "-"
                            )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">{e.break_start || "-"}</TableCell>
                          <TableCell className="hidden lg:table-cell">{e.break_end || "-"}</TableCell>
                          <TableCell>{e.break_minutes}m</TableCell>
                          <TableCell>{e.total_hours.toFixed(2)}h</TableCell>
                          <TableCell className="font-semibold">{e.net_hours.toFixed(2)}h</TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="sm" onClick={() => openHistory(e)} className="h-7 w-7 p-0 text-muted-foreground hover:text-primary">
                                <History className="h-3.5 w-3.5" />
                              </Button>
                              {!isViewer && (
                                <>
                                  <Button variant="ghost" size="sm" onClick={() => openEdit(e)} disabled={saving || e.approved} className="h-7 w-7 p-0">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => deleteEntry(e)} disabled={saving || e.approved} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  );
                })}
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

      <EmailPDFDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        generatePdfBase64={generatePdfBase64}
        pdfFilename={pdfFilename}
        subject={pdfSubject}
        businessName={business?.name}
      />

      {/* History Dialog */}
      <Dialog open={historyDialog} onOpenChange={setHistoryDialog}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Edit History — {historyEntry?.employee_name}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">{historyEntry?.date}</p>
          </DialogHeader>
          {historyLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
          ) : historyLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No edit history found for this entry.</p>
          ) : (
            <div className="space-y-3">
              {historyLogs.map((log) => {
                const d = log.details as any;
                const actionLabels: Record<string, string> = {
                  timesheet_edit: "Edited",
                  timesheet_add: "Added",
                  timesheet_delete: "Deleted",
                  timesheet_approve: "Approved",
                  timesheet_unapprove: "Approval Revoked",
                };
                return (
                  <div key={log.id} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">{actionLabels[log.action] || log.action}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    </div>
                    {d?.comment && (
                      <p className="text-sm text-foreground"><span className="text-muted-foreground">Comment:</span> {d.comment}</p>
                    )}
                    {d?.previous && d?.updated && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="space-y-1">
                          <p className="font-medium text-muted-foreground">Before</p>
                          {d.previous.clock_in && <p>In: {ensureTime12(d.previous.clock_in)}</p>}
                          {d.previous.clock_out && <p>Out: {ensureTime12(d.previous.clock_out)}</p>}
                          {d.previous.break_start && <p>Break Start: {ensureTime12(d.previous.break_start)}</p>}
                          {d.previous.break_end && <p>Break End: {ensureTime12(d.previous.break_end)}</p>}
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium text-muted-foreground">After</p>
                          {d.updated.clock_in && <p>In: {ensureTime12(d.updated.clock_in)}</p>}
                          {d.updated.clock_out && <p>Out: {ensureTime12(d.updated.clock_out)}</p>}
                          {d.updated.break_start && <p>Break Start: {ensureTime12(d.updated.break_start)}</p>}
                          {d.updated.break_end && <p>Break End: {ensureTime12(d.updated.break_end)}</p>}
                        </div>
                      </div>
                    )}
                    {d?.times && (
                      <div className="text-xs space-y-1">
                        <p className="font-medium text-muted-foreground">Times</p>
                        {d.times.clock_in && <p>In: {d.times.clock_in}</p>}
                        {d.times.clock_out && <p>Out: {d.times.clock_out}</p>}
                        {d.times.break_start && <p>Break Start: {d.times.break_start}</p>}
                        {d.times.break_end && <p>Break End: {d.times.break_end}</p>}
                      </div>
                    )}
                    {d?.deleted_times && (
                      <div className="text-xs space-y-1">
                        <p className="font-medium text-muted-foreground">Deleted Times</p>
                        {d.deleted_times.clock_in && <p>In: {d.deleted_times.clock_in}</p>}
                        {d.deleted_times.clock_out && <p>Out: {d.deleted_times.clock_out}</p>}
                        {d.deleted_times.break_start && <p>Break Start: {d.deleted_times.break_start}</p>}
                        {d.deleted_times.break_end && <p>Break End: {d.deleted_times.break_end}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
