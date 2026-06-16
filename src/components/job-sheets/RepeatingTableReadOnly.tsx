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
 * Read-only renderer for a `repeating_table` field. Mirrors the PDF layout
 * exactly: a compact data table for non-photo columns, followed by a dedicated
 * "Dwelling Photos" section grouped by unit_number with a 3-column grid and
 * italic captions beneath each image.
 */
export default function RepeatingTableReadOnly({
  columns,
  value,
  label,
}: {
  columns: Column[];
  value: any;
  label?: string;
}) {
  const rows = useMemo(() => parseValue(value), [value]);

  const dataColumns = columns.filter(
    (c) => c.type !== "photo" && c.type !== "photo_gallery",
  );
  const galleryColumns = columns.filter(
    (c) => c.type === "photo" || c.type === "photo_gallery",
  );

  // Collect every photo path used across all rows so we can sign them in one effect.
  const allPaths = useMemo(() => {
    const paths: string[] = [];
    for (const row of rows) {
      for (const col of galleryColumns) {
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
  }, [rows, galleryColumns]);

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

  // Build photo groups keyed by unit label (mirrors PDF logic exactly).
  const unitKey =
    columns.find((c) => /unit/i.test(c.id))?.id ||
    columns.find((c) => /unit|name|label|location/i.test(c.id))?.id ||
    columns[0]?.id;

  type GroupItem = { path: string; caption: string };
  type Group = { label: string; items: GroupItem[] };
  const groups: Group[] = [];
  for (const row of rows) {
    const items: GroupItem[] = [];
    for (const col of galleryColumns) {
      if (col.type === "photo_gallery") {
        for (const p of parsePhotos(row?.[col.id])) {
          if (p.path) items.push({ path: p.path, caption: (p.caption || "").trim() });
        }
      } else if (col.type === "photo") {
        const v = row?.[col.id];
        if (typeof v === "string" && v) items.push({ path: v, caption: "" });
      }
    }
    if (items.length === 0) continue;
    const groupLabel = unitKey ? formatCellValue(row?.[unitKey]) : "";
    groups.push({
      label: groupLabel && groupLabel !== "—" ? groupLabel : "Unit (unspecified)",
      items,
    });
  }

  return (
    <div className="space-y-3">
      {/* Compact data table for non-photo columns */}
      {dataColumns.length > 0 && (
        <div className="overflow-x-auto border border-border rounded-md">
          <table className="w-full text-[11px]">
            <thead className="bg-muted">
              <tr>
                {dataColumns.map((col) => (
                  <th
                    key={col.id}
                    className="px-2 py-1 text-left font-semibold text-foreground border-b border-border whitespace-nowrap"
                  >
                    {col.label || col.id}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row?.id || idx} className="border-b border-border last:border-b-0">
                  {dataColumns.map((col) => (
                    <td key={col.id} className="px-2 py-1 align-top text-foreground">
                      {formatCellValue(row?.[col.id])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dedicated photo gallery section — mirrors the PDF layout */}
      {groups.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wide text-primary">
            {label || "Dwelling Photos"}
          </div>
          {groups.map((group, gi) => (
            <div key={`${group.label}-${gi}`} className="space-y-1">
              <div className="bg-primary text-primary-foreground text-[11px] font-semibold px-2 py-1 rounded-sm">
                Unit: {group.label}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {group.items.map((item, i) => {
                  const url = signedUrls[item.path];
                  return (
                    <div key={`${item.path}-${i}`} className="space-y-1">
                      {url ? (
                        <img
                          src={url}
                          alt={item.caption || `Photo ${i + 1}`}
                          data-uploaded="true"
                          className="w-full aspect-[4/3] rounded border object-cover bg-muted"
                        />
                      ) : (
                        <div className="w-full aspect-[4/3] rounded border bg-muted flex items-center justify-center">
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      <div className="text-[10px] italic text-muted-foreground leading-tight break-words">
                        {item.caption || `Photo ${i + 1}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
