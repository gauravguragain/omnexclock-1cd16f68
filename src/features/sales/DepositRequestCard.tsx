import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Send, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLiveSync } from "@/hooks/useLiveSync";

export default function DepositRequestCard({ lead, booking, amount, eventTitle }: { lead: any; booking: any; amount: string | number; eventTitle: string }) {
  const [to, setTo] = useState(lead.email || ""); const [busy, setBusy] = useState(false); const [rows, setRows] = useState<any[]>([]);
  useEffect(() => setTo(lead.email || ""), [lead.email]);
  const load = async () => { const { data } = await (supabase.from("crm_deposit_requests" as any) as any).select("id, recipient_email, amount, created_at, proof_uploaded_at").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(5); setRows(data || []); };
  useEffect(() => { void load(); }, [lead.id]);
  useLiveSync(["crm_deposit_requests"], lead.business_id, () => void load());

  const send = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("crm-deposit-request", { body: { action: "send", leadId: lead.id, bookingId: booking?.id, to, name: lead.full_name, amount: Number(amount) || null, dueDate: booking?.deposit_due_date, eventTitle } });
    setBusy(false);
    if (error || data?.error) { toast.error(data?.error || "Could not send deposit details"); return; }
    toast.success(`Deposit details sent to ${to}`); void load();
  };
  const view = async (id: string) => { const { data } = await supabase.functions.invoke("crm-deposit-request", { body: { action: "proof_url", id } }); if (data?.url) window.open(data.url, "_blank"); else toast.error("Screenshot unavailable"); };

  return <div className="space-y-3 rounded-xl border border-border p-4">
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Send deposit payment details</p>
    <p className="text-xs text-muted-foreground">Emails your bank details and deposit amount to the client, with a link to upload their payment screenshot. Bank details are set in Settings.</p>
    <div className="space-y-1.5"><Label>Client email</Label><Input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="client@email.com" /></div>
    <Button type="button" variant="outline" className="w-full" disabled={busy || !to} onClick={send}><Send className="mr-2 h-4 w-4" />{busy ? "Sending…" : "Send deposit details"}</Button>
    {rows.length > 0 && <div className="divide-y divide-border text-xs">{rows.map(r => <div key={r.id} className="flex items-center justify-between gap-2 py-2">
      <span className="text-muted-foreground">Sent {format(new Date(r.created_at), "d MMM, h:mm a")}</span>
      {r.proof_uploaded_at ? <Button type="button" size="sm" variant="ghost" className="h-7 text-primary" onClick={() => view(r.id)}><ImageIcon className="mr-1 h-3.5 w-3.5" />View screenshot</Button> : <span className="text-muted-foreground">Awaiting screenshot</span>}
    </div>)}</div>}
  </div>;
}
