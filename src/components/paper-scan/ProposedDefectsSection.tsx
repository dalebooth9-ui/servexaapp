import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProposedDefect } from "@/lib/proposeArchiveDefects";

interface Props {
  proposals: ProposedDefect[];
  /** Map of key → true when this proposal will be created. Defaults to all ticked. */
  selection: Record<string, boolean>;
  onSelectionChange: (next: Record<string, boolean>) => void;
  /** Overrides for individual proposal fields (title/severity/location). */
  overrides: Record<string, Partial<ProposedDefect>>;
  onOverridesChange: (next: Record<string, Partial<ProposedDefect>>) => void;
}

/**
 * Ticklist of AI-derived defect proposals from a historic scan. Every
 * proposal is ticked by default; office unticks anything already known
 * to be resolved. Nothing is created until the user files the sheet.
 */
export default function ProposedDefectsSection({
  proposals,
  selection,
  onSelectionChange,
  overrides,
  onOverridesChange,
}: Props) {
  const selectedCount = useMemo(
    () => proposals.filter((p) => selection[p.key] !== false).length,
    [proposals, selection],
  );

  if (proposals.length === 0) return null;

  const patchOverride = (key: string, patch: Partial<ProposedDefect>) => {
    onOverridesChange({ ...overrides, [key]: { ...overrides[key], ...patch } });
  };

  const toggle = (key: string, checked: boolean) =>
    onSelectionChange({ ...selection, [key]: checked });

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    for (const p of proposals) next[p.key] = checked;
    onSelectionChange(next);
  };

  return (
    <div className="rounded border border-orange-500/40 bg-orange-500/5 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="h-4 w-4 text-orange-500" />
            Proposed defects
            <Badge variant="outline" className="ml-1">
              {selectedCount} of {proposals.length} to create
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-prose">
            These deficiencies were read off the scanned sheet. Untick anything
            long since resolved — this sheet may be years old. Ticked items
            become open defects linked to the customer &amp; site (no job) when
            you file.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => toggleAll(true)}
            className="underline text-muted-foreground hover:text-foreground"
          >
            Tick all
          </button>
          <span className="text-muted-foreground">·</span>
          <button
            type="button"
            onClick={() => toggleAll(false)}
            className="underline text-muted-foreground hover:text-foreground"
          >
            Untick all
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {proposals.map((p) => {
          const isOn = selection[p.key] !== false;
          const override = overrides[p.key] || {};
          const title = (override.title ?? p.title) as string;
          const loc = (override.location_on_site ?? p.location_on_site) as string;
          const sev = (override.severity ?? p.severity) as ProposedDefect["severity"];
          return (
            <li
              key={p.key}
              className={
                "rounded border bg-background p-2 space-y-2 " +
                (isOn ? "border-orange-400/40" : "border-border opacity-70")
              }
            >
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={isOn}
                  onCheckedChange={(c) => toggle(p.key, !!c)}
                  className="mt-1"
                  aria-label={`Create defect: ${title}`}
                />
                <div className="flex-1 min-w-0 space-y-2">
                  <Input
                    value={title}
                    onChange={(e) => patchOverride(p.key, { title: e.target.value })}
                    className="text-sm font-medium"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Location on site
                      </Label>
                      <Input
                        value={loc}
                        onChange={(e) =>
                          patchOverride(p.key, { location_on_site: e.target.value })
                        }
                        placeholder="e.g. Levels 2 & 4"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Severity
                      </Label>
                      <Select
                        value={sev}
                        onValueChange={(v: any) => patchOverride(p.key, { severity: v })}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="critical">Critical</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {p.source_field_label
                      ? <>Source row: <span className="italic">{p.source_field_label}</span></>
                      : "Source: freeform remark on the scanned sheet"}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
