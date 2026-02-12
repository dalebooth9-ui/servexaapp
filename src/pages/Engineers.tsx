import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Phone } from "lucide-react";

export default function Engineers() {
  const [engineers, setEngineers] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      // Get all users with engineer role
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "engineer");
      if (!roles || roles.length === 0) {
        setEngineers([]);
        return;
      }

      const userIds = roles.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("user_id", userIds);

      // Get assignment counts
      const { data: assignments } = await supabase
        .from("job_assignments")
        .select("engineer_id, job_id")
        .in("engineer_id", userIds);

      const assignmentCounts: Record<string, number> = {};
      (assignments || []).forEach((a) => {
        assignmentCounts[a.engineer_id] = (assignmentCounts[a.engineer_id] || 0) + 1;
      });

      setEngineers(
        (profiles || []).map((p) => ({
          ...p,
          job_count: assignmentCounts[p.user_id] || 0,
        }))
      );
    };
    fetch();
  }, []);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Engineers</h1>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Assigned Jobs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {engineers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No engineers found. Users need to be assigned the engineer role.
                  </TableCell>
                </TableRow>
              ) : (
                engineers.map((eng) => (
                  <TableRow key={eng.id}>
                    <TableCell className="font-medium">{eng.full_name || "—"}</TableCell>
                    <TableCell>
                      {eng.whatsapp_number ? (
                        <span className="inline-flex items-center gap-1 text-sm">
                          <Phone className="h-3.5 w-3.5 text-accent" />
                          {eng.whatsapp_number}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{eng.phone || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{eng.job_count}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
