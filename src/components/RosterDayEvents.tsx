import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { ChevronDown, ChevronUp, Plus, Trash2, PartyPopper, Sparkles, Wind, Ribbon, Palette, Upload, FileText, X, Loader2 } from "lucide-react";

interface DayEvent {
  id: string;
  date: string;
  event_space: string | null;
  event_type: string | null;
  num_tables: number;
  chairs_per_table: number;
  tablecloth_color: string | null;
  cold_sparkles: boolean;
  dry_ice: boolean;
  red_carpet: boolean;
  decor_access: boolean;
  notes: string | null;
  runsheet_url: string | null;
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

export default function RosterDayEvents({ weekDates, fmtDate }: Props) {
  const { runAction } = useActionLock();
  const { isViewer, isRosterAdminOf, getRosterAdminDepartments, isAdminOf } = useAuth();
  const { business } = useBusiness();
  const { toast } = useToast();
  const [events, setEvents] = useState<DayEvent[]>([]);
  const [config, setConfig] = useState<ConfigItem[]>([]);
  const [openDays, setOpenDays] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  // Roster admins with only BOH access cannot edit events
  const isRosterAdminBOHOnly = business
    ? isRosterAdminOf(business.id) && !isAdminOf(business.id) && (() => {
        const depts = getRosterAdminDepartments(business.id);
        return depts.length > 0 && depts.every(d => d.toUpperCase() === "BOH");
      })()
    : false;

  const cannotEdit = isViewer || isRosterAdminBOHOnly;

  const eventSpaces = config.filter(c => c.config_type === "event_space");
  const eventTypes = config.filter(c => c.config_type === "event_type");

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

  const getDayEvents = (dayIdx: number) => {
    const dateStr = fmtDate(weekDates[dayIdx]);
    return events.filter(e => e.date === dateStr);
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
    const { data: urlData } = supabase.storage.from("event-runsheets").getPublicUrl(filePath);
    const { error: updateError } = await supabase.from("roster_day_events").update({ runsheet_url: urlData.publicUrl, updated_at: new Date().toISOString() }).eq("id", eventId);
    if (updateError) {
      toast({ title: "Error saving URL", description: updateError.message, variant: "destructive" });
    } else {
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, runsheet_url: urlData.publicUrl } : e));
      toast({ title: "Runsheet uploaded" });
    }
    setUploading(null);
  };

  const removeRunsheet = async (eventId: string) => {
    await runAction(async () => {
      const { error } = await supabase.from("roster_day_events").update({ runsheet_url: null, updated_at: new Date().toISOString() }).eq("id", eventId);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        setEvents(prev => prev.map(e => e.id === eventId ? { ...e, runsheet_url: null } : e));
        toast({ title: "Runsheet removed" });
      }
    });
  };

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const hasAnyEvents = events.length > 0;

  return (
    <div className="space-y-1">
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
                {dayEvents.map(ev => (
                  <div key={ev.id} className="rounded-lg border border-border/60 bg-card p-3 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {/* Event Space */}
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Event Space</Label>
                        <Select
                          value={ev.event_space || ""}
                          onValueChange={v => updateEvent(ev.id, { event_space: v || null })}
                          disabled={cannotEdit}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            {eventSpaces.map(s => (
                              <SelectItem key={s.id} value={s.label}>{s.label}</SelectItem>
                            ))}
                            {eventSpaces.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Add spaces in My Business settings</div>}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Event Type */}
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Event Type</Label>
                        {business?.business_code === "PRP" ? (
                          <DebouncedInput
                            value={ev.event_type || ""}
                            onSave={v => updateEvent(ev.id, { event_type: v || null })}
                            placeholder="Enter event type..."
                            className="h-8 text-xs"
                            disabled={cannotEdit}
                          />
                        ) : (
                          <Select
                            value={ev.event_type || ""}
                            onValueChange={v => updateEvent(ev.id, { event_type: v || null })}
                            disabled={cannotEdit}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>
                              {eventTypes.map(s => (
                                <SelectItem key={s.id} value={s.label}>{s.label}</SelectItem>
                              ))}
                              {eventTypes.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Add types in My Business settings</div>}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      {/* Tablecloth Color */}
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Tablecloth Color</Label>
                        <Select
                          value={ev.tablecloth_color || "white"}
                          onValueChange={v => updateEvent(ev.id, { tablecloth_color: v })}
                          disabled={cannotEdit}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="white">⬜ White</SelectItem>
                            <SelectItem value="black">⬛ Black</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Num Tables */}
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">No. of Tables</Label>
                        <DebouncedInput
                          type="number"
                          min={0}
                          value={String(ev.num_tables)}
                          onSave={v => updateEvent(ev.id, { num_tables: parseInt(v) || 0 })}
                          className="h-8 text-xs"
                          disabled={cannotEdit}
                        />
                      </div>

                      {/* Chairs per Table */}
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Chairs/Table</Label>
                        <DebouncedInput
                          type="number"
                          min={0}
                          value={String(ev.chairs_per_table)}
                          onSave={v => updateEvent(ev.id, { chairs_per_table: parseInt(v) || 0 })}
                          className="h-8 text-xs"
                          disabled={cannotEdit}
                        />
                      </div>

                      {/* Notes */}
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Notes</Label>
                        <DebouncedInput
                          value={ev.notes || ""}
                          onSave={v => updateEvent(ev.id, { notes: v || null })}
                          placeholder="Additional info..."
                          className="h-8 text-xs"
                          disabled={cannotEdit}
                        />
                      </div>
                    </div>

                    {/* Toggle switches */}
                    <div className="flex flex-wrap gap-4 pt-1">
                      {[
                        { key: "cold_sparkles", label: "Cold Sparkles", icon: Sparkles },
                        { key: "dry_ice", label: "Dry Ice", icon: Wind },
                        { key: "red_carpet", label: "Red Carpet", icon: Ribbon },
                        { key: "decor_access", label: "Decor Access", icon: Palette },
                      ].map(({ key, label, icon: Icon }) => (
                        <div key={key} className="flex items-center gap-1.5">
                          <Switch
                            checked={ev[key as keyof DayEvent] as boolean}
                            onCheckedChange={v => updateEvent(ev.id, { [key]: v })}
                            disabled={cannotEdit}
                            className="scale-75"
                          />
                          <Label className="text-[11px] text-muted-foreground flex items-center gap-1 cursor-pointer">
                            <Icon className="h-3 w-3" /> {label}
                          </Label>
                        </div>
                      ))}
                    </div>

                    {/* Runsheet Upload */}
                    <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <Label className="text-[11px] text-muted-foreground">Runsheet</Label>
                      {ev.runsheet_url ? (
                        <div className="flex items-center gap-2 ml-auto">
                          <a href={ev.runsheet_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline flex items-center gap-1">
                            <FileText className="h-3 w-3" /> View PDF
                          </a>
                          {!cannotEdit && (
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => removeRunsheet(ev.id)}>
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ) : !cannotEdit ? (
                        <label className="ml-auto cursor-pointer">
                          <input
                            type="file"
                            accept=".pdf,application/pdf"
                            className="hidden"
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (f) handleRunsheetUpload(ev.id, f);
                              e.target.value = "";
                            }}
                            disabled={uploading === ev.id}
                          />
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
                              <AlertDialogDescription>
                                This will permanently remove the event setup for this day, including all configuration and any uploaded runsheet. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteEvent(ev.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Delete Event
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                ))}

                {!cannotEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs border-dashed"
                    onClick={() => addEvent(dayIdx)}
                    disabled={saving}
                  >
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
