import { useCallback, useEffect, useRef, useState } from "react";
import { Printer, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RunsheetDocument } from "@/features/events/RunsheetViewPage";
import { useLiveSync } from "@/hooks/useLiveSync";
import { downloadRunsheetPdf } from "@/lib/runsheetDownload";
import { toast } from "sonner";
import { loadBeverageDetail } from "@/lib/beverageDetail";

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
    const result = await supabase.rpc("get_roster_runsheet", { _event_id: eventId });
    if (request !== requestRef.current) return;
    if (result.error) { setError(result.error.message); return; }
    const next = result.data as any;
    if (next?.selection && businessId) {
      next.selection.beverage_detail = await loadBeverageDetail(supabase, businessId, next.selection.beverage_package);
    }
    if (request !== requestRef.current) return;
    setError("");
    setData(next);
  }, [eventId, businessId]);
  useEffect(() => { setData(null); setError(""); void reload(); return () => { requestRef.current++; }; }, [reload]);
  useLiveSync(["roster_day_events", "crm_runsheets", "crm_bookings", "crm_leads", "crm_menu_selections", "crm_menu_selection_items", "crm_packages", "crm_package_courses", "crm_package_course_items", "crm_drinks", "crm_dishes"], eventId ? businessId : undefined, reload, ["crm_package_courses", "crm_package_course_items"]);

  return <Dialog open={Boolean(eventId)} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[95vh] max-w-[900px] overflow-auto">
      <DialogHeader><DialogTitle>Live run sheet</DialogTitle></DialogHeader>
      {error ? <p className="text-sm text-destructive">{error}</p> : !data ? <p className="text-sm text-muted-foreground">Loading…</p> : <>
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