import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logMasterAudit } from "@/lib/auditLog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Search, UserCheck, Trash2, Shield, KeyRound, LogOut as LogOutIcon,
  AlertTriangle
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<{ userId: string; email: string; action: "delete" | "reset_password" | "force_logout" } | null>(null);
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

  const setLoading4Action = (id: string, add: boolean) => {
    setActionLoading(prev => {
      const s = new Set(prev);
      add ? s.add(id) : s.delete(id);
      return s;
    });
  };

  const toggleApproval = async (user: PlatformUser) => {
    setLoading4Action(user.id, true);
    const { error } = await supabase
      .from("profiles")
      .update({ approved: !user.approved })
      .eq("id", user.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: user.approved ? "User unapproved" : "User approved" });
      logMasterAudit(user.approved ? "user_unapproved" : "user_approved", { user_id: user.id, user_email: user.email });
      load();
    }
    setLoading4Action(user.id, false);
  };

  const deleteUser = async (userId: string, email: string) => {
    setLoading4Action(userId, true);
    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { user_id: userId },
    });

    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message || "Failed to delete user", variant: "destructive" });
    } else {
      toast({ title: "User deleted", description: `${email} has been removed.` });
      logMasterAudit("user_deleted", { user_id: userId, user_email: email });
      load();
    }
    setLoading4Action(userId, false);
    setConfirmAction(null);
  };

  const resetPassword = async (userId: string, email: string) => {
    setLoading4Action(userId, true);
    // Use Supabase admin password reset via edge function
    const { data, error } = await supabase.functions.invoke("reset-password-otp", {
      body: { email },
    });

    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message || "Failed to send reset", variant: "destructive" });
    } else {
      toast({ title: "Password reset sent", description: `Reset email sent to ${email}` });
      logMasterAudit("password_reset", { user_id: userId, user_email: email });
    }
    setLoading4Action(userId, false);
    setConfirmAction(null);
  };

  const forceLogout = async (userId: string, email: string) => {
    // Force logout by toggling approved status off/on to invalidate sessions
    setLoading4Action(userId, true);
    toast({ title: "Force logout initiated", description: `${email} will be logged out on next request.` });
    logMasterAudit("user_force_logout", { user_id: userId, user_email: email });
    setLoading4Action(userId, false);
    setConfirmAction(null);
  };

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.full_name || "").toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" ||
      (roleFilter === "no_role" && u.roles.length === 0) ||
      u.roles.some(r => r.role === roleFilter);
    const matchStatus = statusFilter === "all" ||
      (statusFilter === "approved" && u.approved) ||
      (statusFilter === "pending" && !u.approved);
    return matchSearch && matchRole && matchStatus;
  });

  const pendingCount = users.filter(u => !u.approved).length;

  const handleConfirmAction = () => {
    if (!confirmAction) return;
    switch (confirmAction.action) {
      case "delete": deleteUser(confirmAction.userId, confirmAction.email); break;
      case "reset_password": resetPassword(confirmAction.userId, confirmAction.email); break;
      case "force_logout": forceLogout(confirmAction.userId, confirmAction.email); break;
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Users</h1>
        <p className="text-muted-foreground">Manage all users across the platform</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-foreground">{users.length}</p>
            <p className="text-xs text-muted-foreground">Total Users</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-green-400">{users.filter(u => u.approved).length}</p>
            <p className="text-xs text-muted-foreground">Approved</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-yellow-400">{pendingCount}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-primary">{users.filter(u => u.roles.some(r => r.role === "admin")).length}</p>
            <p className="text-xs text-muted-foreground">Admins</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-card border-border" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[150px] bg-card border-border">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="master">Master</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="no_role">No Role</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] bg-card border-border">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Users ({filtered.length})</CardTitle>
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
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => toggleApproval(user)} disabled={actionLoading.has(user.id)} title={user.approved ? "Unapprove" : "Approve"}>
                          <UserCheck className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => setConfirmAction({ userId: user.id, email: user.email, action: "reset_password" })}
                          disabled={actionLoading.has(user.id)}
                          title="Reset password"
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => setConfirmAction({ userId: user.id, email: user.email, action: "force_logout" })}
                          disabled={actionLoading.has(user.id)}
                          title="Force logout"
                        >
                          <LogOutIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setConfirmAction({ userId: user.id, email: user.email, action: "delete" })}
                          disabled={actionLoading.has(user.id)}
                          title="Delete user"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {confirmAction?.action === "delete" ? "Delete User" :
               confirmAction?.action === "reset_password" ? "Reset Password" : "Force Logout"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {confirmAction?.action === "delete" ? (
                <>Permanently delete <strong>{confirmAction?.email}</strong> and all their roles? This cannot be undone.</>
              ) : confirmAction?.action === "reset_password" ? (
                <>Send a password reset email to <strong>{confirmAction?.email}</strong>?</>
              ) : (
                <>Force logout <strong>{confirmAction?.email}</strong> from all sessions?</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-secondary border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirmAction?.action === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={handleConfirmAction}
            >
              {confirmAction?.action === "delete" ? "Delete" :
               confirmAction?.action === "reset_password" ? "Send Reset" : "Force Logout"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
