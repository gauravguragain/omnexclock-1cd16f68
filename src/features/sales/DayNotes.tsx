import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ausToday } from "@/lib/dateUtils";

type Note = { id: string; note_date: string; content: string; updated_at: string };
const key = (d: Date) => format(d, "yyyy-MM-dd");

export default function DayNotes({ businessId }: { businessId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Date>(() => new Date(`${ausToday()}T00:00:00`));
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const db = supabase as any;

  const load = async () => {
    const { data } = await db.from("crm_day_notes").select("id,note_date,content,updated_at").eq("business_id", businessId);
    setNotes(data || []);
  };
  useEffect(() => { load(); }, [businessId]);
  const byDate = useMemo(() => new Map(notes.map(n => [n.note_date, n])), [notes]);
  const current = byDate.get(key(selected));
  useEffect(() => { setText(current?.content || ""); }, [current?.id, current?.content, key(selected)]);

  const save = async () => {
    setSaving(true);
    const content = text.trim();
    const { error } = content
      ? await db.from("crm_day_notes").upsert({ business_id: businessId, note_date: key(selected), content }, { onConflict: "business_id,note_date" })
      : current ? await db.from("crm_day_notes").delete().eq("id", current.id) : { error: null };
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(content ? "Note saved" : "Note cleared");
    load();
  };

  const noteDays = notes.filter(n => n.content).map(n => new Date(`${n.note_date}T00:00:00`));
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Note for the day</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[auto_1fr]">
        <Calendar mode="single" selected={selected} onSelect={d => d && setSelected(d)}
          modifiers={{ hasNote: noteDays }} modifiersClassNames={{ hasNote: "font-bold underline decoration-primary decoration-2 underline-offset-4" }}
          className="rounded-md border border-border p-3 pointer-events-auto" />
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-sm font-medium">{format(selected, "EEEE, d MMMM yyyy")}</p>
          <Textarea rows={8} value={text} onChange={e => setText(e.target.value)} placeholder="Write a note for this day…" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{current ? `Last updated ${format(new Date(current.updated_at), "d MMM, h:mm a")}` : "No note yet"}</span>
            <Button onClick={save} disabled={saving || text.trim() === (current?.content || "")}>{saving ? "Saving…" : "Save note"}</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
