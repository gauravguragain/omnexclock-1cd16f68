import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "../supabase";

export default defineTool({
  name: "list_open_tasks",
  title: "List open tasks",
  description: "List open sales & events tasks for a business, soonest due first.",
  inputSchema: {
    business_id: z.string().uuid().describe("Business ID from list_businesses."),
    limit: z.number().int().min(1).max(100).optional().describe("Max results (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ business_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const { data, error } = await supabaseForUser(ctx)
      .from("crm_tasks")
      .select("id, title, description, due_at, priority, status, lead_id")
      .eq("business_id", business_id)
      .eq("status", "open")
      .order("due_at")
      .limit(limit ?? 25);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const tasks = (data ?? []).map((t) => ({
      id: t.id, title: t.title, description: t.description, due_at: t.due_at, priority: t.priority, lead_id: t.lead_id,
    }));
    return { content: [{ type: "text", text: JSON.stringify(tasks) }], structuredContent: { tasks } };
  },
});
