import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export const DEFAULT_CHAFING_PRICE = 15;
const money = (n: number) => `$${n.toFixed(2)}`;

/** Chafing dish add-on plus the booking's full price breakdown (menu + delivery + chafing). */
export default function ChafingCard({ booking, menuTotal, onChanged }: { booking: any; menuTotal: number; onChanged: () => void }) {
  const [on, setOn] = useState(Number(booking.chafing_dishes || 0) > 0);
  const [qty, setQty] = useState(String(booking.chafing_dishes || 1));
  const [price, setPrice] = useState(String(booking.chafing_dish_price ?? DEFAULT_CHAFING_PRICE));
  const [saving, setSaving] = useState(false);
  const count = on ? Math.max(0, Math.floor(Number(qty) || 0)) : 0;
  const unit = Math.max(0, Number(price) || 0);
  const chafing = count * unit;
  const delivery = booking.fulfilment_method === "pickup" ? 0 : Number(booking.delivery_fee || 0);
  const grand = Math.round((menuTotal + delivery + chafing) * 100) / 100;
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("crm_bookings").update({ chafing_dishes: count, chafing_dish_price: unit, total_amount: grand } as any).eq("id", booking.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved and booking total updated"); onChanged();
  };
  return <>
    <section className="space-y-3 border-t border-border py-5">
      <h2 className="text-lg font-semibold">Chafing dishes</h2>
      <label className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={on} onCheckedChange={v => setOn(!!v)} />Chafing dishes required</label>
      {on && <div className="grid gap-3 sm:grid-cols-3">
        <div><Label className="text-xs">Number of chafing dishes</Label><Input type="number" min={0} step={1} value={qty} onChange={e => setQty(e.target.value)} /></div>
        <div><Label className="text-xs">Price per chafing dish ($)</Label><Input type="number" min={0} step="0.01" value={price} onChange={e => setPrice(e.target.value)} /></div>
        <div className="flex flex-col justify-end"><p className="rounded-md bg-muted px-3 py-2 text-sm">Chafing total <strong className="float-right">{money(chafing)}</strong></p></div>
      </div>}
    </section>
    <section className="space-y-3 border-t border-border py-5">
      <h2 className="text-lg font-semibold">Total</h2>
      <dl className="space-y-1 rounded-lg bg-muted/60 p-3 text-sm">
        <div className="flex justify-between"><dt>Menu</dt><dd>{money(menuTotal)}</dd></div>
        {booking.fulfilment_method !== "pickup" && <div className="flex justify-between"><dt>Delivery</dt><dd>{money(delivery)}</dd></div>}
        <div className="flex justify-between"><dt>Chafing dishes{count ? ` (${count} × ${money(unit)})` : ""}</dt><dd>{money(chafing)}</dd></div>
        <div className="flex justify-between border-t border-border pt-1 text-base font-semibold"><dt>Total</dt><dd>{money(grand)}</dd></div>
      </dl>
      <Button type="button" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & update total"}</Button>
    </section>
  </>;
}
