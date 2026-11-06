import { supabase } from "@/integrations/supabase/client";

/** A booking still awaiting confirmation becomes confirmed once any money has been recorded against it. */
export function shouldConfirmOnPayment(status: string | null | undefined, paidTotal: number): boolean {
  return status === "pending_confirmation" && paidTotal > 0;
}

/**
 * Called after a payment is recorded. Never undoes the payment: if the booking cannot be
 * confirmed (for example a venue clash), it stays pending and the reason is returned.
 */
export async function confirmBookingAfterPayment(bookingId: string): Promise<{ confirmed: boolean; error?: string }> {
  const db = supabase as any;
  const [{ data: booking }, { data: pays }] = await Promise.all([
    db.from("crm_bookings").select("status").eq("id", bookingId).maybeSingle(),
    db.from("crm_payments").select("amount").eq("booking_id", bookingId),
  ]);
  const paid = (pays || []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
  if (!shouldConfirmOnPayment(booking?.status, paid)) return { confirmed: false };
  const { error } = await db.from("crm_bookings").update({ status: "confirmed" })
    .eq("id", bookingId).eq("status", "pending_confirmation");
  return error ? { confirmed: false, error: error.message } : { confirmed: true };
}
