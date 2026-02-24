import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, ShieldCheck, Plus, Minus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog as DeleteDialog, AlertDialogAction as DeleteAction, AlertDialogCancel as DeleteCancel, AlertDialogContent as DeleteContent, AlertDialogDescription as DeleteDesc, AlertDialogFooter as DeleteFoot, AlertDialogHeader as DeleteHead, AlertDialogTitle as DeleteTitle } from "@/components/ui/alert-dialog";

type UserWithRoles = {
  id: string;
  user_id: string;
  full_name: string;
  roles: ("admin" | "engineer")[];
};

export default function UserRoleSettings() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ userId: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = async () => {
    const [profilesRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("id, user_id, full_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);

    const roleMap: Record<string, ("admin" | "engineer")[]> = {};
    (rolesRes.data ?? []).forEach((r) => {
      if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
      roleMap[r.user_id].push(r.role);
    });

    const merged = (profilesRes.data ?? []).map((p) => ({
      ...p,
      roles: roleMap[p.user_id] ?? [],
    }));

    merged.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    setUsers(merged);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const toggleRole = async (userId: string, role: "admin" | "engineer", hasRole: boolean) => {
    setToggling(`${userId}-${role}`);
    if (hasRole) {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role);
      if (error) {
        toast.error("Failed to remove role");
      } else {
        toast.success(`${role} role removed`);
        fetchUsers();
      }
    } else {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role });
      if (error) {
        toast.error("Failed to add role");
      } else {
        toast.success(`${role} role added`);
        fetchUsers();
      }
    }
    setToggling(null);
  };

  const handleDeleteUser = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { user_id: confirmDelete.userId },
    });
    setDeleting(false);
    if (error || data?.error) {
      toast.error(data?.error || "Failed to delete user");
    } else {
      toast.success(`${confirmDelete.name} has been deleted`);
      setConfirmDelete(null);
      fetchUsers();
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-accent" />
          <CardTitle className="text-lg">User Roles</CardTitle>
        </div>
        <CardDescription>
          Manage admin and engineer roles for all users.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Current Roles</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">No users found.</TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const isAdmin = u.roles.includes("admin");
                const isEngineer = u.roles.includes("engineer");
                const isSelf = u.user_id === user?.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1.5">
                        {isAdmin && <Badge variant="default" className="gap-1"><ShieldCheck className="h-3 w-3" />Admin</Badge>}
                        {isEngineer && <Badge variant="secondary">Engineer</Badge>}
                        {!isAdmin && !isEngineer && <span className="text-xs text-muted-foreground">No role</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant={isAdmin ? "destructive" : "outline"}
                          size="sm"
                          disabled={toggling === `${u.user_id}-admin` || (isAdmin && isSelf)}
                          title={isAdmin && isSelf ? "You cannot remove your own admin role" : undefined}
                          onClick={() => {
                            if (isAdmin) {
                              setConfirmRemove({ userId: u.user_id, name: u.full_name || "this user" });
                            } else {
                              toggleRole(u.user_id, "admin", false);
                            }
                          }}
                        >
                          {isAdmin ? <Minus className="mr-1 h-3 w-3" /> : <Plus className="mr-1 h-3 w-3" />}
                          Admin
                        </Button>
                        <Button
                          variant={isEngineer ? "destructive" : "outline"}
                          size="sm"
                          disabled={toggling === `${u.user_id}-engineer`}
                          onClick={() => toggleRole(u.user_id, "engineer", isEngineer)}
                        >
                          {isEngineer ? <Minus className="mr-1 h-3 w-3" /> : <Plus className="mr-1 h-3 w-3" />}
                          Engineer
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          disabled={isSelf}
                          title={isSelf ? "You cannot delete your own account" : "Delete user"}
                          onClick={() => setConfirmDelete({ userId: u.user_id, name: u.full_name || "this user" })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>

      <AlertDialog open={!!confirmRemove} onOpenChange={(open) => { if (!open) setConfirmRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Admin Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove admin access from <strong>{confirmRemove?.name}</strong>? They will no longer be able to manage jobs, engineers, or settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmRemove) {
                  toggleRole(confirmRemove.userId, "admin", true);
                  setConfirmRemove(null);
                }
              }}
            >
              Remove Admin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeleteDialog open={!!confirmDelete} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
        <DeleteContent>
          <DeleteHead>
            <DeleteTitle>Delete User</DeleteTitle>
            <DeleteDesc>
              Are you sure you want to permanently delete <strong>{confirmDelete?.name}</strong>? This will remove their account, profile, and all role assignments. This action cannot be undone.
            </DeleteDesc>
          </DeleteHead>
          <DeleteFoot>
            <DeleteCancel disabled={deleting}>Cancel</DeleteCancel>
            <DeleteAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                handleDeleteUser();
              }}
            >
              {deleting ? "Deleting…" : "Delete User"}
            </DeleteAction>
          </DeleteFoot>
        </DeleteContent>
      </DeleteDialog>
    </Card>
  );
}
