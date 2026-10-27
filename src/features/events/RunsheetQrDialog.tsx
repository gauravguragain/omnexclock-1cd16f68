import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { format, parseISO } from "date-fns";
import { Copy, Download, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { eventLabel } from "@/lib/eventLabel";
import { getAppOrigin } from "@/lib/appOrigin";

/** Staff-only picker: choose run sheets and get one QR that opens their internal live copies. */
export default function RunsheetQrDialog({ runsheets, bookings, leads }: { runsheets: any[]; bookings: any[]; leads: any[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [qr, setQr] = useState("");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

  const rows = useMemo(() => runsheets.filter(r => r.internal_share_token).map(r => {
    const b = bookings.find(x => x.id === r.booking_id) || bookings.find(x => r.lead_id && x.lead_id === r.lead_id);
    const lead = leads.find(l => l.id === r.lead_id);
    return { id: r.id, token: r.internal_share_token, date: b?.event_date || "", label: b ? eventLabel(b, lead?.full_name) : lead?.full_name || "Run sheet", kind: b?.booking_kind === "catering" ? "Catering" : "Event", order: r.event_order_number || "", cancelled: b?.status === "cancelled" };
  }).filter(r => !r.cancelled && (showPast || !r.date || r.date >= today) && `${r.label} ${r.order} ${r.date}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999")), [runsheets, bookings, leads, q, showPast, today]);

  const chosen = runsheets.filter(r => picked.has(r.id) && r.internal_share_token);
  const link = chosen.length ? `${getAppOrigin()}/runsheets?r=${chosen.map(r => `${r.id}.${r.internal_share_token}`).join(",")}` : "";

  useEffect(() => {
    if (!link) { setQr(""); return; }
    QRCode.toDataURL(link, { width: 512, margin: 2, errorCorrectionLevel: "L" }).then(setQr).catch(() => setQr(""));
  }, [link]);

  const toggle = (id: string) => setPicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every(r => picked.has(r.id));

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline"><QrCode className="mr-2 h-4 w-4" />Run sheet QR</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>Run sheet QR code</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Tick the events and caterings to include. Scanning opens their internal run sheets, always showing the latest version. Only share with your team.</p>
      <div className="grid gap-4 md:grid-cols-[1fr_240px]">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder="Search name, order or date" value={q} onChange={e => setQ(e.target.value)} className="h-9 flex-1" />
            <label className="flex items-center gap-2 text-xs"><Checkbox checked={showPast} onCheckedChange={v => setShowPast(!!v)} />Show past</label>
          </div>
          <label className="flex items-center gap-2 border-b border-border pb-2 text-xs font-medium"><Checkbox checked={allOn} onCheckedChange={() => setPicked(s => { const n = new Set(s); rows.forEach(r => allOn ? n.delete(r.id) : n.add(r.id)); return n; })} />Select all shown ({rows.length})</label>
          <div className="max-h-[50dvh] space-y-1 overflow-y-auto">
            {rows.map(r => <label key={r.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-2 text-sm hover:border-primary">
              <Checkbox checked={picked.has(r.id)} onCheckedChange={() => toggle(r.id)} />
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{r.label}</p><p className="text-xs text-muted-foreground">{r.date ? format(parseISO(r.date), "EEE d MMM yyyy") : "No date"} · {r.kind}{r.order ? ` · ${r.order}` : ""}</p></div>
            </label>)}
            {!rows.length && <p className="py-6 text-center text-sm text-muted-foreground">No run sheets found</p>}
          </div>
        </div>
        <div className="space-y-2 text-center">
          {qr ? <img src={qr} alt="Run sheet QR code" className="mx-auto w-full max-w-[240px] rounded-md border border-border" /> : <div className="flex aspect-square items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">Select run sheets</div>}
          <p className="text-xs text-muted-foreground">{chosen.length} selected</p>
          <div className="flex justify-center gap-2">
            <Button size="sm" variant="outline" disabled={!link} onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copied"); }}><Copy className="mr-1 h-3.5 w-3.5" />Copy</Button>
            <Button size="sm" variant="outline" disabled={!qr} asChild={!!qr}>{qr ? <a href={qr} download="runsheets-qr.png"><Download className="mr-1 h-3.5 w-3.5" />Save</a> : <span><Download className="mr-1 h-3.5 w-3.5" />Save</span>}</Button>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
