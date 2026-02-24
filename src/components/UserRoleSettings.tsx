import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, ShieldCheck, Plus, Minus } from "lucide-react";
import { toast } from "sonner";

type UserWithRoles = {
  id: string;
  user_id: string;
  full_name: string;
  roles: ("admin" | "engineer")[];
};

export default function UserRoleSettings() {
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

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
                          disabled={toggling === `${u.user_id}-admin`}
                          onClick={() => toggleRole(u.user_id, "admin", isAdmin)}
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
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
