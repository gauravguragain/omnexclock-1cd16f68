import { useEffect, useState } from "react";
import { toAusLocaleString } from "@/lib/dateUtils";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AuditLog {
  id: string;
  action: string;
  timestamp: string;
  user_id: string | null;
  details: any;
}

interface UserTally {
  user_id: string;
  email: string;
  actions: Record<string, number>;
  total: number;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [tallies, setTallies] = useState<UserTally[]>([]);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = async () => {
    const [logsRes, profilesRes] = await Promise.all([
      supabase.from("audit_logs").select("*").order("timestamp", { ascending: false }).limit(500),
      supabase.from("profiles").select("id, email, full_name"),
    ]);

    const logsData = logsRes.data || [];
    setLogs(logsData);

    const profileMap = new Map<string, string>();
    for (const p of profilesRes.data || []) {
      profileMap.set(p.id, p.full_name || p.email);
    }
    setProfiles(profileMap);
    buildTallies(logsData, profileMap);
  };

  const buildTallies = (logsData: AuditLog[], profileMap: Map<string, string>) => {
    const tallyMap = new Map<string, Record<string, number>>();
    const nameMap = new Map<string, string>();
    for (const log of logsData) {
      // For kiosk events, use employee_name from details as the identifier
      const uid = log.user_id || (log.details?.employee_name ? `emp_${log.details.employee_name}` : "unknown");
      if (!tallyMap.has(uid)) tallyMap.set(uid, {});
      const actions = tallyMap.get(uid)!;
      actions[log.action] = (actions[log.action] || 0) + 1;
      // Store display name
      if (!nameMap.has(uid)) {
        nameMap.set(uid, log.user_id ? (profileMap.get(log.user_id) || "Unknown User") : (log.details?.employee_name || "Unknown"));
      }
    }

    const tallyList: UserTally[] = [];
    for (const [userId, actions] of tallyMap) {
      const total = Object.values(actions).reduce((a, b) => a + b, 0);
      tallyList.push({
        user_id: userId,
        email: nameMap.get(userId) || "Unknown User",
        actions,
        total,
      });
    }
    tallyList.sort((a, b) => b.total - a.total);
    setTallies(tallyList);
  };

  useEffect(() => {
    fetchData();

    // Realtime subscription for instant updates
    const channel = supabase
      .channel("audit-logs-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, () => {
        fetchData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const actionColors: Record<string, string> = {
    timesheet_edit: "bg-warning/20 text-warning border-warning/30",
    timesheet_add: "bg-primary/20 text-primary border-primary/30",
    timesheet_delete: "bg-destructive/20 text-destructive border-destructive/30",
    timesheet_approve: "bg-success/20 text-success border-success/30",
    timesheet_unapprove: "bg-warning/20 text-warning border-warning/30",
    timesheet_approve_all: "bg-success/20 text-success border-success/30",
    employee_add: "bg-primary/20 text-primary border-primary/30",
    employee_edit: "bg-warning/20 text-warning border-warning/30",
    employee_activate: "bg-success/20 text-success border-success/30",
    employee_deactivate: "bg-destructive/20 text-destructive border-destructive/30",
    kiosk_clock_in: "bg-success/20 text-success border-success/30",
    kiosk_clock_out: "bg-destructive/20 text-destructive border-destructive/30",
    kiosk_break_start: "bg-warning/20 text-warning border-warning/30",
    kiosk_break_end: "bg-primary/20 text-primary border-primary/30",
  };

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const userName = log.user_id ? (profiles.get(log.user_id) || "unknown") : (log.details?.employee_name || "unknown");
    const details = JSON.stringify(log.details || {}).toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      userName.toLowerCase().includes(q) ||
      details.includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-success animate-pulse" />
          <span className="text-sm text-muted-foreground">Live — updates in real-time</span>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="mr-2 h-3 w-3" /> Refresh
        </Button>
      </div>

      {/* Tally Cards by User */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Actions by User</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tallies.map((tally) => (
            <Card key={tally.user_id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium truncate">{tally.email}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(tally.actions).map(([action, count]) => (
                    <Badge
                      key={action}
                      variant="outline"
                      className={actionColors[action] || "bg-secondary text-secondary-foreground"}
                    >
                      {action.replace(/_/g, " ")}: {count}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Total: {tally.total} actions</p>
              </CardContent>
            </Card>
          ))}
          {tallies.length === 0 && (
            <Card className="col-span-full">
              <CardContent className="py-8 text-center text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No audit logs yet
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Full Log Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">Audit Log History</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium text-sm">
                      {log.user_id ? (profiles.get(log.user_id) || "Unknown") : (log.details?.employee_name || "Unknown")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={actionColors[log.action] || "bg-secondary text-secondary-foreground"}
                      >
                        {log.action.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                      {log.details?.comment || log.details?.employee_name || JSON.stringify(log.details)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {toAusLocaleString(new Date(log.timestamp), {
                        day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit", hour12: true,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No logs found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
