import { useEffect, useState, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Column = {
  id: string;
  label?: string;
  type?: string;
  options?: string[];
};

type Photo = {
  path?: string;
  url?: string;
  caption?: string;
};

type Row = Record<string, any>;

function parseValue(value: any): Row[] {
  if (Array.isArray(value)) return value as Row[];
  if (typeof value === "string") {
    const t = value.trim();
    if (!t.startsWith("[")) return [];
    try {
      const v = JSON.parse(t);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parsePhotos(value: any): Photo[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string" && value.trim().startsWith("[")
    ? (() => {
        try {
          return JSON.parse(value);
        } catch {
          return [];
        }
      })()
    : [];
  return (raw as any[])
    .filter((p) => p && typeof p === "object")
    .map((p) => ({ path: p.path || p.url, caption: p.caption })) as Photo[];
}

function formatCellValue(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" || typeof v === "number") return String(v);
  return "";
}

/**
 * Read-only renderer for a `repeating_table` field. Used in the submitted
 * job-sheet viewer so dwelling access log photos & captions render on screen
 * (not just in the exported PDF).
 */
export default function RepeatingTableReadOnly({
  columns,
  value,
}: {
  columns: Column[];
  value: any;
}) {
  const rows = useMemo(() => parseValue(value), [value]);

  // Collect every photo path used across all rows so we can sign them in one effect.
  const allPaths = useMemo(() => {
    const paths: string[] = [];
    for (const row of rows) {
      for (const col of columns) {
        if (col.type === "photo_gallery") {
          for (const p of parsePhotos(row?.[col.id])) {
            if (p.path) paths.push(p.path);
          }
        } else if (col.type === "photo") {
          const v = row?.[col.id];
          if (typeof v === "string" && v) paths.push(v);
        }
      }
    }
    return Array.from(new Set(paths));
  }, [rows, columns]);

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const path of allPaths) {
        const { data } = await supabase.storage
          .from("submissions")
          .createSignedUrl(path, 3600);
        if (data?.signedUrl) next[path] = data.signedUrl;
      }
      if (!cancelled) setSignedUrls(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [allPaths.join("|")]);

  if (rows.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className="space-y-2">
      {rows.map((row, idx) => {
        // Prefer a unit_number-style label if present
        const headingKey =
          columns.find((c) => /unit|name|label|location/i.test(c.id))?.id ||
          columns[0]?.id;
        const heading = headingKey ? formatCellValue(row?.[headingKey]) : `Row ${idx + 1}`;

        return (
          <div
            key={row?.id || `${idx}-${heading}`}
            className="border border-border rounded-md p-2 bg-background"
          >
            <div className="text-[11px] font-semibold text-foreground mb-1">
              {heading || `Row ${idx + 1}`}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5">
              {columns
                .filter((c) => c.type !== "photo_gallery" && c.type !== "photo" && c.id !== headingKey)
                .map((col) => (
                  <div key={col.id} className="flex gap-1 text-[11px]">
                    <span className="text-muted-foreground">{col.label || col.id}:</span>
                    <span className="font-medium text-foreground">{formatCellValue(row?.[col.id])}</span>
                  </div>
                ))}
            </div>

            {columns
              .filter((c) => c.type === "photo" || c.type === "photo_gallery")
              .map((col) => {
                const photos: Photo[] =
                  col.type === "photo_gallery"
                    ? parsePhotos(row?.[col.id])
                    : typeof row?.[col.id] === "string" && row[col.id]
                    ? [{ path: row[col.id], caption: "" }]
                    : [];

                if (photos.length === 0) return null;

                return (
                  <div key={col.id} className="mt-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                      {col.label || "Photos"}
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {photos.map((p, i) => {
                        const url = p.path ? signedUrls[p.path] : undefined;
                        return (
                          <div key={`${p.path}-${i}`} className="shrink-0 w-[88px] space-y-1">
                            {url ? (
                              <img
                                src={url}
                                alt={p.caption || `Photo ${i + 1}`}
                                data-uploaded="true"
                                className="w-[88px] h-[66px] rounded border object-cover bg-muted"
                              />
                            ) : (
                              <div className="w-[88px] h-[66px] rounded border bg-muted flex items-center justify-center">
                                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                              </div>
                            )}
                            {p.caption && (
                              <div className="text-[10px] italic text-muted-foreground leading-tight break-words">
                                {p.caption}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
