import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Shield, FileText, Building2, UserX, UserCheck, StickyNote, ShieldOff, RefreshCw, LogIn, Edit, Image, Palette, PlusCircle, Users } from "lucide-react";
import { format } from "date-fns";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface MasterLog {
  id: string;
  action: string;
  details: Record<string, any> | null;
  created_at: string;
  author_email?: string;
  author_name?: string;
}

const ACTION_CONFIG: Record<string, { label: string; icon: typeof Building2; color: string }> = {
  user_sign_in: { label: "Sign In", icon: LogIn, color: "text-blue-400" },
  business_registered: { label: "Business Registered", icon: PlusCircle, color: "text-green-400" },
  business_details_updated: { label: "Business Updated", icon: Edit, color: "text-blue-400" },
  business_logo_updated: { label: "Logo Updated", icon: Image, color: "text-purple-400" },
  business_theme_changed: { label: "Theme Changed", icon: Palette, color: "text-pink-400" },
  business_status_changed: { label: "Status Changed", icon: ShieldOff, color: "text-yellow-400" },
  business_deleted: { label: "Business Deleted", icon: Building2, color: "text-red-400" },
  business_note_added: { label: "Note Added", icon: StickyNote, color: "text-blue-400" },
  role_changed: { label: "Role Changed", icon: Shield, color: "text-cyan-400" },
  user_removed_from_business: { label: "User Removed", icon: UserX, color: "text-orange-400" },
  user_approved: { label: "User Approved", icon: UserCheck, color: "text-green-400" },
  user_unapproved: { label: "User Unapproved", icon: UserX, color: "text-yellow-400" },
  user_deleted: { label: "User Deleted", icon: UserX, color: "text-red-400" },
  password_reset: { label: "Password Reset", icon: Shield, color: "text-orange-400" },
  user_force_logout: { label: "Force Logout", icon: UserX, color: "text-orange-400" },
};

export default function MasterAuditLogPage() {
  const [logs, setLogs] = useState<MasterLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("master_audit_logs")
      .select("id, action, details, created_at, user_id")
      .order("created_at", { ascending: false })
      .limit(200);

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(l => l.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, { email: p.email, name: p.full_name }]) || []);

      setLogs(data.map(l => ({
        ...l,
        details: l.details as Record<string, any> | null,
        author_email: profileMap.get(l.user_id)?.email || "Unknown",
        author_name: profileMap.get(l.user_id)?.name || undefined,
      })));
    } else {
      setLogs([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = logs.filter(l => {
    const matchAction = actionFilter === "all" || l.action === actionFilter;
    const matchSearch = !search ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      (l.author_email || "").toLowerCase().includes(search.toLowerCase()) ||
      JSON.stringify(l.details || {}).toLowerCase().includes(search.toLowerCase());
    return matchAction && matchSearch;
  });

  const uniqueActions = [...new Set(logs.map(l => l.action))];

  const renderDetails = (log: MasterLog) => {
    if (!log.details) return null;
    const d = log.details;

    switch (log.action) {
      case "user_sign_in":
        return <span><strong>{d.email}</strong> signed in</span>;
      case "business_registered":
        return <span><strong>{d.business_name}</strong> registered (code: {d.business_code})</span>;
      case "business_details_updated":
        return <span><strong>{d.business_name}</strong> details updated</span>;
      case "business_logo_updated":
        return <span><strong>{d.business_name}</strong> logo updated</span>;
      case "business_theme_changed":
        return <span><strong>{d.business_name}</strong> theme changed to "{d.theme_name}"</span>;
      case "business_status_changed":
        return (
          <span>
            <strong>{d.business_name}</strong>: {d.old_status} → {d.new_status}
          </span>
        );
      case "business_deleted":
        return (
          <span>
            <strong>{d.business_name}</strong> ({d.business_code}) permanently deleted
          </span>
        );
      case "business_note_added":
        return <span>Note added to <strong>{d.business_name}</strong></span>;
      case "role_changed":
        return <span><strong>{d.user_email}</strong> — {d.role} role {d.action} at <strong>{d.business_name}</strong></span>;
      case "user_removed_from_business":
        return <span><strong>{d.user_email}</strong> removed from <strong>{d.business_name}</strong></span>;
      case "user_approved":
      case "user_unapproved":
        return <span><strong>{d.user_email}</strong></span>;
      case "user_deleted":
        return <span><strong>{d.user_email}</strong> permanently deleted</span>;
      case "password_reset":
        return <span>Password reset for <strong>{d.user_email}</strong></span>;
      case "user_force_logout":
        return <span>Force logout for <strong>{d.user_email}</strong></span>;
      default:
        return <span className="text-xs text-muted-foreground">{JSON.stringify(d)}</span>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Platform Audit Log</h1>
          <p className="text-muted-foreground">Master-level platform activity</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-card border-border"
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[200px] bg-card border-border">
            <SelectValue placeholder="Filter by action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {uniqueActions.map(a => (
              <SelectItem key={a} value={a}>{ACTION_CONFIG[a]?.label || a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Performed By</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      {logs.length === 0 ? "No audit logs yet. Master actions will appear here." : "No logs match your filters."}
                    </TableCell>
                  </TableRow>
                ) : filtered.map(log => {
                  const config = ACTION_CONFIG[log.action] || { label: log.action, icon: FileText, color: "text-muted-foreground" };
                  const Icon = config.icon;
                  return (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${config.color}`} />
                          <Badge variant="outline" className="text-xs">{config.label}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{renderDetails(log)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.author_name || log.author_email}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.created_at), "MMM d, yyyy h:mm a")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
