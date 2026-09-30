import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/** Issues a catering run sheet using the same rules as events: booking reference
 * autofills from the lead, and the event order number is assigned on send. */
export async function issueCateringRunsheet(rs: any, leadId?: string | null): Promise<any | null> {
  const now = new Date().toISOString();
  const ref = rs.booking_reference || (leadId || rs.lead_id ? String(leadId || rs.lead_id).slice(0, 10).toUpperCase() : null);
  const { data, error } = await supabase.from("crm_runsheets").update({ status: "sent", sent_at: now, generated_at: now, booking_reference: ref } as any).eq("id", rs.id).select().single();
  if (error) { toast.error(error.message); return null; }
  const { data: orderNo, error: orderErr } = await supabase.rpc("crm_issue_event_order" as any, { _runsheet_id: rs.id });
  if (orderErr) { toast.error(orderErr.message); return null; }
  return { ...data, event_order_number: orderNo };
}
