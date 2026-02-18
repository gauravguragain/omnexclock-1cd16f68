import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { TimeDropdownPicker } from "@/components/TimeDropdownPicker";
import { logAudit } from "@/lib/auditLog";
import { useAuth } from "@/contexts/AuthContext";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Copy, Send, Clock, AlertCircle, CalendarOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Tables } from "@/integrations/supabase/types";
import { toAusDate, toAusFormatted } from "@/lib/dateUtils";

type Employee = Tables<"employees">;
type Shift = Tables<"shifts">;

/* ── helpers ─────────────────────────────────────────────── */

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatTime12(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  const ampm = hr >= 12 ? "PM" : "AM";
  const h12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
  return `${h12}:${m} ${ampm}`;
}

function calcNetHours(start: string, end: string, breakMin: number): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // overnight
  return Math.max(0, (mins - breakMin) / 60);
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function isAllDayUnavailability(req: any): boolean {
  return !req.start_time || !req.end_time;
}

function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const a0 = timeToMinutes(startA);
  const a1 = timeToMinutes(endA);
  const b0 = timeToMinutes(startB);
  const b1 = timeToMinutes(endB);
  return a0 < b1 && b0 < a1;
}

/* ── component ───────────────────────────────────────────── */

interface ShiftForm {
  employee_id: string;
  date: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  break_minutes: string;
  notes: string;
}

const EMPTY_SHIFT: ShiftForm = {
  employee_id: "", date: "", day_of_week: "", start_time: "09:00", end_time: "17:00", break_minutes: "30", notes: "",
};

