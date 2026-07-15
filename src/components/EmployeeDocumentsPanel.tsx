import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Clock, Download, Trash2, FileText } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  rsa: "RSA / Food Handling",
  food_handling: "Food Handling",
  photo_id: "Photo ID",
  visa: "Visa / Work Rights",
  other: "Other",
};

interface AdminDoc {
  id: string;
  employee_id: string;
  category: string;
  custom_label: string | null;
  file_name: string;
  file_path: string;
  file_size: number | null;
  expiry_date: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
}

export default function EmployeeDocumentsPanel({ employeeId, businessId }: { employeeId: string; businessId: string }) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<AdminDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<AdminDoc | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("employee_documents")
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });
    setDocs((data as AdminDoc[]) || []);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage.from("employee-documents").createSignedUrl(path, 300);
    if (error || !data) return toast({ title: "Cannot open file", variant: "destructive" });
    window.open(data.signedUrl, "_blank");
  };

  const setStatus = async (id: string, status: "verified" | "rejected" | "pending", note: string) => {
    const { data, error } = await supabase.rpc("admin_set_document_status", { _doc_id: id, _status: status, _note: note });
    if (error || !data) return toast({ title: "Update failed", variant: "destructive" });
    toast({ title: `Marked ${status}` });
    setReviewing(null); setReviewNote("");
    await load();
  };

  const remove = async (doc: AdminDoc) => {
    if (!confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return;
    const { error: sErr } = await supabase.storage.from("employee-documents").remove([doc.file_path]);
    if (sErr) return toast({ title: "Storage delete failed", variant: "destructive" });
    const { error } = await supabase.from("employee_documents").delete().eq("id", doc.id);
    if (error) return toast({ title: "Delete failed", variant: "destructive" });
    toast({ title: "Deleted" });
    await load();
  };

  const statusBadge = (s: string) => {
    if (s === "verified") return <Badge className="bg-success/15 text-success border-success/30"><CheckCircle2 className="h-3 w-3 mr-1" />Verified</Badge>;
    if (s === "rejected") return <Badge className="bg-destructive/15 text-destructive border-destructive/30"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
    return <Badge className="bg-muted text-muted-foreground border-border"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading documents...</p>;

  return (
    <div className="space-y-2">
      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No documents uploaded.</p>
      ) : (
        docs.map(d => {
          const expired = d.expiry_date && new Date(d.expiry_date) < new Date();
          return (
            <div key={d.id} className="rounded-lg bg-muted p-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    {d.custom_label || CATEGORY_LABELS[d.category] || d.category}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{d.file_name}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                    <span>Uploaded {new Date(d.created_at).toLocaleDateString()}</span>
                    {d.expiry_date && <span className={expired ? "text-destructive font-semibold" : ""}>· Expires {new Date(d.expiry_date).toLocaleDateString()}{expired ? " (expired)" : ""}</span>}
                  </div>
                  {d.admin_note && <p className="text-xs italic text-muted-foreground mt-1">Note: {d.admin_note}</p>}
                </div>
                {statusBadge(d.status)}
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => openFile(d.file_path)}>
                  <Download className="h-3.5 w-3.5 mr-1" /> View
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setReviewing(d); setReviewNote(d.admin_note || ""); }}>
                  Review
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => remove(d)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })
      )}

      <Dialog open={!!reviewing} onOpenChange={(o) => { if (!o) { setReviewing(null); setReviewNote(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Review Document</DialogTitle>
          </DialogHeader>
          {reviewing && (
            <div className="space-y-3">
              <p className="text-sm">{reviewing.custom_label || CATEGORY_LABELS[reviewing.category]}</p>
              <p className="text-xs text-muted-foreground">{reviewing.file_name}</p>
              <div>
                <label className="text-xs">Note (optional)</label>
                <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={3} maxLength={500} />
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setStatus(reviewing.id, "pending", reviewNote)}>Reset to Pending</Button>
                <Button variant="destructive" onClick={() => setStatus(reviewing.id, "rejected", reviewNote)}>Reject</Button>
                <Button onClick={() => setStatus(reviewing.id, "verified", reviewNote)}>Verify</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
