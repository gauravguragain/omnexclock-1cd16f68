import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserCheck, UserX, Shield, ShieldOff, Search, Eye, EyeOff, CalendarRange, X, Mail, Plus, Crown, Loader2, BriefcaseBusiness, ShieldPlus } from "lucide-react";
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
  has_super_admin_role: boolean;
  has_admin_role: boolean;
  has_viewer_role: boolean;
  has_roster_admin_role: boolean;
  has_sales_manager_role: boolean;
  has_food_safety_role: boolean;
  roles: string[];
  roster_admin_departments: string[];
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  departments: string[] | null;
  status: string;
  created_at: string;
  expires_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  viewer: "View Only",
  roster_admin: "Roster Admin",
  sales_marketing_manager: "Sales & Marketing",
  food_safety_manager: "Food Safety",
};

export default function UsersPage() {
  const { isViewerOf, isAdminOf, isSuperAdminOf } = useAuth();
  const { business } = useBusiness();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());

  // Role assignment dialog state
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  type ManagedRole = "super_admin" | "admin" | "viewer" | "roster_admin" | "sales_marketing_manager" | "food_safety_manager";
  const [selectedRoles, setSelectedRoles] = useState<ManagedRole[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);
  const [roleSaving, setRoleSaving] = useState(false);

  // Invite dialog state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ManagedRole>("admin");
  const [inviteDepartments, setInviteDepartments] = useState<string[]>([]);
  const [inviteSending, setInviteSending] = useState(false);

  const businessId = business?.id || "";
  const isViewer = isViewerOf(businessId) && !isAdminOf(businessId);
  const isSuperAdmin = isSuperAdminOf(businessId);

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
    const superAdminUserIds = new Set(roles.filter(r => r.role === "super_admin").map(r => r.user_id));
    const adminUserIds = new Set(roles.filter(r => r.role === "admin").map(r => r.user_id));
    const viewerUserIds = new Set(roles.filter(r => r.role === "viewer").map(r => r.user_id));
    const salesManagerUserIds = new Set(roles.filter(r => r.role === "sales_marketing_manager").map(r => r.user_id));
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
        has_super_admin_role: superAdminUserIds.has(p.id),
        has_admin_role: adminUserIds.has(p.id),
        has_viewer_role: viewerUserIds.has(p.id),
        has_roster_admin_role: rosterAdminMap.has(p.id),
        has_sales_manager_role: salesManagerUserIds.has(p.id),
        has_food_safety_role: roles.some(r => r.user_id === p.id && (r.role as string) === "food_safety_manager"),
        roles: roles.filter(r => r.user_id === p.id).map(r => r.role as string),
        roster_admin_departments: rosterAdminMap.get(p.id) || [],
      }))
    );
    setLoading(false);
  };

  const fetchInvitations = async () => {
    if (!businessId) return;
    const { data } = await supabase
      .from("admin_invitations")
      .select("*")
      .eq("business_id", businessId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setInvitations((data as Invitation[]) || []);
  };

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

  useEffect(() => { fetchUsers(); fetchInvitations(); fetchDepartments(); }, [businessId]);

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
    setSelectedRoles(user.roles.filter(r => ROLE_LABELS[r]) as ManagedRole[]);
    setSelectedDepartments(user.roster_admin_departments);
    setRoleDialogOpen(true);
  };

  const saveRole = async () => {
    if (!selectedUser) return;
    setRoleSaving(true);

    try {
      if (selectedRoles.length === 0) {
        toast({ title: "Pick at least one role", description: "Use Remove to take someone out of this business.", variant: "destructive" });
        setRoleSaving(false);
        return;
      }
      if (selectedRoles.includes("roster_admin") && selectedDepartments.length === 0) {
        toast({ title: "Select departments", description: "Roster Admin must have at least one department assigned.", variant: "destructive" });
        setRoleSaving(false);
        return;
      }
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", selectedUser.id).eq("business_id", businessId);
      if (delErr) throw delErr;
      const rows = selectedRoles.map(role => ({
        user_id: selectedUser.id, role: role as any, business_id: businessId,
        ...(role === "roster_admin" ? { departments: selectedDepartments } : {}),
      }));
      const { error: insErr } = await supabase.from("user_roles").insert(rows as any);
      if (insErr) throw insErr;
      await logAudit("roles_updated", { user_id: selectedUser.id, email: selectedUser.email, roles: selectedRoles, departments: selectedRoles.includes("roster_admin") ? selectedDepartments : undefined, business_id: businessId });
      logMasterAudit("role_changed", { user_email: selectedUser.email, business_name: business?.name, roles: selectedRoles, action: "granted" });
      toast({ title: "Access updated", description: `${selectedUser.email}: ${selectedRoles.map(r => ROLE_LABELS[r]).join(", ")}.` });
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

  const toggleInviteDepartment = (dept: string) => {
    setInviteDepartments(prev =>
      prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
    );
  };

  const sendInvitation = async () => {
    if (!inviteEmail.trim() || !businessId) return;
    setInviteSending(true);

    try {
      if (inviteRole === "roster_admin" && inviteDepartments.length === 0) {
        toast({ title: "Select departments", description: "Roster Admin must have at least one department assigned.", variant: "destructive" });
        setInviteSending(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("invite-admin", {
        body: {
          email: inviteEmail.trim(),
          role: inviteRole,
          businessId,
          departments: inviteRole === "roster_admin" ? inviteDepartments : null,
          appUrl: "https://omnexclock.lovable.app",
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await logAudit("admin_invited", { email: inviteEmail.trim(), role: inviteRole, business_id: businessId });
      toast({ title: "Invitation sent!", description: `Invitation email sent to ${inviteEmail.trim()}.` });
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("admin");
      setInviteDepartments([]);
      fetchInvitations();
    } catch (err: any) {
      toast({ title: "Error sending invitation", description: err.message, variant: "destructive" });
    }

    setInviteSending(false);
  };

  const cancelInvitation = async (id: string) => {
    const { error } = await supabase
      .from("admin_invitations")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Invitation cancelled" });
      fetchInvitations();
    }
  };

  const getRoleBadge = (user: UserProfile) => {
    const list = user.roles.filter(r => ROLE_LABELS[r]);
    if (list.length === 0) return <Badge variant="secondary">No Role</Badge>;
    return (
      <div className="flex flex-wrap gap-1">
        {list.map(r => (
          <Badge key={r} className={r === "super_admin" || r === "admin" ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary"}>
            {r === "super_admin" && <Crown className="h-3 w-3 mr-1" />}{ROLE_LABELS[r]}
          </Badge>
        ))}
        {user.has_roster_admin_role && user.roster_admin_departments.map(d => (
          <Badge key={d} variant="outline" className="text-[9px] px-1 py-0">{d}</Badge>
        ))}
      </div>
    );
  };

  const filtered = users.filter(
    (u) =>
      (u.email?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (u.full_name?.toLowerCase() || "").includes(search.toLowerCase())
  );

  const pendingCount = users.filter((u) => !u.approved).length;

  const RoleSelector = ({
    selected,
    onChange,
    departments: depts,
    onToggleDept,
  }: {
    selected: string[];
    onChange: (v: ManagedRole) => void;
    departments: string[];
    onToggleDept: (d: string) => void;
  }) => (
    <div className="space-y-2">
      {/* Super Admin */}
      <button
        type="button"
        onClick={() => onChange("super_admin")}
        className={`w-full text-left rounded-lg border p-3 transition-all ${
          selected.includes("super_admin")
            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
            : "border-border hover:border-muted-foreground/30"
        }`}
      >
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">Super Admin</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Full access to all features including user management, invitations, and role assignments.
        </p>
      </button>

      {/* Admin */}
      <button
        type="button"
        onClick={() => onChange("admin")}
        className={`w-full text-left rounded-lg border p-3 transition-all ${
          selected.includes("admin")
            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
            : "border-border hover:border-muted-foreground/30"
        }`}
      >
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">Admin</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Full access to employees, roster, timesheets, payroll, reports, and settings. Cannot manage users or invite admins.
        </p>
      </button>

      {/* View Only */}
      <button
        type="button"
        onClick={() => onChange("viewer")}
        className={`w-full text-left rounded-lg border p-3 transition-all ${
          selected.includes("viewer")
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
        onClick={() => onChange("roster_admin")}
        className={`w-full text-left rounded-lg border p-3 transition-all ${
          selected.includes("roster_admin")
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

      <button
        type="button"
        onClick={() => onChange("sales_marketing_manager")}
        className={`w-full text-left rounded-lg border p-3 transition-all ${
          selected.includes("sales_marketing_manager")
            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
            : "border-border hover:border-muted-foreground/30"
        }`}
      >
        <div className="flex items-center gap-2">
          <BriefcaseBusiness className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">Sales & Marketing Manager</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Full access to leads, inspections, menus, bookings, tasks, and the shared sales pipeline.
        </p>
      </button>

      <button
        type="button"
        onClick={() => onChange("food_safety_manager")}
        className={`w-full text-left rounded-lg border p-3 transition-all ${
          selected.includes("food_safety_manager")
            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
            : "border-border hover:border-muted-foreground/30"
        }`}
      >
        <div className="flex items-center gap-2">
          <ShieldPlus className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">Food Safety Manager</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Only the Food Safety Logs: fridge and temperature records, cleaning, receiving, forms, exports and alerts.
        </p>
      </button>

      {/* Department Selection (for Roster Admin) */}
      {selected.includes("roster_admin") && (
        <div className="space-y-2 pt-1">
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
                    depts.includes(dept)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <Checkbox
                    checked={depts.includes(dept)}
                    onCheckedChange={() => onToggleDept(dept)}
                  />
                  <span className="text-foreground">{dept}</span>
                </label>
              ))}
            </div>
          )}
          {depts.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              <span className="text-xs text-muted-foreground">Selected:</span>
              {depts.map(d => (
                <Badge key={d} variant="secondary" className="text-xs gap-1">
                  {d}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => onToggleDept(d)} />
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

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
        {isSuperAdmin && (
          <Button onClick={() => setInviteDialogOpen(true)} className="gap-2">
            <Mail className="h-4 w-4" />
            Invite Admin
          </Button>
        )}
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Mail className="h-4 w-4" /> Pending Invitations
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell className="text-sm">{inv.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {inv.role === "super_admin" ? "Super Admin" : inv.role === "roster_admin" ? "Roster Admin" : inv.role === "sales_marketing_manager" ? "Sales & Marketing Manager" : inv.role === "food_safety_manager" ? "Food Safety Manager" : inv.role === "admin" ? "Admin" : "Viewer"}
                        </Badge>
                        {inv.departments && inv.departments.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-1">
                            {inv.departments.map(d => (
                              <Badge key={d} variant="outline" className="text-[9px] px-1 py-0">{d}</Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(inv.expires_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive text-xs" onClick={() => cancelInvitation(inv.id)}>
                          Cancel
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

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
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Manage Access — {selectedUser?.full_name || selectedUser?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Tap to add or remove roles. One person can have several.</p>
            <RoleSelector
              selected={selectedRoles}
              onChange={r => setSelectedRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])}
              departments={selectedDepartments}
              onToggleDept={toggleDepartment}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveRole} disabled={roleSaving}>
              {roleSaving ? "Saving..." : "Save Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Admin Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Mail className="h-5 w-5" /> Invite Admin
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Send an invitation email with a signup link and role-specific induction guide.
            </p>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">Select Role</Label>
              <RoleSelector
                selected={[inviteRole]}
                onChange={setInviteRole}
                departments={inviteDepartments}
                onToggleDept={toggleInviteDepartment}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>Cancel</Button>
            <Button onClick={sendInvitation} disabled={inviteSending || !inviteEmail.trim()}>
              {inviteSending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sending...</> : <><Mail className="h-4 w-4 mr-1" /> Send Invitation</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
