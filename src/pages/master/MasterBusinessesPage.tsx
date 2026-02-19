import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logMasterAudit } from "@/lib/auditLog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Mail, Phone, MapPin, Calendar, Users, Trash2,
  Search, ShieldOff, StickyNote, Send, X, AlertTriangle, CheckCircle2, Pause
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";

interface BusinessInfo {
  id: string;
  name: string;
  business_code: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  industry: string | null;
  description: string | null;
  logo_url: string | null;
  created_at: string | null;
  status: string;
  owner_email?: string;
  employee_count?: number;
}

interface BusinessNote {
  id: string;
  content: string;
  created_at: string;
  author_name?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  active: { label: "Active", color: "bg-green-500/15 text-green-400 border-green-500/30", icon: CheckCircle2 },
  suspended: { label: "Suspended", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", icon: Pause },
  deactivated: { label: "Deactivated", color: "bg-red-500/15 text-red-400 border-red-500/30", icon: ShieldOff },
};

export default function MasterBusinessesPage() {
  const { user } = useAuth();
  const [businesses, setBusinesses] = useState<BusinessInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, BusinessNote[]>>({});
  const [newNote, setNewNote] = useState("");
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ bizId: string; bizName: string; action: string } | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("businesses")
      .select("id, name, business_code, email, phone, address, industry, description, logo_url, created_at, owner_id, status")
      .order("created_at", { ascending: false });

