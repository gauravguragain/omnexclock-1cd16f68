import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserCheck, UserX, Shield, ShieldOff, Search, Eye, EyeOff, CalendarRange, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { logAudit, logMasterAudit } from "@/lib/auditLog";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  approved: boolean;
  created_at: string;
  has_admin_role: boolean;
  has_viewer_role: boolean;
  has_roster_admin_role: boolean;
  roster_admin_departments: string[];
}

export default function UsersPage() {
  const { isViewerOf, isAdminOf } = useAuth();
  const { business } = useBusiness();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());

  // Role assignment dialog state
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedRole, setSelectedRole] = useState<"admin" | "viewer" | "roster_admin">("admin");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);
  const [roleSaving, setRoleSaving] = useState(false);

  const businessId = business?.id || "";
  const isViewer = isViewerOf(businessId) && !isAdminOf(businessId);

  const fetchUsers = async () => {
    if (!businessId) { setLoading(false); return; }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role, departments")
      .eq("business_id", businessId);

    if (!roles || roles.length === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }

    const userIds = [...new Set(roles.map(r => r.user_id))];
    const adminUserIds = new Set(roles.filter(r => r.role === "admin").map(r => r.user_id));
    const viewerUserIds = new Set(roles.filter(r => r.role === "viewer").map(r => r.user_id));
    const rosterAdminMap = new Map<string, string[]>();
    roles.filter(r => r.role === "roster_admin").forEach(r => {
      rosterAdminMap.set(r.user_id, (r as any).departments || []);
    });

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, approved, created_at")
      .in("id", userIds)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: "Failed to load users", variant: "destructive" });
      setLoading(false);
      return;
    }

    setUsers(
      (profiles || []).map((p) => ({
        ...p,
        has_admin_role: adminUserIds.has(p.id),
        has_viewer_role: viewerUserIds.has(p.id),
        has_roster_admin_role: rosterAdminMap.has(p.id),
        roster_admin_departments: rosterAdminMap.get(p.id) || [],
      }))
    );
    setLoading(false);
  };

  // Fetch available departments from employees
  const fetchDepartments = async () => {
    if (!businessId) return;
    const { data } = await supabase
      .from("employees")
      .select("department")
      .eq("business_id", businessId)
      .eq("active", true)
      .not("department", "is", null);
    const depts = [...new Set((data || []).map(e => e.department).filter(Boolean))] as string[];
    depts.sort();
    setAvailableDepartments(depts);
  };

  useEffect(() => { fetchUsers(); fetchDepartments(); }, [businessId]);

  const revokeAndDelete = async (user: UserProfile) => {
    if (!confirm(`Remove ${user.email} from this business? This will revoke their roles for this business only.`)) return;
    setActionLoading((prev) => new Set(prev).add(user.id));

    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", user.id)
      .eq("business_id", businessId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await logAudit("user_removed_from_business", { user_id: user.id, email: user.email, business_id: businessId });
      logMasterAudit("user_removed_from_business", { user_email: user.email, business_name: business?.name, business_id: businessId });
      toast({ title: "User removed", description: `${user.email} has been removed from this business.` });
      fetchUsers();
    }

    setActionLoading((prev) => {
      const s = new Set(prev);
      s.delete(user.id);
      return s;
    });
  };

  const approveUser = async (user: UserProfile) => {
    setActionLoading((prev) => new Set(prev).add(user.id));
    const { error } = await supabase
      .from("profiles")
      .update({ approved: true })
      .eq("id", user.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await logAudit("user_approved", { user_id: user.id, email: user.email });
      toast({ title: "User Approved" });
      fetchUsers();
    }
    setActionLoading((prev) => {
      const s = new Set(prev);
      s.delete(user.id);
      return s;
    });
  };

  const openRoleDialog = (user: UserProfile) => {
    setSelectedUser(user);
    // Determine current role
    if (user.has_admin_role) {
      setSelectedRole("admin");
    } else if (user.has_roster_admin_role) {
      setSelectedRole("roster_admin");
      setSelectedDepartments(user.roster_admin_departments);
    } else if (user.has_viewer_role) {
      setSelectedRole("viewer");
    } else {
      setSelectedRole("viewer");
    }
    setRoleDialogOpen(true);
  };

  const saveRole = async () => {
    if (!selectedUser) return;
    setRoleSaving(true);

    try {
      // Remove all existing roles for this user in this business
      await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", selectedUser.id)
        .eq("business_id", businessId);

      // Insert the new role
      if (selectedRole === "admin") {
        await supabase.from("user_roles").insert({ user_id: selectedUser.id, role: "admin" as any, business_id: businessId });
        await logAudit("admin_role_granted", { user_id: selectedUser.id, email: selectedUser.email, role: "admin", business_id: businessId });
      } else if (selectedRole === "viewer") {
        await supabase.from("user_roles").insert({ user_id: selectedUser.id, role: "viewer" as any, business_id: businessId });
        await logAudit("viewer_role_granted", { user_id: selectedUser.id, email: selectedUser.email, role: "viewer", business_id: businessId });
      } else if (selectedRole === "roster_admin") {
        if (selectedDepartments.length === 0) {
          toast({ title: "Select departments", description: "Roster Admin must have at least one department assigned.", variant: "destructive" });
          setRoleSaving(false);
          return;
        }
        await supabase.from("user_roles").insert({
          user_id: selectedUser.id,
          role: "roster_admin" as any,
          business_id: businessId,
          departments: selectedDepartments,
        });
        await logAudit("roster_admin_role_granted", {
          user_id: selectedUser.id,
          email: selectedUser.email,
          role: "roster_admin",
          departments: selectedDepartments,
          business_id: businessId,
        });
      }

      logMasterAudit("role_changed", {
        user_email: selectedUser.email,
        business_name: business?.name,
        role: selectedRole,
        departments: selectedRole === "roster_admin" ? selectedDepartments : undefined,
        action: "granted",
      });

      toast({ title: "Role updated", description: `${selectedUser.email} is now ${selectedRole === "admin" ? "Full Admin" : selectedRole === "viewer" ? "View Only" : "Roster Admin"}.` });
      setRoleDialogOpen(false);
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }

    setRoleSaving(false);
  };

  const toggleDepartment = (dept: string) => {
    setSelectedDepartments(prev =>
      prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
    );
  };

  const getRoleBadge = (user: UserProfile) => {
    if (user.has_admin_role) return <Badge className="bg-primary/20 text-primary">Full Admin</Badge>;
    if (user.has_roster_admin_role) return (
      <div className="flex flex-col gap-1">
        <Badge className="bg-accent/20 text-accent-foreground">Roster Admin</Badge>
        {user.roster_admin_departments.length > 0 && (
          <div className="flex flex-wrap gap-0.5">
            {user.roster_admin_departments.map(d => (
              <Badge key={d} variant="outline" className="text-[9px] px-1 py-0">{d}</Badge>
            ))}
          </div>
        )}
      </div>
    );
    if (user.has_viewer_role) return <Badge variant="outline" className="text-primary border-primary/30">View Only</Badge>;
    return <Badge variant="secondary">No Role</Badge>;
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
          <CardTitle className="text-base">User Management — {business?.name}</CardTitle>
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
                  <TableHead>Access Level</TableHead>
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
                      No users found for this business
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
                      <TableCell>{getRoleBadge(user)}</TableCell>
                      <TableCell className="text-right space-x-1">
                        {isViewer ? (
                          <span className="text-xs text-muted-foreground">View only</span>
                        ) : (
                          <div className="flex flex-wrap justify-end gap-1">
                            {!user.approved && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => approveUser(user)}
                                disabled={actionLoading.has(user.id)}
                                title="Approve user"
                              >
                                <UserCheck className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openRoleDialog(user)}
                              disabled={actionLoading.has(user.id)}
                              title="Manage access"
                            >
                              <Shield className="h-4 w-4 mr-1" />
                              Manage Access
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => revokeAndDelete(user)}
                              disabled={actionLoading.has(user.id)}
                              title="Remove from business"
                              className="text-destructive hover:text-destructive"
                            >
                              <UserX className="h-4 w-4 mr-1" />
                              Remove
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Role Assignment Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Manage Access — {selectedUser?.full_name || selectedUser?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Select the access level for this user:</p>

            {/* Role Selection */}
            <div className="space-y-2">
              {/* Full Admin */}
              <button
                type="button"
                onClick={() => setSelectedRole("admin")}
                className={`w-full text-left rounded-lg border p-3 transition-all ${
                  selectedRole === "admin"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm text-foreground">Full Admin</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Complete access to all features: employees, roster, timesheets, payroll, reports, settings, and user management.
                </p>
              </button>

              {/* View Only */}
              <button
                type="button"
                onClick={() => setSelectedRole("viewer")}
                className={`w-full text-left rounded-lg border p-3 transition-all ${
                  selectedRole === "viewer"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm text-foreground">View Only</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Can view all data (dashboard, employees, roster, timesheets, etc.) but cannot edit anything.
                </p>
              </button>

              {/* Roster Admin */}
              <button
                type="button"
                onClick={() => setSelectedRole("roster_admin")}
                className={`w-full text-left rounded-lg border p-3 transition-all ${
                  selectedRole === "roster_admin"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-accent-foreground" />
                  <span className="font-semibold text-sm text-foreground">Roster Admin</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Can view, edit, publish rosters and manage timesheets — restricted to assigned departments only.
                </p>
              </button>
            </div>

            {/* Department Selection (for Roster Admin) */}
            {selectedRole === "roster_admin" && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Assign Departments</Label>
                {availableDepartments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No departments found. Assign departments to employees first.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {availableDepartments.map(dept => (
                      <label
                        key={dept}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-all text-sm ${
                          selectedDepartments.includes(dept)
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground/30"
                        }`}
                      >
                        <Checkbox
                          checked={selectedDepartments.includes(dept)}
                          onCheckedChange={() => toggleDepartment(dept)}
                        />
                        <span className="text-foreground">{dept}</span>
                      </label>
                    ))}
                  </div>
                )}
                {selectedDepartments.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    <span className="text-xs text-muted-foreground">Selected:</span>
                    {selectedDepartments.map(d => (
                      <Badge key={d} variant="secondary" className="text-xs gap-1">
                        {d}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => toggleDepartment(d)} />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveRole} disabled={roleSaving}>
              {roleSaving ? "Saving..." : "Save Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
