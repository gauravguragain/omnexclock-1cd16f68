import { useCallback, useEffect, useRef, useState } from "react";
import { Printer, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RunsheetDocument } from "@/features/events/RunsheetViewPage";
import { useLiveSync } from "@/hooks/useLiveSync";
import { downloadRunsheetPdf } from "@/lib/runsheetDownload";
import { toast } from "sonner";
import { loadRosterRunsheet } from "@/lib/loadRosterRunsheet";

export default function RosterRunsheetDialog({ eventId, businessId, onClose }: {
  eventId: string | null; businessId?: string; onClose: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const reload = useCallback(async () => {
    if (!eventId) return;
    const request = ++requestRef.current;
    setError("");
    try {
      const next = await loadRosterRunsheet(supabase, eventId);
      if (request !== requestRef.current) return;
      setData(next);
    } catch (cause) {
      if (request !== requestRef.current) return;
      setError(cause instanceof Error ? cause.message : "Could not load the run sheet. Please try again.");
    }
  }, [eventId]);
  useEffect(() => { setData(null); setError(""); void reload(); return () => { requestRef.current++; }; }, [reload]);
  useLiveSync(["roster_day_events", "crm_runsheets", "crm_bookings", "crm_leads", "crm_menu_selections", "crm_menu_selection_items", "crm_packages", "crm_package_courses", "crm_package_course_items", "crm_drinks", "crm_dishes"], eventId ? businessId : undefined, reload, ["crm_package_courses", "crm_package_course_items"]);

  return <Dialog open={Boolean(eventId)} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[95vh] max-w-[900px] overflow-auto">
      <DialogHeader><DialogTitle>Live run sheet</DialogTitle></DialogHeader>
      {error && <div className="flex items-center gap-3" role="alert"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => void reload()}>Try again</Button></div>}
      {!data ? !error && <p className="text-sm text-muted-foreground">Loading…</p> : <>
        <div className="flex gap-2">
          <Button variant="outline" onClick={async () => {
            if (!docRef.current) return;
            // Print only the operational document, never the roster behind the dialog.
            try { await downloadRunsheetPdf(docRef.current, "Run sheet", true); } catch { toast.error("Could not print run sheet"); }
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