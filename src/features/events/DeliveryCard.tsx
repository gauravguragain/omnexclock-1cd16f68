import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ExternalLink, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

export const DEFAULT_RATE_PER_KM = 2;
/** 0–10 km $50, over 10–50 km $100, over 50 km $100 + rate per km beyond 50. */
export function deliveryFeeFor(km: number, ratePerKm: number) {
  if (!(km >= 0)) return 0;
  if (km <= 10) return 50;
  if (km <= 50) return 100;
  return Math.round((100 + (km - 50) * ratePerKm) * 100) / 100;
}

export type DeliveryValue = { km: string; rate: string; manual: boolean; manualFee: string };
export const emptyDelivery = (): DeliveryValue => ({ km: "", rate: String(DEFAULT_RATE_PER_KM), manual: false, manualFee: "" });
export const feeOf = (v: DeliveryValue) => v.manual ? (v.manualFee === "" ? null : Number(v.manualFee)) : v.km ? deliveryFeeFor(Number(v.km), Number(v.rate) || 0) : null;

/** Address + map + View on map + distance-based fee. Controlled; used in the new-booking form and the booking page. */
export function DeliveryFields({ address, onAddress, value, onChange, addressLabel = "Delivery address" }: { address: string; onAddress: (a: string) => void; value: DeliveryValue; onChange: (v: DeliveryValue) => void; addressLabel?: string }) {
  const [busy, setBusy] = useState(false);
  const [mapQ, setMapQ] = useState(address.trim());
  useEffect(() => { const t = setTimeout(() => setMapQ(address.trim()), 800); return () => clearTimeout(t); }, [address]);
  const set = (p: Partial<DeliveryValue>) => onChange({ ...value, ...p });
  const fee = feeOf(value);
  const q = encodeURIComponent(mapQ);
  const [sugs, setSugs] = useState<{ placeId: string; text: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState(() => crypto.randomUUID());
  const [typed, setTyped] = useState(false);
  useEffect(() => {
    if (!typed || address.trim().length < 3) { setSugs([]); return; }
    let stale = false;
    const t = setTimeout(async () => {
      const { data } = await supabase.functions.invoke("delivery-distance", { body: { action: "autocomplete", input: address, sessionToken: token } });
      if (!stale) { setSugs(data?.suggestions || []); setOpen(true); }
    }, 300);
    return () => { stale = true; clearTimeout(t); };
  }, [address, typed, token]);
  const pickSug = (sg: { placeId: string; text: string }) => { setTyped(false); setOpen(false); setSugs([]); onAddress(sg.text); void calc(sg.text, sg.placeId); setToken(crypto.randomUUID()); };
  const calc = async (addr = address, placeId?: string) => {
    if (!addr.trim()) { toast.error("Enter the delivery address first"); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("delivery-distance", { body: { address: addr, placeId } });
    setBusy(false);
    if (error || data?.error) { toast.error(data?.error || "Could not calculate distance — enter it manually"); return; }
    set({ km: String(data.km) }); toast.success(`${data.km} km from Wentworthville (about ${data.minutes} min drive)`);
  };
  return <div className="space-y-3">
    <Label>{addressLabel}</Label>
    <div className="flex gap-2"><div className="relative flex-1"><Input placeholder="Start typing an address…" autoComplete="off" value={address} onChange={e => { setTyped(true); onAddress(e.target.value); }} onFocus={() => sugs.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && sugs.length > 0 && <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg">{sugs.map(sg => <li key={sg.placeId}><button type="button" onMouseDown={e => e.preventDefault()} onClick={() => pickSug(sg)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"><MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{sg.text}</button></li>)}</ul>}</div>
      <Button type="button" variant="outline" onClick={() => calc()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Recalculate"}</Button></div>
    {mapQ && <>
      <iframe title="Delivery address map" className="h-56 w-full rounded-lg border border-border" loading="lazy" src={`https://maps.google.com/maps?q=${q}&z=14&output=embed`} />
      <Button type="button" size="sm" variant="outline" asChild><a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" />View on map</a></Button>
    </>}
    <div className="grid gap-3 sm:grid-cols-2">
      <div><Label>Distance from Wentworthville (km)</Label><Input type="number" min="0" step="0.1" value={value.km} onChange={e => set({ km: e.target.value })} placeholder="Auto or type it in" /></div>
      <div><Label>Rate per km over 50 km ($)</Label><Input type="number" min="0" step="0.01" value={value.rate} onChange={e => set({ rate: e.target.value })} /></div>
    </div>
    <p className="text-xs text-muted-foreground">0–10 km $50 · 11–50 km $100 · over 50 km $100 + rate per extra km</p>
    <label className="flex items-center gap-2 text-sm"><Checkbox checked={value.manual} onCheckedChange={v => set({ manual: !!v })} />Enter delivery fee manually</label>
    {value.manual && <div className="max-w-xs"><Label>Delivery fee ($)</Label><Input type="number" min="0" step="0.01" value={value.manualFee} onChange={e => set({ manualFee: e.target.value })} /></div>}
    <div className="flex items-center justify-between rounded-md bg-muted/50 p-3 text-sm"><span>Delivery fee</span><strong>{fee != null ? `$${fee.toFixed(2)}` : "—"}</strong></div>
  </div>;
}

export default function DeliveryCard({ booking, onChanged }: { booking: any; onChanged: () => void }) {
  const [address, setAddress] = useState(booking.service_location || "");
  const [v, setV] = useState<DeliveryValue>({ km: booking.delivery_distance_km != null ? String(booking.delivery_distance_km) : "", rate: String(booking.delivery_rate_per_km ?? DEFAULT_RATE_PER_KM), manual: !!booking.delivery_fee_manual, manualFee: booking.delivery_fee_manual && booking.delivery_fee != null ? String(booking.delivery_fee) : "" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const fee = feeOf(v);
    const total = Math.max(0, Number(booking.total_amount || 0) - Number(booking.delivery_fee || 0) + (fee ?? 0));
    const { error } = await supabase.from("crm_bookings").update({ service_location: address.trim() || null, delivery_distance_km: v.km === "" ? null : Number(v.km), delivery_rate_per_km: Number(v.rate) || 0, delivery_fee_manual: v.manual, delivery_fee: fee, total_amount: total } as any).eq("id", booking.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Delivery saved and booking total updated"); onChanged();
  };
  return <section className="space-y-3 border-t border-border py-5">
    <h2 className="flex items-center gap-2 text-lg font-semibold"><MapPin className="h-4 w-4 text-primary" />Delivery</h2>
    <DeliveryFields address={address} onAddress={setAddress} value={v} onChange={setV} />
    <Button type="button" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save delivery"}</Button>
  </section>;
}
