import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { openRunsheet } from "@/lib/runsheet";
import { useBusiness } from "@/contexts/BusinessContext";
import { useActionLock } from "@/contexts/ActionLockContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronUp, Plus, Trash2, Sparkles, Wind, Ribbon, Palette, Upload, FileText, X, Loader2, Flame, Users, Baby, UtensilsCrossed, User, Phone, Clock, Edit2, Eye } from "lucide-react";
import { logAudit } from "@/lib/auditLog";

interface DayEvent {
  id: string;
  date: string;
  event_space: string | null;
  event_type: string | null;
  event_time: string | null;
  num_tables: number;
  chairs_per_table: number;
  tablecloth_color: string | null;
  cold_sparkles: boolean;
  dry_ice: boolean;
  red_carpet: boolean;
  decor_access: boolean;
  smoke_machine: boolean;
  live_stall: boolean;
  live_stall_details: string | null;
  adult_guests: number;
  kids_guests: number;
  host_name: string | null;
  host_contact_number: string | null;
  bev_package: string | null;
  notes: string | null;
  runsheet_url: string | null;
  banquet_tier: string | null;
}

interface ConfigItem {
  id: string;
  config_type: string;
  label: string;
}

interface Props {
  weekDates: Date[];
  fmtDate: (d: Date) => string;
}

function DebouncedInput({ value, onSave, ...props }: { value: string; onSave: (v: string) => void } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "onBlur">) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <Input
      {...props}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onSave(local); }}
      onKeyDown={e => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
    />
  );
}

function DebouncedSwitch({ checked, onSave, disabled }: { checked: boolean; onSave: (v: boolean) => void; disabled?: boolean }) {
  const [local, setLocal] = useState(checked);
  useEffect(() => { setLocal(checked); }, [checked]);
  const handleChange = (v: boolean) => {
    setLocal(v);
    onSave(v);
  };
  return <Switch checked={local} onCheckedChange={handleChange} disabled={disabled} className="scale-75" />;
}

