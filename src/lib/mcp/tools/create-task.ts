import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "../supabase";

export default defineTool({
  name: "create_task",
  title: "Create task",
  description: "Add a manual sales & events task for a business, optionally linked to a lead.",
  inputSchema: {
    business_id: z.string().uuid().describe("Business ID from list_businesses."),
    title: z.string().trim().min(1).describe("Task title."),
    due_at: z.string().describe("Due date/time as ISO 8601, e.g. 2026-10-01T10:00:00+10:00."),
    priority: z.enum(["low", "medium", "high"]).optional().describe("Defaults to medium."),
    description: z.string().optional().describe("Optional notes."),
    lead_id: z.string().uuid().optional().describe("Optional linked lead ID."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ business_id, title, due_at, priority, description, lead_id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const userId = ctx.getUserId();
    const { data, error } = await supabaseForUser(ctx)
      .from("crm_tasks")
      .insert({
        business_id, title, due_at, priority: priority ?? "medium", description: description ?? null,
        lead_id: lead_id ?? null, task_type: "manual", status: "open", automated: false,
        assigned_to: userId, created_by: userId,
      })
      .select("id, title, due_at")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const task = { id: data.id, title: data.title, due_at: data.due_at };
    return { content: [{ type: "text", text: `Created task "${task.title}"` }], structuredContent: { task } };
  },
});
