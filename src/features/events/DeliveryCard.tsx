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

export default function DeliveryCard({ booking, onChanged }: { booking: any; onChanged: () => void }) {
  const [address, setAddress] = useState(booking.service_location || "");
  const [km, setKm] = useState(booking.delivery_distance_km != null ? String(booking.delivery_distance_km) : "");
  const [rate, setRate] = useState(String(booking.delivery_rate_per_km ?? DEFAULT_RATE_PER_KM));
  const [manual, setManual] = useState(!!booking.delivery_fee_manual);
  const [manualFee, setManualFee] = useState(booking.delivery_fee_manual && booking.delivery_fee != null ? String(booking.delivery_fee) : "");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setAddress(booking.service_location || ""); }, [booking.service_location]);

  const autoFee = km ? deliveryFeeFor(Number(km), Number(rate) || 0) : null;
  const fee = manual ? (manualFee === "" ? null : Number(manualFee)) : autoFee;
  const q = encodeURIComponent(address.trim());

  const calc = async () => {
    if (!address.trim()) { toast.error("Enter the delivery address first"); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("delivery-distance", { body: { address } });
    setBusy(false);
    if (error || data?.error) { toast.error(data?.error || "Could not calculate distance — enter it manually"); return; }
    setKm(String(data.km)); toast.success(`${data.km} km from Wentworthville (about ${data.minutes} min drive)`);
  };
  const save = async () => {
    setSaving(true);
    const oldFee = Number(booking.delivery_fee || 0);
    const newFee = fee ?? 0;
    const total = Math.max(0, Number(booking.total_amount || 0) - oldFee + newFee);
    const { error } = await supabase.from("crm_bookings").update({ service_location: address.trim() || null, delivery_distance_km: km === "" ? null : Number(km), delivery_rate_per_km: Number(rate) || 0, delivery_fee_manual: manual, delivery_fee: fee, total_amount: total } as any).eq("id", booking.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Delivery saved and booking total updated"); onChanged();
  };

  return <section className="space-y-3 border-t border-border py-5">
    <h2 className="flex items-center gap-2 text-lg font-semibold"><MapPin className="h-4 w-4 text-primary" />Delivery</h2>
    <div className="flex gap-2"><Input placeholder="Delivery address" value={address} onChange={e => setAddress(e.target.value)} /><Button type="button" variant="outline" onClick={calc} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get distance"}</Button></div>
    {address.trim() && <>
      <iframe title="Delivery address map" className="h-56 w-full rounded-lg border border-border" loading="lazy" src={`https://maps.google.com/maps?q=${q}&z=14&output=embed`} />
      <Button type="button" size="sm" variant="outline" asChild><a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" />View on map</a></Button>
    </>}
    <div className="grid gap-3 sm:grid-cols-2">
      <div><Label>Distance from Wentworthville (km)</Label><Input type="number" min="0" step="0.1" value={km} onChange={e => setKm(e.target.value)} placeholder="Auto or type it in" /></div>
      <div><Label>Rate per km over 50 km ($)</Label><Input type="number" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)} /></div>
    </div>
    <p className="text-xs text-muted-foreground">0–10 km $50 · 11–50 km $100 · over 50 km $100 + rate per extra km</p>
    <label className="flex items-center gap-2 text-sm"><Checkbox checked={manual} onCheckedChange={v => setManual(!!v)} />Enter delivery fee manually</label>
    {manual && <div className="max-w-xs"><Label>Delivery fee ($)</Label><Input type="number" min="0" step="0.01" value={manualFee} onChange={e => setManualFee(e.target.value)} /></div>}
    <div className="flex items-center justify-between rounded-md bg-muted/50 p-3 text-sm"><span>Delivery fee</span><strong>{fee != null ? `$${fee.toFixed(2)}` : "—"}</strong></div>
    <Button type="button" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save delivery"}</Button>
  </section>;
}
