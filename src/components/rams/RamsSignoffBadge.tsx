import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  ramsCount: number;
  signoffCount: number;
  required?: boolean;
  className?: string;
}

/**
 * Compact office-visible badge summarising RAMS sign-off state on a job.
 *   - required + none attached           → red   "RAMS required"
 *   - attached + zero sign-offs         → amber "RAMS: 0 signed"
 *   - attached + partial sign-offs      → amber "RAMS: n signed"
 *   - attached + at least one sign-off  → green when every doc has ≥1 sign-off
 */
export default function RamsSignoffBadge({ ramsCount, signoffCount, required, className }: Props) {
  if (ramsCount === 0) {
    if (!required) return null;
    return (
      <Badge variant="destructive" className={cn("gap-1", className)}>
        <ShieldAlert className="h-3 w-3" /> RAMS required
      </Badge>
    );
  }
  if (signoffCount === 0) {
    return (
      <Badge variant="outline" className={cn("gap-1 border-amber-500/60 text-amber-700", className)}>
        <AlertTriangle className="h-3 w-3" /> RAMS: 0 signed
      </Badge>
    );
  }
  const fullySigned = signoffCount >= ramsCount;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1",
        fullySigned ? "border-emerald-500/60 text-emerald-700" : "border-amber-500/60 text-amber-700",
        className,
      )}
    >
      <CheckCircle2 className="h-3 w-3" /> RAMS: {signoffCount} signed
    </Badge>
  );
}
