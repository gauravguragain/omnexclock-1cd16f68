import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Search, UserCheck, Trash2, Shield } from "lucide-react";

interface PlatformUser {
  id: string;
  email: string;
  full_name: string | null;
  approved: boolean;
  created_at: string;
  roles: { role: string; business_name: string | null }[];
}

export default function MasterUsersPage() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const load = async () => {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name, approved, created_at")
      .order("created_at", { ascending: false });

    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role, business_id");

    const { data: businesses } = await supabase
      .from("businesses")
      .select("id, name");

    const bizMap = new Map((businesses || []).map(b => [b.id, b.name]));

    const userRolesMap = new Map<string, { role: string; business_name: string | null }[]>();
    (roles || []).forEach(r => {
      if (!userRolesMap.has(r.user_id)) userRolesMap.set(r.user_id, []);
      userRolesMap.get(r.user_id)!.push({
        role: r.role,
        business_name: r.business_id ? bizMap.get(r.business_id) || "Unknown" : null,
      });
    });

    setUsers(
      (profiles || []).map(p => ({
        ...p,
        roles: userRolesMap.get(p.id) || [],
      }))
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleApproval = async (user: PlatformUser) => {
    setActionLoading(prev => new Set(prev).add(user.id));
    const { error } = await supabase
      .from("profiles")
      .update({ approved: !user.approved })
      .eq("id", user.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: user.approved ? "User unapproved" : "User approved" });
      load();
    }
    setActionLoading(prev => { const s = new Set(prev); s.delete(user.id); return s; });
  };

  const deleteUser = async (user: PlatformUser) => {
    if (!confirm(`⚠️ Permanently delete user "${user.email}"? This will remove all their roles and profile data. This cannot be undone!`)) return;
    setActionLoading(prev => new Set(prev).add(user.id));

    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { user_id: user.id },
    });

    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message || "Failed to delete user", variant: "destructive" });
    } else {
      toast({ title: "User deleted", description: `${user.email} has been removed.` });
      load();
    }
    setActionLoading(prev => { const s = new Set(prev); s.delete(user.id); return s; });
  };

  const filtered = users.filter(
    u => u.email.toLowerCase().includes(search.toLowerCase()) ||
         (u.full_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const pendingCount = users.filter(u => !u.approved).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Users</h1>
        <p className="text-muted-foreground">Manage all users across the platform</p>
      </div>

      {pendingCount > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="py-3 px-4 flex items-center gap-2 text-sm text-amber-500">
            <UserCheck className="h-4 w-4" />
            <span className="font-medium">{pendingCount} pending approval{pendingCount > 1 ? "s" : ""}</span>
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">All Users ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No users found</TableCell>
                  </TableRow>
                ) : filtered.map(user => (
                  <TableRow key={user.id} className={!user.approved ? "bg-amber-500/5" : ""}>
                    <TableCell className="font-medium">{user.full_name || "—"}</TableCell>
                    <TableCell className="text-sm">{user.email}</TableCell>
                    <TableCell>
                      <Badge className={user.approved ? "bg-green-500/20 text-green-500" : "bg-amber-500/20 text-amber-500"}>
                        {user.approved ? "Approved" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">No roles</span>
                        ) : user.roles.map((r, i) => (
                          <Badge key={i} variant={r.role === "master" ? "default" : "outline"} className="text-xs">
                            {r.role === "master" ? (
                              <><Shield className="h-3 w-3 mr-1" />Master</>
                            ) : (
                              `${r.role}${r.business_name ? ` @ ${r.business_name.length > 15 ? r.business_name.slice(0, 15) + "…" : r.business_name}` : ""}`
                            )}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => toggleApproval(user)} disabled={actionLoading.has(user.id)}>
                        <UserCheck className="h-4 w-4 mr-1" />
                        {user.approved ? "Unapprove" : "Approve"}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteUser(user)} disabled={actionLoading.has(user.id)}>
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
