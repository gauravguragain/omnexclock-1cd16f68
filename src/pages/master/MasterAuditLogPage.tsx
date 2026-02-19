import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { format } from "date-fns";

interface AuditEntry {
  id: string;
  action: string;
  timestamp: string;
  details: Record<string, unknown> | null;
  business_id: string | null;
  business_name?: string;
}

const PAGE_SIZE = 50;

export default function MasterAuditLogPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const load = async (p: number) => {
    setLoading(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE;

    const { data: auditData } = await supabase
      .from("audit_logs")
      .select("id, action, timestamp, details, business_id")
      .order("timestamp", { ascending: false })
      .range(from, to);

    if (!auditData) { setLoading(false); return; }

    setHasMore(auditData.length > PAGE_SIZE);
    const entries = auditData.slice(0, PAGE_SIZE);

    // Resolve business names
    const bizIds = [...new Set(entries.filter(e => e.business_id).map(e => e.business_id!))];
    let bizMap = new Map<string, string>();
    if (bizIds.length > 0) {
      const { data: businesses } = await supabase
        .from("businesses")
        .select("id, name")
        .in("id", bizIds);
      bizMap = new Map((businesses || []).map(b => [b.id, b.name]));
    }

    setLogs(entries.map(e => ({
      ...e,
      details: e.details as Record<string, unknown> | null,
      business_name: e.business_id ? bizMap.get(e.business_id) || "Unknown" : undefined,
    })));
    setLoading(false);
  };

  useEffect(() => { load(page); }, [page]);

  const filtered = logs.filter(l =>
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    (l.business_name || "").toLowerCase().includes(search.toLowerCase()) ||
    JSON.stringify(l.details || {}).toLowerCase().includes(search.toLowerCase())
  );

  const getActionColor = (action: string) => {
    if (action.includes("delete") || action.includes("remove")) return "bg-destructive/20 text-destructive";
    if (action.includes("approve") || action.includes("grant")) return "bg-green-500/20 text-green-500";
    if (action.includes("kiosk")) return "bg-blue-500/20 text-blue-500";
    return "bg-primary/20 text-primary";
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Global Audit Log</h1>
        <p className="text-muted-foreground">Platform-wide activity across all businesses</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search actions, businesses..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Audit Entries
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No audit entries found</TableCell>
                  </TableRow>
                ) : filtered.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.timestamp), "MMM d, HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${getActionColor(log.action)}`}>
                        {log.action.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.business_name || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {log.details ? Object.entries(log.details).filter(([k]) => !["business_id"].includes(k)).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between p-3 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page + 1}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={!hasMore}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
