import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { UserPlus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Engineer = { user_id: string; full_name: string; whatsapp_number: string | null };
type Assignment = { id: string; engineer_id: string; assigned_at: string; profile?: Engineer };

export default function EngineerAssignments({ jobId }: { jobId: string }) {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [allEngineers, setAllEngineers] = useState<Engineer[]>([]);
  const [selectedEngineerId, setSelectedEngineerId] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchAssignments = async () => {
    const { data } = await supabase
      .from("job_assignments")
      .select("id, engineer_id, assigned_at")
      .eq("job_id", jobId);

    if (!data || data.length === 0) {
      setAssignments([]);
      return;
    }

    const engineerIds = data.map((a) => a.engineer_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, whatsapp_number")
      .in("user_id", engineerIds);

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
    setAssignments(
      data.map((a) => ({ ...a, profile: profileMap.get(a.engineer_id) }))
    );
  };

  const fetchEngineers = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "engineer");
    if (!roles || roles.length === 0) return;
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, whatsapp_number")
      .in("user_id", roles.map((r) => r.user_id));
    setAllEngineers(profiles || []);
  };

  useEffect(() => {
    fetchAssignments();
    if (userRole === "admin") fetchEngineers();
  }, [jobId, userRole]);

  const handleAssign = async () => {
    if (!selectedEngineerId) return;
    setLoading(true);
    const { error } = await supabase.from("job_assignments").insert({
      job_id: jobId,
      engineer_id: selectedEngineerId,
    });
    if (error) {
      toast({ title: "Error", description: error.code === "23505" ? "Engineer already assigned." : "Failed to assign.", variant: "destructive" });
    } else {
      toast({ title: "Engineer assigned" });
      setSelectedEngineerId("");
      fetchAssignments();
    }
    setLoading(false);
  };

  const handleUnassign = async (assignmentId: string) => {
    const { error } = await supabase.from("job_assignments").delete().eq("id", assignmentId);
    if (error) {
      toast({ title: "Error", description: "Failed to unassign.", variant: "destructive" });
    } else {
      toast({ title: "Engineer unassigned" });
      fetchAssignments();
    }
  };

  const assignedIds = new Set(assignments.map((a) => a.engineer_id));
  const availableEngineers = allEngineers.filter((e) => !assignedIds.has(e.user_id));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Assigned Engineers</CardTitle>
      </CardHeader>
      <CardContent>
        {assignments.length === 0 ? (
          <p className="mb-3 text-sm text-muted-foreground">No engineers assigned yet.</p>
        ) : (
          <div className="mb-3 flex flex-wrap gap-2">
            {assignments.map((a) => (
              <Badge key={a.id} variant="secondary" className="gap-1.5 py-1 pl-2.5 pr-1.5">
                {a.profile?.full_name || "Unknown"}
                {userRole === "admin" && (
                  <button onClick={() => handleUnassign(a.id)} className="ml-0.5 rounded-full p-0.5 hover:bg-muted">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        )}

        {userRole === "admin" && availableEngineers.length > 0 && (
          <div className="flex gap-2">
            <Select value={selectedEngineerId} onValueChange={setSelectedEngineerId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select engineer..." />
              </SelectTrigger>
              <SelectContent>
                {availableEngineers.map((e) => (
                  <SelectItem key={e.user_id} value={e.user_id}>
                    {e.full_name || e.user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleAssign} disabled={!selectedEngineerId || loading}>
              <UserPlus className="mr-1.5 h-4 w-4" /> Assign
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
