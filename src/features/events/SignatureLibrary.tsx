import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignaturePadDialog } from "@/components/SignaturePad";

export type SavedSignature = { id: string; signer_name: string; image_data: string };

export function useSignatures(businessId?: string) {
  const [list, setList] = useState<SavedSignature[]>([]);
  const load = async () => {
    if (!businessId) return;
    const { data } = await (supabase.from("crm_signatures" as any) as any).select("id, signer_name, image_data").eq("business_id", businessId).order("signer_name");
    setList(data || []);
  };
  useEffect(() => { load(); }, [businessId]);
  return { list, reload: load };
}

export async function saveSignature(businessId: string, signerName: string, image: string, userId?: string) {
  const { data, error } = await (supabase.from("crm_signatures" as any) as any).insert({ business_id: businessId, signer_name: signerName.trim(), image_data: image, created_by: userId }).select("id, signer_name, image_data").single();
  if (error) { toast.error(error.message); return null; }
  return data as SavedSignature;
}

/** Settings: manage saved staff signatures. */
export function SignatureLibrary({ businessId }: { businessId: string }) {
  const { user } = useAuth();
  const { list, reload } = useSignatures(businessId);
  const [name, setName] = useState(""); const [pad, setPad] = useState(false);
  const remove = async (id: string) => { const { error } = await (supabase.from("crm_signatures" as any) as any).delete().eq("id", id); if (error) toast.error(error.message); else reload(); };
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">{list.map(s => <div key={s.id} className="flex items-center gap-3 rounded-md border border-border p-3">
      <img src={s.image_data} alt={`${s.signer_name} signature`} className="h-12 w-28 rounded bg-white object-contain" />
      <span className="flex-1 text-sm font-medium">{s.signer_name}</span>
      <Button size="icon" variant="ghost" title="Delete signature" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4" /></Button>
    </div>)}{!list.length && <p className="text-sm text-muted-foreground">No saved signatures yet.</p>}</div>
    <div className="flex flex-wrap gap-2"><Input value={name} onChange={e => setName(e.target.value)} placeholder="Signer's name" maxLength={100} className="max-w-xs" />
      <Button variant="outline" disabled={!name.trim()} onClick={() => setPad(true)}><PenLine className="mr-2 h-4 w-4" />Add signature</Button></div>
    <SignaturePadDialog open={pad} onOpenChange={setPad} title={`Signature for ${name}`} doneLabel="Save signature" onDone={async img => { if (await saveSignature(businessId, name, img, user?.id)) { setName(""); toast.success("Signature saved"); reload(); } }} />
  </div>;
}
