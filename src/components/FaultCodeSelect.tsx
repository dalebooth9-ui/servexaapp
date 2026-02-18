import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle } from "lucide-react";

export default function FaultCodeSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground mr-1">Result:</span>
      <Button
        type="button"
        size="sm"
        variant={value === "pass" ? "default" : "outline"}
        className={`h-7 px-2.5 text-xs gap-1 ${value === "pass" ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
        onClick={() => onChange(value === "pass" ? null : "pass")}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Pass
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === "fail" ? "default" : "outline"}
        className={`h-7 px-2.5 text-xs gap-1 ${value === "fail" ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}`}
        onClick={() => onChange(value === "fail" ? null : "fail")}
      >
        <XCircle className="h-3.5 w-3.5" />
        Fail
      </Button>
    </div>
  );
}
