import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import {
  applyHazardModule,
  removeHazardModule,
  appliedFrom,
  useHazardModules,
  type AppliedHazardModule,
  type HazardModule,
  type RamsModuleContent,
} from "@/lib/hazardModules";

interface Props {
  content: RamsModuleContent;
  applied: AppliedHazardModule[];
  user?: { id?: string | null; name?: string | null } | null;
  onChange: (content: RamsModuleContent, applied: AppliedHazardModule[]) => void;
  /** Admin-only hint linking to the approval screen. */
  canManage?: boolean;
}

/**
 * "Additional work types / hazards" — tick a module and its hazard description,
 * control measures and risk-assessment rows are merged into the document itself
 * (not appended as a separate annexe). Only modules approved by the org's
 * competent person appear here.
 */
export default function HazardModulePicker({ content, applied, user, onChange, canManage }: Props) {
  const { modules, loading } = useHazardModules({ approvedOnly: true });
  const appliedSlugs = new Set(applied.map((a) => a.slug));

  const toggle = (m: HazardModule) => {
    if (appliedSlugs.has(m.slug)) {
      onChange(removeHazardModule(content, m), applied.filter((a) => a.slug !== m.slug));
    } else {
      onChange(applyHazardModule(content, m), [...applied, appliedFrom(m, user)]);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-primary" />
          Additional work types / hazards
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Tick any high-risk activity this job involves. The hazard, control measures and risk
          assessment rows are merged into this RAMS and can then be edited like any other content.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="h-10 animate-pulse rounded bg-muted/40" />
        ) : modules.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No approved hazard modules yet.{" "}
            {canManage && (
              <Link to="/settings/rams-library" className="underline">
                Review and approve the starter modules
              </Link>
            )}
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {modules.map((m) => {
              const on = appliedSlugs.has(m.slug);
              const who = applied.find((a) => a.slug === m.slug);
              return (
                <li key={m.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/50">
                    <Checkbox checked={on} onCheckedChange={() => toggle(m)} className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="text-sm font-medium flex items-center gap-2">
                        {m.name}
                        {on && (
                          <Badge variant="secondary" className="text-[10px]">
                            <ShieldCheck className="h-3 w-3 mr-1" /> Applied
                          </Badge>
                        )}
                      </span>
                      {m.summary && (
                        <span className="block text-xs text-muted-foreground">{m.summary}</span>
                      )}
                      {on && who?.applied_by_name && (
                        <span className="block text-[11px] text-muted-foreground mt-0.5">
                          Added by {who.applied_by_name}
                          {who.applied_at
                            ? ` · ${new Date(who.applied_at).toLocaleDateString("en-GB")}`
                            : ""}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
