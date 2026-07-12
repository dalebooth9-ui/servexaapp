import Papa from "papaparse";
import { readExcelFile } from "@/lib/excelUtils";
import { ENTITY_SCHEMAS, ImportEntity, normaliseHeader } from "@/components/import-wizard/schemas";

export interface ParsedFile {
  headers: string[];
  rows: string[][];
}

export const MAX_ROWS = 5000;

export async function parseImportFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv")) {
    const text = await file.text();
    const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
    const rows = (result.data as string[][]).map((r) => r.map((c) => (c ?? "").toString().trim()));
    if (rows.length === 0) return { headers: [], rows: [] };
    return { headers: rows[0], rows: rows.slice(1) };
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const rows = await readExcelFile(file);
    if (rows.length === 0) return { headers: [], rows: [] };
    return { headers: rows[0], rows: rows.slice(1) };
  }
  throw new Error("Unsupported file type. Please upload CSV or Excel (.xlsx).");
}

/**
 * Heuristic column mapping: for each target field, find the source header
 * whose normalised form appears in the field's aliases list.
 */
export function heuristicMap(entity: ImportEntity, headers: string[]): Record<string, string | null> {
  const schema = ENTITY_SCHEMAS[entity];
  const normHeaders = headers.map(normaliseHeader);
  const mapping: Record<string, string | null> = {};
  const used = new Set<number>();
  for (const field of schema.fields) {
    let matchIdx = -1;
    for (let i = 0; i < normHeaders.length; i++) {
      if (used.has(i)) continue;
      if (field.aliases.includes(normHeaders[i])) { matchIdx = i; break; }
    }
    if (matchIdx === -1) {
      for (let i = 0; i < normHeaders.length; i++) {
        if (used.has(i)) continue;
        if (field.aliases.some((a) => normHeaders[i].includes(a) || a.includes(normHeaders[i]))) {
          matchIdx = i; break;
        }
      }
    }
    if (matchIdx !== -1) { mapping[field.key] = headers[matchIdx]; used.add(matchIdx); }
    else mapping[field.key] = null;
  }
  return mapping;
}

/**
 * Merge two mappings: use AI proposal only where heuristic left null.
 */
export function mergeMappings(
  base: Record<string, string | null>,
  proposal: Record<string, string | null>,
  headers: string[]
): Record<string, string | null> {
  const out: Record<string, string | null> = { ...base };
  const used = new Set(Object.values(base).filter(Boolean) as string[]);
  for (const [k, v] of Object.entries(proposal)) {
    if (out[k] || !v) continue;
    if (!headers.includes(v)) continue;
    if (used.has(v)) continue;
    out[k] = v;
    used.add(v);
  }
  return out;
}

export interface TransformedRow {
  values: Record<string, string>;
  rowIndex: number; // original 0-based data row index
}

export function transformRows(
  headers: string[],
  rows: string[][],
  mapping: Record<string, string | null>
): TransformedRow[] {
  const headerIdx: Record<string, number> = {};
  headers.forEach((h, i) => { headerIdx[h] = i; });
  const out: TransformedRow[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((c) => !c || !c.trim())) continue;
    const values: Record<string, string> = {};
    for (const [field, header] of Object.entries(mapping)) {
      if (!header) { values[field] = ""; continue; }
      const idx = headerIdx[header];
      values[field] = idx != null ? (row[idx] || "").toString().trim() : "";
    }
    out.push({ values, rowIndex: r });
  }
  return out;
}
