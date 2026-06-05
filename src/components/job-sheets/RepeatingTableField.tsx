import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, X, Camera, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type RepeatingColumn = {
  id: string;
  label: string;
  type: "text" | "number" | "yn_na" | "dropdown" | "photo";
  options?: string[];
};

type Row = Record<string, any>;

type Props = {
  columns: RepeatingColumn[];
  value: any;
  onChange: (value: string) => void;
  jobId?: string;
  userId?: string;
  fieldId?: string;
};

function parseRows(value: any): Row[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const v = JSON.parse(value);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function RepeatingTableField({ columns, value, onChange, jobId, userId, fieldId }: Props) {
  const rows = parseRows(value);
  const containerRef = useRef<HTMLDivElement>(null);

  const commit = (next: Row[]) => onChange(JSON.stringify(next));

  const updateCell = (rowIdx: number, colId: string, v: any) => {
    const next = rows.map((r, i) => (i === rowIdx ? { ...r, [colId]: v } : r));
    commit(next);
  };

  const addRow = () => {
    const blank: Row = {};
    columns.forEach((c) => (blank[c.id] = ""));
    commit([...rows, blank]);
  };

  const removeRow = (idx: number) => {
    commit(rows.filter((_, i) => i !== idx));
  };

  const scrollIntoView = (el: HTMLElement | null) => {
    if (!el) return;
    setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  return (
    <div ref={containerRef} className="space-y-3 w-full">
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No rows yet. Tap "Add Row" to begin.</p>
      )}

      {rows.map((row, rowIdx) => (
        <div
          key={rowIdx}
          className="relative rounded-lg border border-border bg-muted/30 p-3 pr-9 space-y-3"
        >
          <button
            type="button"
            onClick={() => removeRow(rowIdx)}
            aria-label="Remove row"
            className="absolute top-2 right-2 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Row {rowIdx + 1}
          </div>

          {columns.map((col) => {
            const val = row[col.id] ?? "";
            return (
              <div key={col.id} className="space-y-1">
                <Label className="text-xs text-foreground/80">{col.label}</Label>

                {col.type === "text" && (
                  <Input
                    value={val}
                    onFocus={(e) => scrollIntoView(e.currentTarget)}
                    onChange={(e) => updateCell(rowIdx, col.id, e.target.value)}
                    className="h-9 text-sm"
                  />
                )}

                {col.type === "number" && (
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={val}
                    onFocus={(e) => scrollIntoView(e.currentTarget)}
                    onChange={(e) => updateCell(rowIdx, col.id, e.target.value)}
                    className="h-9 text-sm"
                  />
                )}

                {col.type === "dropdown" && (
                  <Select
                    value={val || ""}
                    onValueChange={(v) => updateCell(rowIdx, col.id, v)}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(col.options || []).map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {col.type === "yn_na" && (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { v: "Y", label: "Y", cls: "bg-green-600 hover:bg-green-700 text-white border-green-600" },
                      { v: "N", label: "N", cls: "bg-destructive hover:bg-destructive/90 text-white border-destructive" },
                      { v: "N/A", label: "N/A", cls: "bg-muted hover:bg-muted/80 text-muted-foreground border-border" },
                    ].map((opt) => {
                      const active = val === opt.v;
                      return (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => updateCell(rowIdx, col.id, active ? "" : opt.v)}
                          className={`min-h-[44px] rounded-md border text-sm font-semibold transition ${
                            active ? opt.cls : "bg-background hover:bg-muted text-foreground border-border"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <Button
        type="button"
        onClick={addRow}
        className="w-full min-h-[44px] bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
      >
        <Plus className="h-4 w-4" />
        Add Row
      </Button>
    </div>
  );
}