export default function RosterDayEvents({ weekDates, fmtDate }: Props) {
  const { runAction } = useActionLock();
  const { isViewer, isRosterAdminOf, getRosterAdminDepartments, isAdminOf, isSuperAdminOf } = useAuth();
  const { business } = useBusiness();
  const { toast } = useToast();
  const [events, setEvents] = useState<DayEvent[]>([]);
  const [config, setConfig] = useState<ConfigItem[]>([]);
  const [openDays, setOpenDays] = useState<Set<number>>(new Set());
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [sectionUploading, setSectionUploading] = useState(false);
  const [sectionExtracting, setSectionExtracting] = useState(false);

  // Only admin and super admin can edit/add daily events
  const isAdmin = business ? isAdminOf(business.id) : false;
  const isSuperAdmin = business ? isSuperAdminOf(business.id) : false;
  const cannotEdit = !isAdmin && !isSuperAdmin;

  const fetchData = useCallback(async () => {
    if (!business) return;
    const dates = weekDates.map(d => fmtDate(d));
    const [evRes, cfgRes] = await Promise.all([
      supabase.from("roster_day_events").select("*").eq("business_id", business.id).in("date", dates),
      supabase.from("event_setup_config").select("*").eq("business_id", business.id).eq("active", true).order("sort_order"),
    ]);
    setEvents((evRes.data as DayEvent[]) || []);
    setConfig((cfgRes.data as ConfigItem[]) || []);
  }, [business, weekDates, fmtDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleDay = (idx: number) => {
    setOpenDays(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const toggleEventExpand = (id: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const parseEventTime = (timeStr: string | null): number => {
    if (!timeStr) return Infinity;
    // Try to extract the first time from strings like "6:00 PM - 11:00 PM" or "7pm start"
    const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(am|pm|AM|PM)?/i);
    if (!match) return Infinity;
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const meridiem = match[3]?.toLowerCase();
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  };

  const getDayEvents = (dayIdx: number) => {
    const dateStr = fmtDate(weekDates[dayIdx]);
    return events
      .filter(e => e.date === dateStr)
      .sort((a, b) => parseEventTime(a.event_time) - parseEventTime(b.event_time));
  };

  const addEvent = async (dayIdx: number) => {
    if (!business) return;
    await runAction(async () => {
      setSaving(true);
      const { error } = await supabase.from("roster_day_events").insert({
        business_id: business.id,
        date: fmtDate(weekDates[dayIdx]),
      });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        await logAudit("day_event_add", { date: fmtDate(weekDates[dayIdx]) });
        fetchData();
      }
      setSaving(false);
    });
  };

  const updateEvent = async (id: string, updates: Partial<DayEvent>) => {
    await runAction(async () => {
      const { error } = await supabase.from("roster_day_events").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        setEvents(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
      }
    });
  };

  const deleteEvent = async (id: string) => {
    await runAction(async () => {
      const { error } = await supabase.from("roster_day_events").delete().eq("id", id);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        const ev = events.find(e => e.id === id);
        await logAudit("day_event_delete", { date: ev?.date, event_space: ev?.event_space });
        fetchData();
        toast({ title: "Event removed" });
      }
    });
  };

  const handleRunsheetUpload = async (eventId: string, file: File) => {
    if (!business) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file", description: "Only PDF files are accepted.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 10MB.", variant: "destructive" });
      return;
    }
    setUploading(eventId);
    const filePath = `${business.id}/${eventId}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from("event-runsheets").upload(filePath, file, { upsert: true });
    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(null);
      return;
    }
    // Store the file path (not a temporary signed URL)
    const { error: updateError } = await supabase.from("roster_day_events").update({ runsheet_url: filePath, updated_at: new Date().toISOString() }).eq("id", eventId);
    if (updateError) {
      toast({ title: "Error saving URL", description: updateError.message, variant: "destructive" });
    } else {
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, runsheet_url: filePath } : e));
      toast({ title: "Runsheet uploaded, extracting data..." });
      await logAudit("runsheet_upload", { event_id: eventId, filename: file.name });
      const { data: signed } = await supabase.storage.from("event-runsheets").createSignedUrl(filePath, 600);
      if (signed?.signedUrl) extractRunsheetData(eventId, signed.signedUrl);
    }
    setUploading(null);
  };

  /** Single PDF upload for whole section - identifies date from PDF or uses current day */
  const handleSectionPdfUpload = async (file: File) => {
    if (!business) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file", description: "Only PDF files are accepted.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 10MB.", variant: "destructive" });
      return;
    }
    setSectionUploading(true);

    // Upload to a temp path, extract data, then identify the correct date
    const tempId = crypto.randomUUID();
    const filePath = `${business.id}/temp/${tempId}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from("event-runsheets").upload(filePath, file, { upsert: true });
    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setSectionUploading(false);
      return;
    }
    const { data: signed } = await supabase.storage.from("event-runsheets").createSignedUrl(filePath, 600);
    const publicPdfUrl = signed?.signedUrl ?? "";
    setSectionUploading(false);
    setSectionExtracting(true);

    try {
      const { data, error } = await supabase.functions.invoke("extract-runsheet", {
        body: { pdfUrl: publicPdfUrl },
      });
      if (error) throw error;
      if (!data) throw new Error("No data returned");

      // Use extracted date directly (supports future weeks), fall back to current week
      let dateStr: string;
      let targetDayIdx = -1;

      if (data.event_date) {
        // Use the extracted date as-is, even if it's outside the current week view
        dateStr = data.event_date;
        // Check if this date is within the currently viewed week (for UI expansion)
        targetDayIdx = weekDates.findIndex(wd => fmtDate(wd) === dateStr);
      } else {
        // Fallback: use today if within this week, otherwise first day of week
        const todayStr = fmtDate(new Date());
        targetDayIdx = weekDates.findIndex(wd => fmtDate(wd) === todayStr);
        if (targetDayIdx < 0) targetDayIdx = 0;
        dateStr = fmtDate(weekDates[targetDayIdx]);
      }
      // Create a new event for this date
      const { data: inserted, error: insertErr } = await supabase.from("roster_day_events").insert({
        business_id: business.id,
        date: dateStr,
        runsheet_url: filePath,
      }).select().single();

      if (insertErr || !inserted) {
        toast({ title: "Error creating event", description: insertErr?.message || "Unknown error", variant: "destructive" });
        setSectionExtracting(false);
        return;
      }

      // Move the file to the proper path. Never update the database to a path
      // that was not successfully created in storage.
      const properPath = `${business.id}/${inserted.id}/${Date.now()}_${file.name}`;
      const { error: copyError } = await supabase.storage.from("event-runsheets").copy(filePath, properPath);
      if (copyError) {
        await supabase.from("roster_day_events").delete().eq("id", inserted.id);
        throw new Error(`Unable to save the uploaded PDF: ${copyError.message}`);
      }
      const { error: pathUpdateError } = await supabase
        .from("roster_day_events")
        .update({ runsheet_url: properPath })
        .eq("id", inserted.id);
      if (pathUpdateError) {
        await supabase.storage.from("event-runsheets").remove([properPath]);
        await supabase.from("roster_day_events").delete().eq("id", inserted.id);
        throw new Error(`Unable to link the uploaded PDF: ${pathUpdateError.message}`);
      }
      await supabase.storage.from("event-runsheets").remove([filePath]);

      // Apply extracted data
      const updates: Partial<DayEvent> = {};
      if (data.event_space != null) updates.event_space = data.event_space;
      if (data.event_type != null) updates.event_type = data.event_type;
      if (data.event_time != null) updates.event_time = data.event_time;
      if (data.tablecloth_color != null) updates.tablecloth_color = data.tablecloth_color;
      if (data.adult_guests != null) updates.adult_guests = data.adult_guests;
      if (data.kids_guests != null) updates.kids_guests = data.kids_guests;
      if (data.chairs_per_table != null) updates.chairs_per_table = data.chairs_per_table;
      if (data.num_tables != null) updates.num_tables = data.num_tables;
      if (data.cold_sparkles != null) updates.cold_sparkles = data.cold_sparkles;
      if (data.dry_ice != null) updates.dry_ice = data.dry_ice;
      if (data.red_carpet != null) updates.red_carpet = data.red_carpet;
      if (data.smoke_machine != null) updates.smoke_machine = data.smoke_machine;
      if (data.decor_access != null) updates.decor_access = data.decor_access;
      if (data.live_stall != null) updates.live_stall = data.live_stall;
      if (data.live_stall_details != null) updates.live_stall_details = data.live_stall_details;
      if (data.host_name != null) updates.host_name = data.host_name;
      if (data.host_contact_number != null) updates.host_contact_number = data.host_contact_number;
      if (data.bev_package != null) updates.bev_package = data.bev_package;
      if (data.banquet_tier != null) (updates as any).banquet_tier = data.banquet_tier;
      if (data.notes != null) updates.notes = data.notes;

      if (Object.keys(updates).length > 0) {
        await supabase.from("roster_day_events").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", inserted.id);
      }

      await fetchData();
      if (targetDayIdx >= 0) {
        setOpenDays(prev => new Set(prev).add(targetDayIdx));
        setExpandedEvents(prev => new Set(prev).add(inserted.id));
      }

      // Build a friendly label for the assigned date
      const assignedDate = new Date(dateStr + "T00:00:00");
      const dayLabel = assignedDate.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
      const isInCurrentWeek = targetDayIdx >= 0;
      const description = isInCurrentWeek
        ? `Runsheet data extracted and assigned to ${dayLabel}.`
        : `Runsheet data extracted and assigned to ${dayLabel} (navigate to that week to view it).`;
      toast({ title: "Event created!", description });
      await logAudit("runsheet_extract_create", { date: dateStr, filename: file.name });
    } catch (e: any) {
      console.error("Section PDF extraction error:", e);
      toast({ title: "Extraction failed", description: e.message || "Could not extract data from PDF.", variant: "destructive" });
    }
    setSectionExtracting(false);
  };

  const extractRunsheetData = async (eventId: string, pdfUrl: string) => {
    setExtracting(eventId);
    try {
      const { data, error } = await supabase.functions.invoke("extract-runsheet", {
        body: { pdfUrl },
      });
      if (error) throw error;
      if (!data) throw new Error("No data returned");

      const updates: Partial<DayEvent> = {};
      if (data.event_space != null) updates.event_space = data.event_space;
      if (data.event_type != null) updates.event_type = data.event_type;
      if (data.event_time != null) updates.event_time = data.event_time;
      if (data.tablecloth_color != null) updates.tablecloth_color = data.tablecloth_color;
      if (data.adult_guests != null) updates.adult_guests = data.adult_guests;
      if (data.kids_guests != null) updates.kids_guests = data.kids_guests;
      if (data.chairs_per_table != null) updates.chairs_per_table = data.chairs_per_table;
      if (data.num_tables != null) updates.num_tables = data.num_tables;
      if (data.cold_sparkles != null) updates.cold_sparkles = data.cold_sparkles;
      if (data.dry_ice != null) updates.dry_ice = data.dry_ice;
      if (data.red_carpet != null) updates.red_carpet = data.red_carpet;
      if (data.smoke_machine != null) updates.smoke_machine = data.smoke_machine;
      if (data.decor_access != null) updates.decor_access = data.decor_access;
      if (data.live_stall != null) updates.live_stall = data.live_stall;
      if (data.live_stall_details != null) updates.live_stall_details = data.live_stall_details;
      if (data.host_name != null) updates.host_name = data.host_name;
      if (data.host_contact_number != null) updates.host_contact_number = data.host_contact_number;
      if (data.bev_package != null) updates.bev_package = data.bev_package;
      if (data.banquet_tier != null) (updates as any).banquet_tier = data.banquet_tier;
      if (data.notes != null) updates.notes = data.notes;

      if (Object.keys(updates).length > 0) {
        await updateEvent(eventId, updates);
        toast({ title: "Data extracted!", description: "Event fields populated from runsheet." });
      } else {
        toast({ title: "No data extracted", description: "Could not find event details in this PDF.", variant: "destructive" });
      }
    } catch (e: any) {
      console.error("Extraction error:", e);
      toast({ title: "Extraction failed", description: e.message || "Could not extract data from PDF.", variant: "destructive" });
    }
    setExtracting(null);
  };

  const removeRunsheet = async (eventId: string) => {
    await runAction(async () => {
      const { error } = await supabase.from("roster_day_events").update({ runsheet_url: null, updated_at: new Date().toISOString() }).eq("id", eventId);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        setEvents(prev => prev.map(e => e.id === eventId ? { ...e, runsheet_url: null } : e));
        toast({ title: "Runsheet removed" });
        await logAudit("runsheet_remove", { event_id: eventId });
      }
    });
  };

  const viewPdf = async (urlOrPath: string) => {
    const err = await openRunsheet(urlOrPath);
    if (err) toast({ title: "Error", description: err, variant: "destructive" });
  };

  const getEquipmentBadges = (ev: DayEvent) => {
    const badges: { label: string; active: boolean }[] = [
      { label: "✨ Sparkles", active: ev.cold_sparkles },
      { label: "🌫️ Dry Ice", active: ev.dry_ice },
      { label: "🔴 Red Carpet", active: ev.red_carpet },
      { label: "💨 Smoke", active: ev.smoke_machine },
      { label: "🎨 Decor", active: ev.decor_access },
      { label: "🍳 Live Stall", active: ev.live_stall },
    ];
    return badges.filter(b => b.active);
  };

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="space-y-2">
      {/* Single PDF Upload for whole section */}
      {!cannotEdit && (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/20">
          <Upload className="h-4 w-4 text-primary" />
          <div className="flex-1">
            <p className="text-xs font-medium text-foreground">Upload Runsheet PDF</p>
            <p className="text-[10px] text-muted-foreground">Auto-creates event & extracts details from PDF</p>
          </div>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleSectionPdfUpload(f);
                e.target.value = "";
              }}
              disabled={sectionUploading || sectionExtracting}
            />
            <Button variant="default" size="sm" className="h-7 text-xs pointer-events-none" disabled={sectionUploading || sectionExtracting}>
              {sectionUploading ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Uploading...</> :
               sectionExtracting ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Extracting...</> :
               <><FileText className="h-3 w-3 mr-1" /> Upload PDF</>}
            </Button>
          </label>
        </div>
      )}

      {weekDates.map((wd, dayIdx) => {
        const dayEvents = getDayEvents(dayIdx);
        const isOpen = openDays.has(dayIdx);
        const isToday = fmtDate(wd) === fmtDate(new Date());
        const dateLabel = wd.toLocaleDateString("en-AU", { day: "numeric", month: "short" });

        return (
          <Collapsible key={dayIdx} open={isOpen} onOpenChange={() => toggleDay(dayIdx)}>
            <CollapsibleTrigger className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors hover:bg-secondary/50 ${isToday ? "bg-primary/5 border border-primary/20" : "bg-muted/30 border border-border/40"}`}>
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>{DAYS[dayIdx]} {dateLabel}</span>
                {dayEvents.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                    {dayEvents.length} event{dayEvents.length > 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="px-1 pb-2 pt-1">
              <div className="space-y-2">
                {dayEvents.map(ev => {
                  const isExpanded = expandedEvents.has(ev.id);
                  const activeBadges = getEquipmentBadges(ev);
                  const totalGuests = (ev.adult_guests || 0) + (ev.kids_guests || 0);

                  return (
                    <div key={ev.id} className="rounded-lg border border-border/60 bg-card overflow-hidden">
                      {/* Summary view - always visible */}
                      <div className="px-3 py-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {ev.event_type && <Badge variant="outline" className="text-[10px] shrink-0">{ev.event_type}</Badge>}
                            {ev.host_name && <span className="text-xs font-medium text-foreground truncate">{ev.host_name}</span>}
                            {!ev.event_type && !ev.host_name && <span className="text-xs text-muted-foreground italic">New event</span>}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {ev.runsheet_url && (
                              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] text-primary" onClick={(e) => { e.stopPropagation(); viewPdf(ev.runsheet_url!); }}>
                                <FileText className="h-3 w-3 mr-0.5" /> PDF
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px]"
                              onClick={() => toggleEventExpand(ev.id)}
                            >
                              {isExpanded ? <ChevronUp className="h-3 w-3 mr-0.5" /> : <ChevronDown className="h-3 w-3 mr-0.5" />}
                              {isExpanded ? "Collapse" : "Expand"}
                            </Button>
                          </div>
                        </div>

                        {/* Quick info row */}
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                          {ev.event_time && <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" /> {ev.event_time}</span>}
                          {ev.event_space && <span>{ev.event_space}</span>}
                          {totalGuests > 0 && <span className="flex items-center gap-0.5"><Users className="h-3 w-3" /> {totalGuests} guests</span>}
                          {ev.num_tables > 0 && <span>{ev.num_tables} tables</span>}
                          {ev.bev_package && <span>🍷 {ev.bev_package}</span>}
                          {ev.banquet_tier && <span>🍽️ {ev.banquet_tier}</span>}
                        </div>

                        {/* Equipment badges */}
                        {activeBadges.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {activeBadges.map(b => (
                              <Badge key={b.label} variant="secondary" className="text-[9px] px-1 py-0 h-4">{b.label}</Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Expanded edit view */}
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-1 border-t border-border/40 space-y-3">
                          {/* Host & Time */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> Host Name</Label>
                              <DebouncedInput value={ev.host_name || ""} onSave={v => updateEvent(ev.id, { host_name: v || null })} placeholder="Client name..." className="h-8 text-xs" disabled={cannotEdit} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Host Contact</Label>
                              <DebouncedInput value={ev.host_contact_number || ""} onSave={v => updateEvent(ev.id, { host_contact_number: v || null })} placeholder="Contact number..." className="h-8 text-xs" disabled={cannotEdit} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Event Time</Label>
                              <DebouncedInput value={ev.event_time || ""} onSave={v => updateEvent(ev.id, { event_time: v || null })} placeholder="e.g. 6:00 PM - 11:00 PM" className="h-8 text-xs" disabled={cannotEdit} />
                            </div>
                          </div>

                          {/* Event details */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">Event Space</Label>
                              <DebouncedInput value={ev.event_space || ""} onSave={v => updateEvent(ev.id, { event_space: v || null })} placeholder="Enter event space..." className="h-8 text-xs" disabled={cannotEdit} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">Event Type</Label>
                              <DebouncedInput value={ev.event_type || ""} onSave={v => updateEvent(ev.id, { event_type: v || null })} placeholder="Enter event type..." className="h-8 text-xs" disabled={cannotEdit} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">Tablecloth</Label>
                              <Select value={ev.tablecloth_color || "black"} onValueChange={v => updateEvent(ev.id, { tablecloth_color: v })} disabled={cannotEdit}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="white">⬜ White</SelectItem>
                                  <SelectItem value="black">⬛ Black</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Guest counts */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Adults</Label>
                              <DebouncedInput type="number" min={0} value={String(ev.adult_guests || 0)} onSave={v => {
                                const adults = parseInt(v) || 0;
                                const totalG = adults + (ev.kids_guests || 0);
                                const chairs = ev.chairs_per_table || 8;
                                updateEvent(ev.id, { adult_guests: adults, num_tables: totalG > 0 ? Math.ceil(totalG / chairs) : 0 });
                              }} className="h-8 text-xs" disabled={cannotEdit} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground flex items-center gap-1"><Baby className="h-3 w-3" /> Kids</Label>
                              <DebouncedInput type="number" min={0} value={String(ev.kids_guests || 0)} onSave={v => {
                                const kids = parseInt(v) || 0;
                                const totalG = (ev.adult_guests || 0) + kids;
                                const chairs = ev.chairs_per_table || 8;
                                updateEvent(ev.id, { kids_guests: kids, num_tables: totalG > 0 ? Math.ceil(totalG / chairs) : 0 });
                              }} className="h-8 text-xs" disabled={cannotEdit} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">Chairs/Table</Label>
                              <DebouncedInput type="number" min={1} value={String(ev.chairs_per_table || 8)} onSave={v => {
                                const chairs = parseInt(v) || 8;
                                const totalG = (ev.adult_guests || 0) + (ev.kids_guests || 0);
                                updateEvent(ev.id, { chairs_per_table: chairs, num_tables: totalG > 0 ? Math.ceil(totalG / chairs) : ev.num_tables });
                              }} className="h-8 text-xs" disabled={cannotEdit} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">Tables</Label>
                              <DebouncedInput type="number" min={0} value={String(ev.num_tables || 0)} onSave={v => updateEvent(ev.id, { num_tables: parseInt(v) || 0 })} className="h-8 text-xs" disabled={cannotEdit} />
                            </div>
                          </div>

                          {/* Bev Package, Banquet Tier & Notes */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">Bev Package</Label>
                              <DebouncedInput value={ev.bev_package || ""} onSave={v => updateEvent(ev.id, { bev_package: v || null })} placeholder="e.g. Gold, Silver, BYO..." className="h-8 text-xs" disabled={cannotEdit} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">🍽️ Banquet Tier</Label>
                              <DebouncedInput value={ev.banquet_tier || ""} onSave={v => updateEvent(ev.id, { banquet_tier: v || null })} placeholder="e.g. Premium, Gold..." className="h-8 text-xs" disabled={cannotEdit} />
                            </div>
                            <div className="space-y-1 col-span-2 sm:col-span-1">
                              <Label className="text-[11px] text-muted-foreground">Notes</Label>
                              <DebouncedInput value={ev.notes || ""} onSave={v => updateEvent(ev.id, { notes: v || null })} placeholder="Additional info..." className="h-8 text-xs" disabled={cannotEdit} />
                            </div>
                          </div>

                          {/* Toggle switches */}
                          <div className="flex flex-wrap gap-4 pt-1">
                            {[
                              { key: "cold_sparkles", label: "Cold Sparkles", icon: Sparkles },
                              { key: "dry_ice", label: "Dry Ice", icon: Wind },
                              { key: "red_carpet", label: "Red Carpet", icon: Ribbon },
                              { key: "smoke_machine", label: "Smoke Machine", icon: Flame },
                              { key: "decor_access", label: "Decor Access", icon: Palette },
                              { key: "live_stall", label: "Live Stall", icon: UtensilsCrossed },
                            ].map(({ key, label, icon: Icon }) => (
                              <div key={key} className="flex items-center gap-1.5">
                                <DebouncedSwitch checked={ev[key as keyof DayEvent] as boolean} onSave={v => updateEvent(ev.id, { [key]: v })} disabled={cannotEdit} />
                                <Label className="text-[11px] text-muted-foreground flex items-center gap-1 cursor-pointer">
                                  <Icon className="h-3 w-3" /> {label}
                                </Label>
                              </div>
                            ))}
                          </div>

                          {ev.live_stall && (
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground flex items-center gap-1"><UtensilsCrossed className="h-3 w-3" /> Live Stall Details</Label>
                              <DebouncedInput value={ev.live_stall_details || ""} onSave={v => updateEvent(ev.id, { live_stall_details: v || null })} placeholder="e.g. Live pasta station..." className="h-8 text-xs" disabled={cannotEdit} />
                            </div>
                          )}

                          {extracting === ev.id && (
                            <div className="flex items-center gap-2 py-2 text-xs text-primary">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting event data from PDF...
                            </div>
                          )}

                          {/* Runsheet per event */}
                          <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            <Label className="text-[11px] text-muted-foreground">Runsheet</Label>
                            {ev.runsheet_url ? (
                              <div className="flex items-center gap-2 ml-auto">
                                <button onClick={() => viewPdf(ev.runsheet_url!)} className="text-[11px] text-primary hover:underline flex items-center gap-1">
                                  <Eye className="h-3 w-3" /> View PDF
                                </button>
                                {!cannotEdit && (
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => removeRunsheet(ev.id)}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            ) : !cannotEdit ? (
                              <label className="ml-auto cursor-pointer">
                                <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleRunsheetUpload(ev.id, f); e.target.value = ""; }} disabled={uploading === ev.id} />
                                <span className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                                  {uploading === ev.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                                  {uploading === ev.id ? "Uploading..." : "Upload PDF"}
                                </span>
                              </label>
                            ) : (
                              <span className="text-[11px] text-muted-foreground ml-auto">No runsheet</span>
                            )}
                          </div>

                          {!cannotEdit && (
                            <div className="flex justify-end">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10">
                                    <Trash2 className="h-3 w-3 mr-1" /> Remove
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                                    <AlertDialogDescription>This will permanently remove the event setup for this day. This action cannot be undone.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteEvent(ev.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete Event</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {!cannotEdit && (
                  <Button variant="outline" size="sm" className="w-full h-8 text-xs border-dashed" onClick={() => addEvent(dayIdx)} disabled={saving}>
                    <Plus className="h-3 w-3 mr-1" /> Add Event for {DAYS[dayIdx]}
                  </Button>
                )}

                {dayEvents.length === 0 && cannotEdit && (
                  <div className="text-xs text-muted-foreground text-center py-2">No events configured for this day.</div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
