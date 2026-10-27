import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getAppOrigin } from "@/lib/appOrigin";

async function boardToken(cal: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${cal}:runsheets`));
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, "0")).join("");
}

/** One fixed QR per business: scanning lists every emailed run sheet (internal, live). */
export default function RunsheetQrDialog({ businessId }: { businessId: string }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [qr, setQr] = useState("");

  useEffect(() => {
    if (!open || link || !businessId) return;
    (supabase.rpc as any)("get_crm_calendar_token", { _business_id: businessId }).then(async ({ data }: any) => {
      if (!data) { toast.error("Could not create the QR code"); return; }
      setLink(`${getAppOrigin()}/runsheets?b=${businessId}&t=${await boardToken(data)}`);
    });
  }, [open, link, businessId]);

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { width: 512, margin: 2 }).then(setQr).catch(() => setQr(""));
  }, [link]);

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline"><QrCode className="mr-2 h-4 w-4" />Run sheet QR</Button></DialogTrigger>
    <DialogContent className="max-w-sm">
      <DialogHeader><DialogTitle>Run sheet QR code</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">This QR never changes. Scanning it shows every event and catering run sheet that has been emailed, always the latest version. Only share with your team.</p>
      {qr ? <img src={qr} alt="Run sheet QR code" className="mx-auto w-full max-w-[260px] rounded-md border border-border" /> : <div className="mx-auto flex aspect-square w-full max-w-[260px] items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">Loading…</div>}
      <div className="flex justify-center gap-2">
        <Button size="sm" variant="outline" disabled={!link} onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copied"); }}><Copy className="mr-1 h-3.5 w-3.5" />Copy link</Button>
        <Button size="sm" variant="outline" disabled={!qr} asChild={!!qr}>{qr ? <a href={qr} download="runsheets-qr.png"><Download className="mr-1 h-3.5 w-3.5" />Save</a> : <span><Download className="mr-1 h-3.5 w-3.5" />Save</span>}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