export default function RosterPage() {
  const { isViewer } = useAuth();
  const { business } = useBusiness();
  const { toast } = useToast();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [approvedRequests, setApprovedRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [form, setForm] = useState<ShiftForm>(EMPTY_SHIFT);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const weekDates = useMemo(() => DAYS.map((_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = addDays(weekStart, 6);
  const weekLabel = `${toAusFormatted(weekStart, { day: "numeric", month: "short" })} – ${toAusFormatted(weekEnd, { day: "numeric", month: "short", year: "numeric" })}`;

  /* ── data fetching ── */

  const fetchData = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    const ws = fmtDate(weekStart);
    const we = fmtDate(addDays(weekStart, 6));
    const [empRes, shiftRes, reqRes] = await Promise.all([
      supabase.from("employees").select("*").eq("active", true).eq("business_id", business.id).order("name"),
      supabase.from("shifts").select("*, employees!inner(business_id)").eq("employees.business_id", business.id).eq("week_start_date", ws).order("start_time"),
      supabase.from("employee_requests").select("*, employees!inner(name, business_id)").eq("employees.business_id", business.id).eq("status", "approved"),
    ]);
    setEmployees(empRes.data || []);
    setShifts(shiftRes.data || []);
    setApprovedRequests(reqRes.data || []);
    setLoading(false);
  }, [weekStart, business]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── realtime ── */
  useEffect(() => {
    const channel = supabase
      .channel("roster-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  /* ── shift map: employeeId -> dayIndex -> shifts ── */
  const shiftMap = useMemo(() => {
    const map: Record<string, Record<number, Shift[]>> = {};
    for (const s of shifts) {
      if (!map[s.employee_id]) map[s.employee_id] = {};
      const dayIdx = weekDates.findIndex(d => fmtDate(d) === s.date);
      if (dayIdx >= 0) {
        if (!map[s.employee_id][dayIdx]) map[s.employee_id][dayIdx] = [];
        map[s.employee_id][dayIdx].push(s);
      }
    }
    return map;
  }, [shifts, weekDates]);

  /* ── weekly totals per employee ── */
  const weeklyTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const s of shifts) {
      const hrs = s.hours_worked ?? calcNetHours(s.start_time, s.end_time, s.break_minutes);
      totals[s.employee_id] = (totals[s.employee_id] || 0) + hrs;
    }
    return totals;
  }, [shifts]);

  /* ── week status ── */
  const weekStatus = useMemo(() => {
    if (shifts.length === 0) return "empty";
    const allPublished = shifts.every(s => s.status === "published");
    const allDraft = shifts.every(s => s.status === "draft");
    if (allPublished) return "published";
    if (allDraft) return "draft";
    return "mixed";
  }, [shifts]);

  /* ── handlers ── */

  const openAddShift = (employeeId: string, dayIdx: number) => {
    const date = fmtDate(weekDates[dayIdx]);
    setEditingShift(null);
    setForm({
      ...EMPTY_SHIFT,
      employee_id: employeeId,
      date,
      day_of_week: FULL_DAYS[dayIdx],
    });
    setDialogOpen(true);
  };

  const openEditShift = (shift: Shift) => {
    setEditingShift(shift);
    setForm({
      employee_id: shift.employee_id,
      date: shift.date,
      day_of_week: shift.day_of_week,
      start_time: shift.start_time,
      end_time: shift.end_time,
      break_minutes: String(shift.break_minutes),
      notes: shift.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSaveShift = async () => {
    if (saving) return;
    if (!form.start_time || !form.end_time) {
      toast({ title: "Missing times", description: "Start and end time are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        employee_id: form.employee_id,
        date: form.date,
        day_of_week: form.day_of_week,
        start_time: form.start_time,
        end_time: form.end_time,
        break_minutes: parseInt(form.break_minutes) || 0,
        notes: form.notes.trim() || null,
        week_start_date: fmtDate(weekStart),
        status: "draft" as const,
      };

      // Check for overlap with approved unavailability requests
      const dayName = form.day_of_week;
      const dayStr = form.date;
      const dayRequests = approvedRequests.filter(r => {
        if (r.employee_id !== form.employee_id) return false;
        if (r.is_recurring) {
          if (!(r.recurring_days || []).includes(dayName)) return false;
          if (r.recurring_start_date && dayStr < r.recurring_start_date) return false;
          if (r.recurring_end_date && dayStr > r.recurring_end_date) return false;
          return true;
        }
        if (r.start_date && r.end_date) return dayStr >= r.start_date && dayStr <= r.end_date;
        if (r.start_date) return dayStr === r.start_date;
        return false;
      });

      const overlappingReq = dayRequests.find(r => {
        if (isAllDayUnavailability(r)) return true;
        return timesOverlap(form.start_time, form.end_time, r.start_time, r.end_time);
      });

      if (overlappingReq) {
        const label = overlappingReq.request_type === "leave" ? "leave" : "unavailability";
        if (isAllDayUnavailability(overlappingReq)) {
          toast({ title: "Cannot roster", description: `This employee has an approved all-day ${label} on this date.`, variant: "destructive" });
          setSaving(false);
          return;
        } else {
          toast({
            title: "Shift overlaps unavailability",
            description: `This shift overlaps with approved ${label} (${formatTime12(overlappingReq.start_time)} – ${formatTime12(overlappingReq.end_time)}). Please adjust the shift times.`,
            variant: "destructive",
          });
          setSaving(false);
          return;
        }
      }

      if (editingShift) {
        const { error } = await supabase.from("shifts").update(payload).eq("id", editingShift.id);
        if (error) throw error;
        await logAudit("shift_edit", { shift_id: editingShift.id, ...payload });
        toast({ title: "Shift updated" });
      } else {
        const { error } = await supabase.from("shifts").insert(payload);
        if (error) throw error;
        await logAudit("shift_add", payload);
        toast({ title: "Shift added" });
      }
      setDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShift = async (shiftId: string) => {
    const shift = shifts.find(s => s.id === shiftId);
    const wasPublished = shift?.status === "published";

    const { error } = await supabase.from("shifts").delete().eq("id", shiftId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await logAudit("shift_delete", { shift_id: shiftId, was_published: wasPublished });
      if (wasPublished) {
        toast({
          title: "Shift removed — please re-publish",
          description: "This was a published shift. Publish the week again to notify the employee of the change.",
          variant: "destructive",
        });
        // Mark remaining published shifts for this employee as draft so admin must re-publish
        const empId = shift.employee_id;
        const empPublishedIds = shifts
          .filter(s => s.employee_id === empId && s.status === "published" && s.id !== shiftId)
          .map(s => s.id);
        if (empPublishedIds.length > 0) {
          await supabase.from("shifts").update({ status: "draft" }).in("id", empPublishedIds);
        }
      } else {
        toast({ title: "Shift deleted" });
      }
      if (editingShift?.id === shiftId) setDialogOpen(false);
      fetchData();
    }
  };

  const handlePublishWeek = async () => {
    const draftIds = shifts.filter(s => s.status === "draft").map(s => s.id);
    if (draftIds.length === 0) {
      toast({ title: "Nothing to publish", description: "All shifts are already published." });
      return;
    }
    setPublishing(true);
    try {
      // Capture the draft shifts before publishing (these are the changed ones)
      const draftShifts = shifts.filter(s => s.status === "draft");

      const { error } = await supabase.from("shifts").update({ status: "published" }).in("id", draftIds);
      if (error) throw error;
      await logAudit("roster_publish", { week_start: fmtDate(weekStart), count: draftIds.length });
      toast({ title: "Roster published", description: `${draftIds.length} shift(s) are now visible to employees.` });
      fetchData();

      // Email affected employees (non-blocking)
      sendRosterEmails(draftShifts);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const sendRosterEmails = async (changedShifts: Shift[]) => {
    // Group changed shifts by employee
    const byEmployee = new Map<string, Shift[]>();
    for (const s of changedShifts) {
      if (!byEmployee.has(s.employee_id)) byEmployee.set(s.employee_id, []);
      byEmployee.get(s.employee_id)!.push(s);
    }

    // Get all shifts for affected employees this week (so email shows full roster)
    const affectedEmployeeIds = Array.from(byEmployee.keys());
    const allShiftsThisWeek = shifts.filter(s => affectedEmployeeIds.includes(s.employee_id));

    // Group all shifts by employee
    const allByEmployee = new Map<string, Shift[]>();
    for (const s of allShiftsThisWeek) {
      if (!allByEmployee.has(s.employee_id)) allByEmployee.set(s.employee_id, []);
      allByEmployee.get(s.employee_id)!.push(s);
    }

    let sentCount = 0;
    for (const [empId, empShifts] of allByEmployee) {
      const emp = employees.find(e => e.id === empId);
      if (!emp?.email) continue;

      const shiftData = empShifts
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(s => ({
          day: s.day_of_week,
          date: new Date(s.date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
          start: formatTime12(s.start_time),
          end: formatTime12(s.end_time),
          breakMin: s.break_minutes,
          notes: s.notes || undefined,
        }));

      try {
        await supabase.functions.invoke("send-email", {
          body: {
            type: "roster_notification",
            to: emp.email,
            employeeName: emp.name,
            weekLabel: weekLabel,
            shifts: shiftData,
          },
        });
        sentCount++;
      } catch (err) {
        console.error(`Failed to email ${emp.name}:`, err);
      }
    }

    if (sentCount > 0) {
      toast({ title: "Emails sent", description: `Roster notifications sent to ${sentCount} employee(s).` });
    }
  };

  const handleCopyPrevWeek = async () => {
    const prevWeekStart = addDays(weekStart, -7);
    const { data: prevShifts } = await supabase
      .from("shifts")
      .select("*")
      .eq("week_start_date", fmtDate(prevWeekStart));

    if (!prevShifts || prevShifts.length === 0) {
      toast({ title: "No shifts found", description: "Previous week has no shifts to copy.", variant: "destructive" });
      return;
    }

    const newShifts = prevShifts.map(s => ({
      employee_id: s.employee_id,
      date: fmtDate(addDays(new Date(s.date), 7)),
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      break_minutes: s.break_minutes,
      notes: s.notes,
      week_start_date: fmtDate(weekStart),
      status: "draft" as const,
    }));

    const { error } = await supabase.from("shifts").insert(newShifts);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await logAudit("roster_copy_week", { from: fmtDate(prevWeekStart), to: fmtDate(weekStart), count: newShifts.length });
      toast({ title: "Copied!", description: `${newShifts.length} shift(s) copied as drafts.` });
      fetchData();
    }
  };

  const netHours = calcNetHours(form.start_time, form.end_time, parseInt(form.break_minutes) || 0);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center min-w-[200px]">
            <p className="text-sm font-semibold text-foreground">{weekLabel}</p>
            <div className="flex items-center justify-center gap-1.5 mt-0.5">
              <span className={`inline-block h-2 w-2 rounded-full ${
                weekStatus === "published" ? "bg-success" :
                weekStatus === "draft" ? "bg-warning" :
                weekStatus === "mixed" ? "bg-primary" : "bg-muted-foreground"
              }`} />
              <span className="text-xs text-muted-foreground capitalize">{weekStatus === "empty" ? "No shifts" : weekStatus}</span>
            </div>
          </div>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(getMonday(new Date()))} className="text-xs text-muted-foreground">
            Today
          </Button>
        </div>

        {!isViewer && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyPrevWeek} disabled={loading}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy Last Week
            </Button>
            <Button size="sm" onClick={handlePublishWeek} disabled={publishing || weekStatus === "published" || weekStatus === "empty"}>
              <Send className="mr-1.5 h-3.5 w-3.5" /> {publishing ? "Publishing..." : "Publish Week"}
            </Button>
          </div>
        )}
      </div>

      {/* Grid */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: '1070px' }}>
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2.5 text-muted-foreground font-medium w-[160px] min-w-[160px] sticky left-0 bg-card z-20 border-r border-border">Employee</th>
                  {weekDates.map((d, i) => {
                    const isToday = fmtDate(d) === fmtDate(new Date());
                    return (
                      <th key={i} className={`text-center px-2 py-2.5 min-w-[120px] font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                        <div>{DAYS[i]}</div>
                        <div className={`text-xs ${isToday ? "text-primary" : "text-muted-foreground/70"}`}>
                          {toAusFormatted(d, { day: "numeric", month: "short" })}
                        </div>
                      </th>
                    );
                  })}
                  <th className="text-center px-3 py-2.5 text-muted-foreground font-medium w-[70px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-muted-foreground">
                      <Clock className="h-5 w-5 animate-spin mx-auto mb-2" />
                      Loading roster...
                    </td>
                  </tr>
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-muted-foreground">
                      <AlertCircle className="h-5 w-5 mx-auto mb-2" />
                      No active employees. Add employees first.
                    </td>
                  </tr>
                ) : (
                  employees.map(emp => (
                    <tr key={emp.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                      <td className="px-3 py-2 sticky left-0 bg-card z-20 border-r border-border">
                        <div className="font-medium text-foreground truncate">{emp.name}</div>
                        <div className="text-xs text-muted-foreground">{emp.job_title || emp.department || emp.employee_code}</div>
                      </td>
                      {weekDates.map((wd, dayIdx) => {
                        const dayShifts = shiftMap[emp.id]?.[dayIdx] || [];
                        const dayStr = fmtDate(wd);
                        const dayName = FULL_DAYS[dayIdx];
                        const dayRequests = approvedRequests.filter(r => {
                          if (r.employee_id !== emp.id) return false;
                          if (r.is_recurring) {
                            if (!(r.recurring_days || []).includes(dayName)) return false;
                            if (r.recurring_start_date && dayStr < r.recurring_start_date) return false;
                            if (r.recurring_end_date && dayStr > r.recurring_end_date) return false;
                            return true;
                          }
                          if (r.start_date && r.end_date) return dayStr >= r.start_date && dayStr <= r.end_date;
                          if (r.start_date) return dayStr === r.start_date;
                          return false;
                        });
                        return (
                          <td key={dayIdx} className="px-1 py-1.5 align-top">
                            <div className="space-y-1 min-h-[48px]">
                              {dayRequests.map(req => (
                                <div key={req.id} className={`w-full rounded-md px-2 py-1 text-[10px] border ${req.request_type === "leave" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"}`}>
                                  <CalendarOff className="h-2.5 w-2.5 inline mr-0.5" />
                                  {req.request_type === "leave" ? "Leave" : "Unavailable"}
                                  {req.start_time && req.end_time && (
                                    <div className="text-[9px] opacity-80 mt-0.5">{formatTime12(req.start_time)} – {formatTime12(req.end_time)}</div>
                                  )}
                                </div>
                              ))}
                              {dayShifts.map(shift => (
                                <button
                                  key={shift.id}
                                  onClick={() => !isViewer && openEditShift(shift)}
                                  disabled={isViewer}
                                  className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                                    isViewer ? "cursor-default" : ""
                                  } ${
                                    shift.status === "published"
                                      ? "bg-primary/15 text-primary hover:bg-primary/25 border border-primary/20"
                                      : "bg-muted text-muted-foreground hover:bg-muted/80 border border-border border-dashed"
                                  }`}
                                >
                                  <div className="font-medium">{formatTime12(shift.start_time)} – {formatTime12(shift.end_time)}</div>
                                  <div className="text-[10px] opacity-70">
                                    {(shift.hours_worked ?? calcNetHours(shift.start_time, shift.end_time, shift.break_minutes)).toFixed(1)}h
                                    {shift.break_minutes > 0 && ` · ${shift.break_minutes}m brk`}
                                  </div>
                                </button>
                              ))}
                              {(() => {
                                if (isViewer) return null;
                                const hasAllDayBlock = dayRequests.some(r => isAllDayUnavailability(r));
                                const hasPartialUnavailability = dayRequests.some(r => !isAllDayUnavailability(r));
                                if (hasAllDayBlock) return null;
                                if (dayShifts.length > 0 && !hasPartialUnavailability) return null;
                                return (
                                  <button
                                    onClick={() => openAddShift(emp.id, dayIdx)}
                                    className="w-full rounded-md border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-primary text-xs py-1.5 transition-colors flex items-center justify-center gap-1"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </button>
                                );
                              })()}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center font-mono font-medium text-foreground">
                        {(weeklyTotals[emp.id] || 0).toFixed(1)}h
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Shift Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingShift ? "Edit Shift" : "Add Shift"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Employee (read-only in context) */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Employee</Label>
              <p className="font-medium text-foreground">{employees.find(e => e.id === form.employee_id)?.name || "—"}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Day</Label>
              <p className="font-medium text-foreground">
                {form.day_of_week} — {new Date(form.date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>

            {/* Unavailability warning for this day */}
            {(() => {
              const dayReqs = approvedRequests.filter(r => {
                if (r.employee_id !== form.employee_id) return false;
                if (r.is_recurring) {
                  if (!(r.recurring_days || []).includes(form.day_of_week)) return false;
                  if (r.recurring_start_date && form.date < r.recurring_start_date) return false;
                  if (r.recurring_end_date && form.date > r.recurring_end_date) return false;
                  return true;
                }
                if (r.start_date && r.end_date) return form.date >= r.start_date && form.date <= r.end_date;
                if (r.start_date) return form.date === r.start_date;
                return false;
              });
              if (dayReqs.length === 0) return null;
              return dayReqs.map(r => (
                <div key={r.id} className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium">
                      {r.request_type === "leave" ? "Leave" : "Unavailable"}
                      {r.start_time && r.end_time
                        ? `: ${formatTime12(r.start_time)} – ${formatTime12(r.end_time)}`
                        : " (all day)"}
                    </span>
                    <div className="text-[10px] opacity-80 mt-0.5">
                      {r.start_time && r.end_time
                        ? "Schedule outside these hours only."
                        : "Cannot roster on this day."}
                    </div>
                  </div>
                </div>
              ));
            })()}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <TimeDropdownPicker value={form.start_time} onChange={v => setForm({ ...form, start_time: v })} />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <TimeDropdownPicker value={form.end_time} onChange={v => setForm({ ...form, end_time: v })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Break (minutes)</Label>
              <Select value={form.break_minutes} onValueChange={v => setForm({ ...form, break_minutes: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["0", "15", "30", "45", "60"].map(m => (
                    <SelectItem key={m} value={m}>{m} min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." maxLength={200} />
            </div>

            {/* Net hours preview */}
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Net hours:</span>
              <span className="font-mono font-semibold text-foreground">{netHours.toFixed(1)}h</span>
            </div>

            <div className="flex justify-between pt-2">
              {editingShift ? (
                <Button variant="destructive" size="sm" onClick={() => handleDeleteShift(editingShift.id)}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                </Button>
              ) : <div />}
              <Button onClick={handleSaveShift} disabled={saving}>
                {saving ? "Saving..." : editingShift ? "Update Shift" : "Add Shift"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
