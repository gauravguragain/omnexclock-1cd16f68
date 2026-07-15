import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Deletes storage object for a doc path. Used by employee flow after RPC delete returns path.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { employee_code, business_code, doc_id } = await req.json();
    if (!employee_code || !business_code || !doc_id) {
      return json({ error: "Invalid input" }, 400);
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: path, error } = await admin.rpc("delete_my_employee_document", {
      _employee_code: employee_code,
      _business_code: business_code,
      _doc_id: doc_id,
    });
    if (error) return json({ error: error.message }, 500);
    if (!path) return json({ error: "Not allowed" }, 403);
    await admin.storage.from("employee-documents").remove([path]);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