    if (data) {
      const ownerIds = [...new Set(data.map(b => b.owner_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", ownerIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.email]) || []);

      const { data: employees } = await supabase
        .from("employees")
        .select("business_id")
        .eq("active", true);

      const countMap = new Map<string, number>();
      employees?.forEach(e => {
        if (e.business_id) countMap.set(e.business_id, (countMap.get(e.business_id) || 0) + 1);
      });

      setBusinesses(data.map(b => ({
        ...b,
        owner_email: profileMap.get(b.owner_id) || "Unknown",
        employee_count: countMap.get(b.id) || 0,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadNotes = async (businessId: string) => {
    setLoadingNotes(true);
    const { data } = await supabase
      .from("business_notes")
      .select("id, content, created_at, author_id")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (data) {
      const authorIds = [...new Set(data.map(n => n.author_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", authorIds);

      const nameMap = new Map(profiles?.map(p => [p.id, p.full_name || p.email]) || []);

      setNotes(prev => ({
        ...prev,
        [businessId]: data.map(n => ({
          id: n.id,
          content: n.content,
          created_at: n.created_at,
          author_name: nameMap.get(n.author_id) || "Unknown",
        })),
      }));
    }
    setLoadingNotes(false);
  };

  const toggleNotes = (businessId: string) => {
    if (expandedNotes === businessId) {
      setExpandedNotes(null);
    } else {
      setExpandedNotes(businessId);
      if (!notes[businessId]) loadNotes(businessId);
    }
    setNewNote("");
  };

  const addNote = async (businessId: string) => {
    if (!newNote.trim() || !user) return;
    const biz = businesses.find(b => b.id === businessId);

    const { error } = await supabase
      .from("business_notes")
      .insert({ business_id: businessId, author_id: user.id, content: newNote.trim() });

    if (error) {
      toast({ title: "Error", description: "Failed to add note", variant: "destructive" });
    } else {
      toast({ title: "Note added" });
      logMasterAudit("business_note_added", { business_id: businessId, business_name: biz?.name });
      setNewNote("");
      loadNotes(businessId);
    }
  };

  const deleteNote = async (noteId: string, businessId: string) => {
    await supabase.from("business_notes").delete().eq("id", noteId);
    loadNotes(businessId);
  };

  const updateStatus = async (bizId: string, newStatus: string) => {
    const biz = businesses.find(b => b.id === bizId);
    const oldStatus = biz?.status;

    const { error } = await supabase
      .from("businesses")
      .update({ status: newStatus })
      .eq("id", bizId);

    if (error) {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    } else {
      toast({ title: "Status updated", description: `Business set to ${newStatus}` });
      logMasterAudit("business_status_changed", {
        business_id: bizId,
        business_name: biz?.name,
        old_status: oldStatus,
        new_status: newStatus,
      });
      load();
    }
    setConfirmAction(null);
  };

  const deleteBusiness = async (biz: BusinessInfo) => {
    setDeleting(biz.id);
    const { data, error } = await supabase.functions.invoke("delete-business", {
      body: { business_id: biz.id },
    });

    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message || "Failed to delete business", variant: "destructive" });
    } else {
      toast({ title: "Business deleted", description: `${biz.name} and all its data have been permanently removed.` });
      logMasterAudit("business_deleted", {
        business_id: biz.id,
        business_name: biz.name,
        business_code: biz.business_code,
      });
      load();
    }
    setDeleting(null);
    setConfirmAction(null);
  };

  const filtered = businesses.filter(b => {
    const matchSearch = !search || b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.business_code.toLowerCase().includes(search.toLowerCase()) ||
      (b.owner_email || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statusCounts = {
    all: businesses.length,
    active: businesses.filter(b => b.status === "active").length,
    suspended: businesses.filter(b => b.status === "suspended").length,
    deactivated: businesses.filter(b => b.status === "deactivated").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Building2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Business Management</h1>
        <p className="text-muted-foreground">Manage all registered businesses on the platform</p>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { key: "all", label: "Total", icon: Building2, color: "text-primary" },
          { key: "active", label: "Active", icon: CheckCircle2, color: "text-green-400" },
          { key: "suspended", label: "Suspended", icon: Pause, color: "text-yellow-400" },
          { key: "deactivated", label: "Deactivated", icon: ShieldOff, color: "text-red-400" },
        ].map(({ key, label, icon: Icon, color }) => (
          <Card
            key={key}
            className={`bg-card border-border cursor-pointer transition-colors ${statusFilter === key ? "ring-1 ring-primary" : ""}`}
            onClick={() => setStatusFilter(key)}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={`h-5 w-5 ${color}`} />
              <div>
                <p className="text-2xl font-bold text-foreground">{statusCounts[key as keyof typeof statusCounts]}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, code, or owner email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10 bg-card border-border"
        />
      </div>

      {/* Business list */}
      {filtered.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            {search || statusFilter !== "all" ? "No businesses match your filters." : "No businesses registered yet."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((biz) => {
            const statusInfo = STATUS_CONFIG[biz.status] || STATUS_CONFIG.active;
            const StatusIcon = statusInfo.icon;
            const isExpanded = expandedNotes === biz.id;

            return (
              <Card key={biz.id} className={`bg-card border-border ${biz.status === "deactivated" ? "opacity-60" : ""}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    {biz.logo_url ? (
                      <img src={biz.logo_url} alt={biz.name} className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                        <Building2 className="h-6 w-6 text-primary" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base text-foreground">{biz.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-xs text-primary border-primary/30">{biz.business_code}</Badge>
                        {biz.industry && <Badge variant="secondary" className="text-xs">{biz.industry}</Badge>}
                        <Badge className={`text-xs border ${statusInfo.color}`}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusInfo.label}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Select
                        value={biz.status}
                        onValueChange={(val) => {
                          if (val === "deactivated") {
                            setConfirmAction({ bizId: biz.id, bizName: biz.name, action: "deactivate" });
                          } else {
                            updateStatus(biz.id, val);
                          }
                        }}
                      >
                        <SelectTrigger className="w-[130px] h-8 text-xs bg-secondary border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">✅ Active</SelectItem>
                          <SelectItem value="suspended">⏸️ Suspended</SelectItem>
                          <SelectItem value="deactivated">🚫 Deactivated</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => toggleNotes(biz.id)} title="Internal notes">
                        <StickyNote className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmAction({ bizId: biz.id, bizName: biz.name, action: "delete" })}
                        disabled={deleting === biz.id}
                        title="Delete business"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-muted-foreground">
                    {biz.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{biz.email}</span>
                      </div>
                    )}
                    {biz.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>{biz.phone}</span>
                      </div>
                    )}
                    {biz.address && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{biz.address}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>Owner: {biz.owner_email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{biz.employee_count} active employee{biz.employee_count !== 1 ? "s" : ""}</span>
                    </div>
                    {biz.created_at && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>Registered {format(new Date(biz.created_at), "MMM d, yyyy")}</span>
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border pt-3 space-y-3">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <StickyNote className="h-3.5 w-3.5" />
                        Internal Notes
                      </h4>
                      <div className="flex gap-2">
                        <Textarea
                          placeholder="Add an internal note..."
                          value={newNote}
                          onChange={e => setNewNote(e.target.value)}
                          className="bg-secondary border-border text-sm min-h-[60px]"
                          rows={2}
                        />
                        <Button size="icon" className="h-auto flex-shrink-0" onClick={() => addNote(biz.id)} disabled={!newNote.trim()}>
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                      {loadingNotes ? (
                        <p className="text-xs text-muted-foreground">Loading notes...</p>
                      ) : (notes[biz.id] || []).length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No notes yet.</p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {(notes[biz.id] || []).map(note => (
                            <div key={note.id} className="bg-secondary/50 rounded-lg p-2.5 text-sm group relative">
                              <p className="text-foreground whitespace-pre-wrap">{note.content}</p>
                              <div className="flex items-center justify-between mt-1.5">
                                <p className="text-xs text-muted-foreground">
                                  {note.author_name} · {format(new Date(note.created_at), "MMM d, yyyy h:mm a")}
                                </p>
                                <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive" onClick={() => deleteNote(note.id, biz.id)}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {confirmAction?.action === "delete" ? "Delete Business" : "Deactivate Business"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {confirmAction?.action === "delete" ? (
                <>This will <strong className="text-destructive">permanently delete</strong> "{confirmAction?.bizName}" and ALL its data. This cannot be undone.</>
              ) : (
                <>Deactivating "{confirmAction?.bizName}" will prevent all users from accessing this business. This can be reversed.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-secondary border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.action === "delete") {
                  const biz = businesses.find(b => b.id === confirmAction.bizId);
                  if (biz) deleteBusiness(biz);
                } else {
                  updateStatus(confirmAction.bizId, "deactivated");
                }
              }}
            >
              {confirmAction?.action === "delete" ? "Delete Permanently" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
