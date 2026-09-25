import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, notAuthed } from "../supabase";

export default defineTool({
  name: "list_businesses",
  title: "List businesses",
  description: "List the businesses you can access, with their IDs and codes.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const { data, error } = await supabaseForUser(ctx).from("businesses").select("id, name, code").order("name");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const businesses = (data ?? []).map((b: any) => ({ id: String(b.id), name: String(b.name ?? ""), code: String(b.code ?? "") }));
    return { content: [{ type: "text", text: JSON.stringify(businesses) }], structuredContent: { businesses } };
  },
});
