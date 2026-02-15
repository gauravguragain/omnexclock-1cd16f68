import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserCheck, UserX, Shield, ShieldOff, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { logAudit } from "@/lib/auditLog";

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  approved: boolean;
  created_at: string;
  has_admin_role: boolean;
}

export default function UsersPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());

  const fetchUsers = async () => {
    // Get profiles
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, approved, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: "Failed to load users", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Get user roles
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role");

    const adminUserIds = new Set(
      (roles || []).filter((r) => r.role === "admin").map((r) => r.user_id)
    );

    setUsers(
      (profiles || []).map((p) => ({
        ...p,
        has_admin_role: adminUserIds.has(p.id),
      }))
    );
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const toggleApproval = async (user: UserProfile) => {
    setActionLoading((prev) => new Set(prev).add(user.id));
    const newApproved = !user.approved;
    const { error } = await supabase
      .from("profiles")
      .update({ approved: newApproved })
      .eq("id", user.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await logAudit(newApproved ? "user_approved" : "user_revoked", {
        user_id: user.id,
        email: user.email,
      });
      toast({ title: newApproved ? "User Approved" : "Access Revoked" });
      fetchUsers();
    }
    setActionLoading((prev) => {
      const s = new Set(prev);
      s.delete(user.id);
      return s;
    });
  };

  const toggleAdminRole = async (user: UserProfile) => {
    setActionLoading((prev) => new Set(prev).add(user.id));

    if (user.has_admin_role) {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", user.id)
        .eq("role", "admin");
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        await logAudit("admin_role_removed", { user_id: user.id, email: user.email });
        toast({ title: "Admin role removed" });
        fetchUsers();
      }
    } else {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: user.id, role: "admin" });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        await logAudit("admin_role_granted", { user_id: user.id, email: user.email });
        toast({ title: "Admin role granted" });
        fetchUsers();
      }
    }

    setActionLoading((prev) => {
      const s = new Set(prev);
      s.delete(user.id);
      return s;
    });
  };

  const filtered = users.filter(
    (u) =>
      (u.email?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (u.full_name?.toLowerCase() || "").includes(search.toLowerCase())
  );

  const pendingCount = users.filter((u) => !u.approved).length;

  return (
    <div className="space-y-4">
      {pendingCount > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="py-3 px-4 flex items-center gap-2 text-sm text-warning">
            <UserCheck className="h-4 w-4" />
            <span className="font-medium">{pendingCount} pending approval{pendingCount > 1 ? "s" : ""}</span>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">User Management</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Signed Up</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((user) => (
                    <TableRow key={user.id} className={!user.approved ? "bg-warning/5" : ""}>
                      <TableCell className="font-medium">
                        {user.full_name || "—"}
                      </TableCell>
                      <TableCell className="text-sm">{user.email}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            user.approved
                              ? "bg-success/20 text-success"
                              : "bg-warning/20 text-warning"
                          }
                        >
                          {user.approved ? "Approved" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.has_admin_role ? "default" : "secondary"}
                        >
                          {user.has_admin_role ? "Admin" : "User"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleApproval(user)}
                          disabled={actionLoading.has(user.id)}
                          title={user.approved ? "Revoke access" : "Approve user"}
                        >
                          {user.approved ? (
                            <UserX className="h-4 w-4 mr-1" />
                          ) : (
                            <UserCheck className="h-4 w-4 mr-1" />
                          )}
                          {user.approved ? "Revoke" : "Approve"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleAdminRole(user)}
                          disabled={actionLoading.has(user.id)}
                          title={user.has_admin_role ? "Remove admin" : "Make admin"}
                        >
                          {user.has_admin_role ? (
                            <ShieldOff className="h-4 w-4 mr-1" />
                          ) : (
                            <Shield className="h-4 w-4 mr-1" />
                          )}
                          {user.has_admin_role ? "Remove Admin" : "Make Admin"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
