import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImportEntity, ENTITY_SCHEMAS } from "./schemas";
import { heuristicMap, mergeMappings } from "@/lib/importMapping";
import type { ParsedFile } from "@/lib/importMapping";

export default function StepMapping({
  entity,
  parsed,
  mapping,
  setMapping,
}: {
  entity: ImportEntity;
  parsed: ParsedFile;
  mapping: Record<string, string | null>;
  setMapping: (m: Record<string, string | null>) => void;
}) {
  const schema = ENTITY_SCHEMAS[entity];
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (Object.keys(mapping).length > 0) return;
    const initial = heuristicMap(entity, parsed.headers);
    setMapping(initial);
    // Try to fill any nulls with AI in the background.
    const missing = Object.entries(initial).filter(([, v]) => !v).length;
    if (missing > 0) runAi(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAi(base?: Record<string, string | null>) {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-import-mapping", {
        body: {
          entity,
          headers: parsed.headers,
          sampleRows: parsed.rows.slice(0, 5),
          targetFields: schema.fields.map(({ key, label, required, hint }) => ({ key, label, required, hint })),
        },
      });
      if (error) throw error;
      const proposal = (data?.mapping || {}) as Record<string, string | null>;
      const startingPoint = base || mapping;
      const merged = mergeMappings(startingPoint, proposal, parsed.headers);
      setMapping(merged);
    } catch (e: any) {
      toast.error("AI mapping unavailable, using name-matching fallback");
    } finally {
      setAiLoading(false);
    }
  }

  const sampleFor = (header: string | null): string => {
    if (!header) return "";
    const idx = parsed.headers.indexOf(header);
    if (idx === -1) return "";
    for (const row of parsed.rows) {
      const v = (row[idx] || "").toString().trim();
      if (v) return v;
    }
    return "";
  };

  const used = new Set(Object.values(mapping).filter(Boolean) as string[]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Match each of your columns to a Servexa field. We've pre-filled likely matches — please review.
        </div>
        <Button size="sm" variant="outline" onClick={() => runAi()} disabled={aiLoading}>
          {aiLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
          Re-run AI suggestion
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Servexa field</th>
              <th className="text-left p-3 font-medium">Your column</th>
              <th className="text-left p-3 font-medium">Sample value</th>
            </tr>
          </thead>
          <tbody>
            {schema.fields.map((f) => {
              const current = mapping[f.key] || "";
              return (
                <tr key={f.key} className="border-t">
                  <td className="p-3 align-top">
                    <div className="font-medium">{f.label}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      {f.required && <Badge variant="destructive" className="h-4 px-1 text-[10px]">required</Badge>}
                      {f.hint && <span>{f.hint}</span>}
                    </div>
                  </td>
                  <td className="p-3 align-top w-[280px]">
                    <Select
                      value={current || "__none__"}
                      onValueChange={(v) => setMapping({ ...mapping, [f.key]: v === "__none__" ? null : v })}
                    >
                      <SelectTrigger><SelectValue placeholder="— not mapped —" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— not mapped —</SelectItem>
                        {parsed.headers.map((h) => (
                          <SelectItem key={h} value={h} disabled={used.has(h) && h !== current}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3 align-top text-muted-foreground truncate max-w-xs">
                    {sampleFor(current) || <span className="italic text-muted-foreground/70">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
