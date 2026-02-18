import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, CalendarOff, Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/auditLog";

interface EmployeeRequest {
  id: string;
  employee_id: string;
  employee_name: string;
  request_type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  is_recurring: boolean;
  recurring_days: string[] | null;
  recurring_start_date: string | null;
  recurring_end_date: string | null;
  reason: string | null;
  admin_note: string | null;
  created_at: string;
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<EmployeeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("pending");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewReq, setReviewReq] = useState<EmployeeRequest | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    let query = supabase
      .from("employee_requests")
      .select("*, employees(name)")
      .order("created_at", { ascending: false });

    if (filter !== "all") {
      query = query.eq("status", filter);
    }

    const { data } = await query;
    setRequests(
      (data || []).map((r: any) => ({
        ...r,
        employee_name: r.employees?.name || "Unknown",
      }))
    );
    setLoading(false);
  };

  useEffect(() => { fetchRequests(); }, [filter]);

  const openReview = (req: EmployeeRequest) => {
    setReviewReq(req);
    setAdminNote(req.admin_note || "");
    setReviewOpen(true);
  };

  const handleDecision = async (decision: "approved" | "rejected") => {
    if (!reviewReq) return;
    setSaving(true);
    const { error } = await supabase
      .from("employee_requests")
      .update({
        status: decision,
        admin_note: adminNote.trim() || null,
        approved_at: decision === "approved" ? new Date().toISOString() : null,
      })
      .eq("id", reviewReq.id);

    if (error) {
      toast.error(error.message);
    } else {
      await logAudit(`request_${decision}`, {
        request_id: reviewReq.id,
        employee_name: reviewReq.employee_name,
        request_type: reviewReq.request_type,
      });
      toast.success(`Request ${decision}`);
      setReviewOpen(false);
      fetchRequests();
    }
    setSaving(false);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">Pending</Badge>;
      case "approved": return <Badge variant="outline" className="text-green-500 border-green-500/30">Approved</Badge>;
      case "rejected": return <Badge variant="outline" className="text-destructive border-destructive/30">Rejected</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDateRange = (req: EmployeeRequest) => {
    if (req.is_recurring) {
      const days = req.recurring_days?.join(", ") || "";
      const from = req.recurring_start_date ? new Date(req.recurring_start_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";
      const to = req.recurring_end_date ? new Date(req.recurring_end_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";
      return `Every ${days}${from ? ` (${from} – ${to})` : ""}`;
    }
    if (req.start_date) {
      const start = new Date(req.start_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
      if (req.end_date && req.end_date !== req.start_date) {
        const end = new Date(req.end_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
        return `${start} – ${end}`;
      }
      return start;
    }
    return "—";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Leave & Unavailability Requests</h2>
          <p className="text-sm text-muted-foreground">Review and approve employee requests</p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-center py-12">Loading...</p>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <CalendarOff className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No {filter !== "all" ? filter : ""} requests found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <Card key={req.id} className={req.status === "pending" ? "border-yellow-500/30" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{req.employee_name}</span>
                      {statusBadge(req.status)}
                      <Badge variant="secondary" className="text-xs capitalize">
                        {req.is_recurring && <RefreshCw className="h-3 w-3 mr-1" />}
                        {req.request_type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{formatDateRange(req)}</p>
                    {req.reason && <p className="text-sm text-foreground">{req.reason}</p>}
                    {req.admin_note && (
                      <p className="text-xs text-muted-foreground italic">Admin note: {req.admin_note}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Submitted {new Date(req.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  {req.status === "pending" && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-8 text-green-500 border-green-500/30 hover:bg-green-500/10" onClick={() => openReview(req)}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => { setReviewReq(req); setAdminNote(""); handleDecision("rejected"); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Request</DialogTitle>
          </DialogHeader>
          {reviewReq && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Employee</Label>
                <p className="text-sm font-medium">{reviewReq.employee_name}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <p className="text-sm capitalize">{reviewReq.request_type}{reviewReq.is_recurring ? " (Recurring)" : ""}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Dates</Label>
                <p className="text-sm">{formatDateRange(reviewReq)}</p>
              </div>
              {reviewReq.reason && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Reason</Label>
                  <p className="text-sm">{reviewReq.reason}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Admin Note (optional)</Label>
                <Textarea placeholder="Add a note..." value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleDecision("rejected")} disabled={saving}>Reject</Button>
            <Button onClick={() => handleDecision("approved")} disabled={saving} className="bg-green-600 hover:bg-green-700">Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
