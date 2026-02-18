import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type FaultCode = { id: string; code: string; description: string; priority: string };

const priorityColor: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-warning/10 text-warning",
  low: "bg-accent/10 text-accent",
};

export default function FaultCodeSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [codes, setCodes] = useState<FaultCode[]>([]);

  useEffect(() => {
    supabase
      .from("fault_codes")
      .select("id, code, description, priority")
      .order("code")
      .then(({ data }) => setCodes((data as FaultCode[]) || []));
  }, []);

  if (codes.length === 0) return null;

  return (
    <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? null : v)}>
      <SelectTrigger className="h-7 w-[200px] text-xs">
        <SelectValue placeholder="Fault code..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">No fault code</SelectItem>
        {codes.map((fc) => (
          <SelectItem key={fc.id} value={fc.id}>
            <span className="flex items-center gap-2">
              <Badge variant="secondary" className={`text-[9px] px-1 py-0 ${priorityColor[fc.priority] || ""}`}>
                {fc.priority}
              </Badge>
              <span className="font-mono text-xs">{fc.code}</span>
              <span className="text-muted-foreground">{fc.description}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
