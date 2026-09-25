import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "../supabase";

export default defineTool({
  name: "list_upcoming_bookings",
  title: "List upcoming events",
  description: "List upcoming event and catering bookings for a business from today onward.",
  inputSchema: {
    business_id: z.string().uuid().describe("Business ID from list_businesses."),
    limit: z.number().int().min(1).max(100).optional().describe("Max results (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ business_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
    const { data, error } = await supabaseForUser(ctx)
      .from("crm_bookings")
      .select("id, event_name, event_type, booking_kind, event_date, start_time, end_time, guest_count, status, service_location")
      .eq("business_id", business_id)
      .gte("event_date", today)
      .order("event_date")
      .limit(limit ?? 25);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const bookings = (data ?? []).map((b) => ({
      id: b.id, name: b.event_name, type: b.event_type, kind: b.booking_kind, date: b.event_date,
      start_time: b.start_time, end_time: b.end_time, guests: b.guest_count, status: b.status, location: b.service_location,
    }));
    return { content: [{ type: "text", text: JSON.stringify(bookings) }], structuredContent: { bookings } };
  },
});
