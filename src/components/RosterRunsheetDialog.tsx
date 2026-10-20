import { useCallback, useEffect, useRef, useState } from "react";
import { Printer, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RunsheetDocument } from "@/features/events/RunsheetViewPage";
import { useLiveSync } from "@/hooks/useLiveSync";
import { downloadRunsheetPdf } from "@/lib/runsheetDownload";
import { toast } from "sonner";

export default function RosterRunsheetDialog({ eventId, businessId, onClose }: {
  eventId: string | null; businessId?: string; onClose: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);
  const reload = useCallback(async () => {
    if (!eventId) return;
    const result = await supabase.rpc("get_roster_runsheet", { _event_id: eventId });
    if (result.error) { setError(result.error.message); return; }
    setError("");
    setData(result.data);
  }, [eventId]);
  useEffect(() => { setData(null); setError(""); void reload(); }, [reload]);
  useLiveSync(["roster_day_events", "crm_runsheets", "crm_bookings", "crm_leads", "crm_menu_selections", "crm_menu_selection_items", "crm_packages", "crm_package_courses", "crm_package_course_items", "crm_drinks", "crm_dishes"], eventId ? businessId : undefined, reload, ["crm_package_courses", "crm_package_course_items"]);

  return <Dialog open={Boolean(eventId)} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[95vh] max-w-[900px] overflow-auto">
      <DialogHeader><DialogTitle>Live run sheet</DialogTitle></DialogHeader>
      {error ? <p className="text-sm text-destructive">{error}</p> : !data ? <p className="text-sm text-muted-foreground">Loading…</p> : <>
        <div className="flex gap-2">
          <Button variant="outline" onClick={async () => {
            if (!docRef.current) return;
            // Print only the operational document, never the roster behind the dialog.
            const { downloadRunsheetPdf: download } = await import("@/lib/runsheetDownload");
            try { await download(docRef.current, "Run sheet", true); } catch { toast.error("Could not print run sheet"); }
          }}><Printer className="mr-2 h-4 w-4" />Print</Button>
          <Button variant="outline" disabled={downloading} onClick={async () => {
            if (!docRef.current) return;
            setDownloading(true);
            try { await downloadRunsheetPdf(docRef.current, "Run sheet"); } catch { toast.error("Could not create PDF"); }
            finally { setDownloading(false); }
          }}><Download className="mr-2 h-4 w-4" />{downloading ? "Preparing…" : "Download PDF"}</Button>
        </div>
        <div className="overflow-x-auto"><div ref={docRef} className="runsheet-page"><RunsheetDocument {...data} internal /></div></div>
      </>}
    </DialogContent>
  </Dialog>;
}