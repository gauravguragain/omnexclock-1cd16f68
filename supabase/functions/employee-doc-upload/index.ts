import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CATEGORIES = ["rsa", "food_handling", "photo_id", "visa", "other"];
const MAX_BYTES = 10 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supaUrl, svc);

    const form = await req.formData();
    const employee_code = String(form.get("employee_code") || "").trim();
    const business_code = String(form.get("business_code") || "").trim();
    const category = String(form.get("category") || "").trim();
    const custom_label = String(form.get("custom_label") || "").trim();
    const expiry_date = String(form.get("expiry_date") || "").trim() || null;
    const file = form.get("file");

    if (!employee_code || !business_code || !CATEGORIES.includes(category)) {
      return json({ error: "Invalid input" }, 400);
    }
    if (!(file instanceof File)) return json({ error: "File required" }, 400);
    if (file.size > MAX_BYTES) return json({ error: "File exceeds 10MB" }, 400);

    // Resolve business + employee
    const { data: biz } = await admin.from("businesses").select("id").eq("business_code", business_code).maybeSingle();
    if (!biz) return json({ error: "Business not found" }, 404);
    const { data: emp } = await admin.from("employees").select("id").eq("employee_code", employee_code).eq("business_id", biz.id).eq("active", true).maybeSingle();
    if (!emp) return json({ error: "Employee not found" }, 404);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const key = `${biz.id}/${emp.id}/${crypto.randomUUID()}-${safeName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await admin.storage.from("employee-documents").upload(key, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 500);

    const { data: docId, error: rpcErr } = await admin.rpc("insert_my_employee_document", {
      _employee_code: employee_code,
      _business_code: business_code,
      _category: category,
      _custom_label: custom_label || null,
      _file_path: key,
      _file_name: safeName,
      _file_size: file.size,
      _mime_type: file.type || null,
      _expiry_date: expiry_date,
    });
    if (rpcErr || !docId) {
      await admin.storage.from("employee-documents").remove([key]);
      return json({ error: rpcErr?.message || "Insert failed" }, 500);
    }
    return json({ id: docId, file_path: key });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
