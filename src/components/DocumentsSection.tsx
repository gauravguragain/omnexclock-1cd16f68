import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, Download, CheckCircle2, Clock, XCircle } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  rsa: "RSA / Food Handling",
  food_handling: "Food Handling",
  photo_id: "Photo ID",
  visa: "Visa / Work Rights",
  other: "Other",
};

interface Doc {
  id: string;
  category: string;
  custom_label: string | null;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  expiry_date: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  verified_at: string | null;
}

const MAX_BYTES = 10 * 1024 * 1024;

export default function DocumentsSection({ employeeCode, businessCode }: { employeeCode: string; businessCode: string }) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<string>("rsa");
  const [customLabel, setCustomLabel] = useState("");
  const [expiry, setExpiry] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc("get_my_employee_documents", {
      _employee_code: employeeCode,
      _business_code: businessCode,
    });
    setDocs((data as Doc[]) || []);
    setLoading(false);
  }, [employeeCode, businessCode]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async () => {
    if (!file) return toast({ title: "Select a file", variant: "destructive" });
    if (file.size > MAX_BYTES) return toast({ title: "File too large", description: "Max 10MB", variant: "destructive" });
    if (category === "other" && !customLabel.trim()) return toast({ title: "Add a label for 'Other'", variant: "destructive" });

    setUploading(true);
    try {
      const form = new FormData();
      form.append("employee_code", employeeCode);
      form.append("business_code", businessCode);
      form.append("category", category);
      form.append("custom_label", customLabel);
      if (expiry) form.append("expiry_date", expiry);
      form.append("file", file);

      const { data, error } = await supabase.functions.invoke("employee-doc-upload", { body: form });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);

      toast({ title: "Document uploaded" });
      setFile(null); setCustomLabel(""); setExpiry(""); setCategory("rsa");
      (document.getElementById("doc-file-input") as HTMLInputElement | null)?.value && ((document.getElementById("doc-file-input") as HTMLInputElement).value = "");
      await load();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (path: string) => {
    const { data, error } = await supabase.functions.invoke("employee-doc-signed-url", {
      body: { employee_code: employeeCode, business_code: businessCode, file_path: path },
    });
    if (error || (data as any)?.error) return toast({ title: "Cannot open", variant: "destructive" });
    window.open((data as any).url, "_blank");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    const { data, error } = await supabase.functions.invoke("employee-doc-delete", {
      body: { employee_code: employeeCode, business_code: businessCode, doc_id: id },
    });
    if (error || (data as any)?.error) {
      return toast({ title: "Delete failed", description: (data as any)?.error || "Verified documents cannot be deleted", variant: "destructive" });
    }
    toast({ title: "Deleted" });
    await load();
  };

  const statusBadge = (s: string) => {
    if (s === "verified") return <Badge className="bg-success/15 text-success border-success/30"><CheckCircle2 className="h-3 w-3 mr-1" />Verified</Badge>;
    if (s === "rejected") return <Badge className="bg-destructive/15 text-destructive border-destructive/30"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
    return <Badge className="bg-muted text-muted-foreground border-border"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" /> Upload Document</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Expiry date (optional)</Label>
              <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </div>
          </div>
          {category === "other" && (
            <div>
              <Label className="text-xs">Document label</Label>
              <Input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="e.g. First Aid Certificate" maxLength={80} />
            </div>
          )}
          <div>
            <Label className="text-xs">File (max 10MB)</Label>
            <Input id="doc-file-input" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <Button onClick={handleUpload} disabled={uploading || !file} className="w-full">
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> My Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : docs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {docs.map(d => (
                <div key={d.id} className="rounded-lg bg-muted p-3 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {d.custom_label || CATEGORY_LABELS[d.category] || d.category}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{d.file_name}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                        <span>{new Date(d.created_at).toLocaleDateString()}</span>
                        {d.expiry_date && <span>· Expires {new Date(d.expiry_date).toLocaleDateString()}</span>}
                        {d.file_size && <span>· {(d.file_size / 1024).toFixed(0)} KB</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {statusBadge(d.status)}
                    </div>
                  </div>
                  {d.admin_note && (
                    <p className="text-xs text-muted-foreground italic">Note: {d.admin_note}</p>
                  )}
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => handleView(d.file_path)}>
                      <Download className="h-3.5 w-3.5 mr-1" /> View
                    </Button>
                    {d.status !== "verified" && (
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(d.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
