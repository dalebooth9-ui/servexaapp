/**
 * "Previous report" comparison panel.
 *
 * Shown in the paper-scan review (single + batch matched), on a filed
 * job-sheet response view, and above the customer-report generator so
 * office staff can sanity-check a new report against the prior one for
 * the same site/asset+template. Advisory only — never a gate.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, History, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatDateShort } from "@/lib/dateFormat";
import {
  diffResponses,
  findPreviousResponse,
  type FieldDiff,
  type PreviousResponse,
  type TemplateFieldLite,
} from "@/lib/previousReportLookup";

interface Props {
  currentJobId: string;
  templateId: string;
  templateFields: TemplateFieldLite[];
  currentResponses: Record<string, any>;
  currentResponseId?: string;
  /** Compact single-line style, useful in dense dialogs. */
  compact?: boolean;
}

export default function PreviousReportPanel({
  currentJobId,
  templateId,
  templateFields,
  currentResponses,
  currentResponseId,
  compact,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [prev, setPrev] = useState<PreviousResponse | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    findPreviousResponse({ currentJobId, templateId, currentResponseId })
      .then((r) => {
        if (!cancelled) setPrev(r);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentJobId, templateId, currentResponseId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking for a previous report…
      </div>
    );
  }

  if (!prev) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <History className="h-3.5 w-3.5" />
        No previous report found for this site &amp; template.
      </div>
    );
  }

  const diffs = diffResponses(templateFields, prev.responses, currentResponses);
  const changed = diffs.filter((d) => d.status !== "unchanged");
  const flagged = changed.filter((d) => d.highSignal);

  const dateLabel = formatDateShort(prev.submittedAt) || "unknown date";
  const summary =
    changed.length === 0
      ? `Identical to previous report on ${dateLabel}`
      : `${changed.length} difference${changed.length === 1 ? "" : "s"} vs ${dateLabel} report`;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={`rounded-md border ${
          flagged.length > 0
            ? "border-amber-300 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30"
            : "border-border bg-muted/30"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            {flagged.length > 0 ? (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            ) : (
              <History className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{summary}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {prev.jobReference ? `${prev.jobReference} · ` : ""}
                {prev.submittedByName ? `${prev.submittedByName} · ` : ""}
                matched by {prev.level}
                {flagged.length > 0 && (
                  <>
                    {" · "}
                    <span className="text-amber-700 dark:text-amber-300 font-medium">
                      {flagged.length} to check
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs gap-1"
            >
              <Link to={`/jobs/${prev.jobId}`} target="_blank" rel="noreferrer">
                Open <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
            {!compact && changed.length > 0 && (
              <CollapsibleTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
                  {open ? "Hide diff" : "Show diff"}
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
        </div>
        {!compact && (
          <CollapsibleContent>
            <DiffTable diffs={diffs} />
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}

function DiffTable({ diffs }: { diffs: FieldDiff[] }) {
  // Group by section so the reviewer can scan the same way as the form.
  const sections = new Map<string, FieldDiff[]>();
  for (const d of diffs) {
    if (!sections.has(d.section)) sections.set(d.section, []);
    sections.get(d.section)!.push(d);
  }
  return (
    <div className="border-t border-border/60 bg-background/50">
      <div className="max-h-[320px] overflow-y-auto">
        {Array.from(sections.entries()).map(([section, rows]) => (
          <div key={section}>
            <div className="sticky top-0 bg-muted/70 backdrop-blur px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b">
              {section}
            </div>
            <div className="divide-y divide-border/50">
              {rows.map((d) => (
                <div
                  key={d.fieldId}
                  className={`grid grid-cols-[1fr,1fr,1fr] gap-2 px-3 py-1.5 text-[11px] ${
                    d.status === "unchanged"
                      ? "opacity-60"
                      : d.highSignal
                      ? "bg-amber-50/70 dark:bg-amber-950/20"
                      : ""
                  }`}
                >
                  <div className="text-muted-foreground truncate" title={d.label}>
                    {d.label}
                  </div>
                  <div className="truncate" title={d.previous}>
                    {d.previous || <span className="text-muted-foreground/60">—</span>}
                  </div>
                  <div className="min-w-0 flex items-center gap-1.5">
                    <span
                      className={`truncate ${
                        d.status === "unchanged"
                          ? ""
                          : d.highSignal
                          ? "font-semibold text-amber-800 dark:text-amber-200"
                          : "font-medium"
                      }`}
                      title={d.current}
                    >
                      {d.current || <span className="text-muted-foreground/60">—</span>}
                    </span>
                    {d.reason && (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1 py-0 h-4 border-amber-400 text-amber-800 dark:text-amber-200"
                      >
                        {d.reason}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1fr,1fr,1fr] gap-2 px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground border-t bg-muted/40">
        <span>Field</span>
        <span>Previous</span>
        <span>This report</span>
      </div>
    </div>
  );
}
