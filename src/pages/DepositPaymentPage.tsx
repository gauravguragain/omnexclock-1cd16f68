import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, ImagePlus, Loader2, XCircle } from "lucide-react";

const money = (n: any) => n == null ? "" : `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function DepositPaymentPage() {
  const { token = "" } = useParams();
  const [data, setData] = useState<any>(null); const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);

  useEffect(() => { void (async () => {
    const { data: d, error: e } = await supabase.functions.invoke("crm-deposit-request", { body: { action: "view", token } });
    if (e || d?.error) setError(d?.error || "This link is unavailable."); else { setData(d); setDone(!!d.request.uploaded_at); }
  })(); }, [token]);

  const upload = async () => {
    if (!file) return; setBusy(true); setError("");
    const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
    const { data: d, error: e } = await supabase.functions.invoke("crm-deposit-request", { body: { action: "upload", token, file: dataUrl } });
    setBusy(false);
    if (e || d?.error) setError(d?.error || "Upload failed. Please try again."); else { setDone(true); setFile(null); }
  };

  if (!data && !error) return <main className="grid min-h-dvh place-items-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></main>;
  if (!data) return <main className="grid min-h-dvh place-items-center bg-background p-5"><Card className="w-full max-w-lg"><CardContent className="p-7 text-center"><XCircle className="mx-auto h-12 w-12 text-destructive" /><h1 className="mt-4 font-serif text-2xl">Link unavailable</h1><p className="mt-2 text-muted-foreground">{error}</p></CardContent></Card></main>;
  const { request: r, bank, business: b } = data;
  const Row = ({ k, v }: { k: string; v?: string }) => v ? <div className="flex justify-between gap-4 border-b border-border py-2.5 last:border-0"><span className="text-xs uppercase tracking-widest text-primary">{k}</span><span className="text-right font-semibold">{v}</span></div> : null;

  return <main className="min-h-dvh bg-background px-4 py-10">
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-center">
        {b.logo_url && <img src={b.logo_url} alt={b.name} className="mx-auto mb-4 h-16 object-contain" />}
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Deposit Payment</p>
        <h1 className="mt-2 font-serif text-3xl">{r.event_title || b.name}</h1>
        {r.name && <p className="mt-1 text-muted-foreground">For {r.name}</p>}
      </div>
      <Card><CardContent className="p-5">
        <Row k="Deposit amount" v={money(r.amount)} />
        <Row k="Due by" v={r.due_date ? new Date(r.due_date + "T00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : ""} />
        <Row k="Account name" v={bank.account_name} /><Row k="BSB" v={bank.bsb} /><Row k="Account number" v={bank.account_number} />
        {bank.note && <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{bank.note}</p>}
      </CardContent></Card>
      <Card><CardContent className="space-y-4 p-5">
        {done ? <div className="text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-primary" /><p className="mt-3 font-semibold">Thank you — your screenshot has been received.</p><p className="mt-1 text-sm text-muted-foreground">Our team will confirm your deposit shortly. You can upload another screenshot if needed.</p><Button variant="outline" className="mt-4" onClick={() => setDone(false)}>Upload another</Button></div> : <>
          <div className="border-l-2 border-primary bg-muted/50 p-3 text-sm"><strong>After your payment has been made successfully</strong>, attach a screenshot of the transfer receipt below so we can match and confirm your deposit.</div>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center hover:bg-muted/40">
            <ImagePlus className="h-8 w-8 text-primary" />
            <span className="text-sm font-medium">{file ? file.name : "Choose payment screenshot"}</span>
            <span className="text-xs text-muted-foreground">PNG, JPG or HEIC, up to 8 MB</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="h-11 w-full" disabled={!file || busy} onClick={upload}>{busy ? "Uploading…" : "Send screenshot"}</Button>
        </>}
      </CardContent></Card>
      <p className="text-center text-xs text-muted-foreground">Questions? Contact {b.name}{b.email ? ` at ${b.email}` : ""}{b.phone ? ` or ${b.phone}` : ""}.</p>
    </div>
  </main>;
}
