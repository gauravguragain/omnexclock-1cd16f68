import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CRM_CONFIRMED_STAGES } from "./types";

/** Moving into a confirmed stage requires a payment recorded in Payments for the lead's event. */
export async function canMoveToStage(leadId: string, currentStatus: string | null | undefined, target: string): Promise<boolean> {
  if (!CRM_CONFIRMED_STAGES.includes(target) || CRM_CONFIRMED_STAGES.includes(String(currentStatus || ""))) return true;
  const { data: bookings } = await supabase.from("crm_bookings").select("id").eq("lead_id", leadId);
  const ids = (bookings || []).map((b: any) => b.id);
  if (ids.length) {
    const { data: pays } = await supabase.from("crm_payments").select("id").in("booking_id", ids).gt("amount", 0).limit(1);
    if (pays && pays.length) return true;
  }
  toast.error("Record the deposit in Payments first — a lead can only be confirmed once a deposit payment is received.");
  return false;
}
