import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "../supabase";

export default defineTool({
  name: "list_leads",
  title: "List sales leads",
  description: "List recent sales leads for a business, optionally filtered by pipeline stage.",
  inputSchema: {
    business_id: z.string().uuid().describe("Business ID from list_businesses."),
    status: z.string().optional().describe("Pipeline stage, e.g. new, contacted, inspection_booked, deposit_received, cold."),
    limit: z.number().int().min(1).max(100).optional().describe("Max results (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ business_id, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    let q = supabaseForUser(ctx)
      .from("crm_leads")
      .select("id, full_name, email, phone, company, event_type, lead_kind, status, estimated_guest_count, preferred_dates, created_at")
      .eq("business_id", business_id)
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const leads = (data ?? []).map((l) => ({
      id: l.id, name: l.full_name, email: l.email, phone: l.phone, company: l.company,
      event_type: l.event_type, kind: l.lead_kind, status: l.status,
      guests: l.estimated_guest_count, preferred_dates: [...(l.preferred_dates ?? [])], created_at: l.created_at,
    }));
    return { content: [{ type: "text", text: JSON.stringify(leads) }], structuredContent: { leads } };
  },
});
