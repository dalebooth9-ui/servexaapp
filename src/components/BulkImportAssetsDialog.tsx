import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileSpreadsheet, AlertCircle, Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAssetCategories } from "@/hooks/useAssetCategories";
import { readExcelFile } from "@/lib/excelUtils";

type ParsedAsset = {
  name: string;
  asset_tag: string;
  category: string;
  make: string;
  model: string;
  serial_number: string;
  status: string;
};

const VALID_STATUSES = ["operational", "maintenance", "faulty", "decommissioned"];

function parseCSVLine(line: string, delimiter = ","): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delimiter) { result.push(current.trim()); current = ""; }
      else current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeRows(rows: string[][]): ParsedAsset[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.toLowerCase().trim().replace(/[^\w\s]/g, ""));
  const aliases: Record<string, string[]> = {
    name: ["name", "asset name", "equipment", "equipment name", "description"],
    asset_tag: ["asset_tag", "asset tag", "tag", "asset id", "asset number"],
    category: ["category", "cat", "type", "asset type"],
    make: ["make", "manufacturer", "brand"],
    model: ["model", "model number", "model no"],
    serial_number: ["serial_number", "serial", "serial number", "serial no", "s/n"],
    status: ["status", "condition"],
  };
  const fieldMap: Record<string, number> = {};
  for (const [field, names] of Object.entries(aliases)) {
    const idx = headers.findIndex((h) => names.includes(h));
    if (idx !== -1) fieldMap[field] = idx;
  }
  return rows.slice(1)
    .filter((cols) => cols.some((c) => c.trim()))
    .map((cols) => {
      const rawStatus = (cols[fieldMap.status] || "").toLowerCase().trim();
      return {
        name: cols[fieldMap.name] || "",
        asset_tag: cols[fieldMap.asset_tag] || "",
        category: cols[fieldMap.category] || "general",
        make: cols[fieldMap.make] || "",
        model: cols[fieldMap.model] || "",
        serial_number: cols[fieldMap.serial_number] || "",
        status: VALID_STATUSES.includes(rawStatus) ? rawStatus : "operational",
      };
    })
    .filter((a) => a.name.trim());
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export default function BulkImportAssetsDialog({ open, onOpenChange, onImported }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { categories } = useAssetCategories();
  const [parsed, setParsed] = useState<ParsedAsset[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const handleFile = useCallback(async (file: File): Promise<ParsedAsset[]> => {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (ext === ".xlsx" || ext === ".xls") {
      const rows = await readExcelFile(file);
      return normalizeRows(rows);
    } else if (ext === ".pdf" || ext === ".docx" || ext === ".doc") {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ""));
      const { data, error: fnError } = await supabase.functions.invoke("parse-import-generic", {
        body: { file_base64: base64, file_name: file.name, entity_type: "assets" },
      });
      if (fnError || data?.error) throw new Error(data?.error || "Failed to parse document.");
      return (data?.records || []).map((r: any) => {
        const rawStatus = (r.status || "").toLowerCase().trim();
        return {
          name: r.name || r.equipment || r.asset || "",
          asset_tag: r.asset_tag || r.tag || r.asset_id || "",
          category: r.category || r.type || "general",
          make: r.make || r.manufacturer || r.brand || "",
          model: r.model || "",
          serial_number: r.serial_number || r.serial || r.sn || "",
          status: VALID_STATUSES.includes(rawStatus) ? rawStatus : "operational",
        };
      }).filter((a: ParsedAsset) => a.name.trim());
    } else {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = (e.target?.result as string).replace(/^\uFEFF/, "");
          const firstLine = text.split(/\r?\n/)[0] || "";
          const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
          const lines = text.split(/\r?\n/).filter((l) => l.trim());
          resolve(normalizeRows(lines.map((l) => parseCSVLine(l, delimiter))));
        };
        reader.readAsText(file);
      });
    }
  }, []);

  const handleFiles = useCallback(async (files: File[]) => {
    setError("");
    setParsed([]);
    setFileName(files.map((f) => f.name).join(", "));
    setLoading(true);
    const all: ParsedAsset[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try { all.push(...await handleFile(file)); }
      catch (err: any) { errors.push(`${file.name}: ${err.message}`); }
    }

    if (all.length === 0 && errors.length > 0) { setError(errors.join("; ")); setLoading(false); return; }
    if (all.length === 0) { setError("No valid asset rows found. Ensure your file has a 'Name' column."); setLoading(false); return; }

    // Fetch existing assets for duplicate detection (by name, case-insensitive)
    const { data: existing } = await supabase.from("assets").select("name");
    const existingNames = new Set((existing || []).map((a: any) => a.name.trim().toLowerCase()));

    const seenInBatch = new Set<string>();
    const deduped = all.filter((a) => {
      const key = a.name.trim().toLowerCase();
      if (!key || existingNames.has(key) || seenInBatch.has(key)) return false;
      seenInBatch.add(key);
      return true;
    });

    const skipped = all.length - deduped.length;
    if (skipped > 0) toast({ title: `${skipped} duplicate${skipped > 1 ? "s" : ""} skipped`, description: `${skipped} asset${skipped > 1 ? "s" : ""} already exist and won't be re-imported.` });
    if (deduped.length === 0) { setError("All extracted assets already exist in the database."); setLoading(false); return; }

    setParsed(deduped);
    if (errors.length) setError(errors.join("; "));
    setLoading(false);
  }, [handleFile, toast]);

  const updateRow = (idx: number, field: keyof ParsedAsset, value: string) =>
    setParsed((prev) => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));

  const removeRow = (idx: number) => setParsed((prev) => prev.filter((_, i) => i !== idx));

  const handleImport = async () => {
    if (!user || parsed.length === 0) return;
    setImporting(true);
    const rows = parsed.map((a) => ({
      name: a.name.trim(),
      asset_tag: a.asset_tag.trim() || null,
      category: a.category.trim() || "general",
      make: a.make.trim() || null,
      model: a.model.trim() || null,
      serial_number: a.serial_number.trim() || null,
      status: VALID_STATUSES.includes(a.status) ? a.status : "operational",
      created_by: user.id,
    }));
    const { data, error: dbError } = await supabase.from("assets").insert(rows).select("id");
    setImporting(false);
    if (dbError) {
      toast({ title: "Import failed", description: dbError.message, variant: "destructive" });
    } else {
      toast({ title: "Import complete", description: `${data.length} asset(s) imported.` });
      setParsed([]); setFileName(""); setError("");
      onOpenChange(false); onImported();
    }
  };

  const reset = () => { setParsed([]); setFileName(""); setError(""); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-5xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Import Assets</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            <p className="font-medium">Parsing document with AI…</p>
            <p className="text-sm text-muted-foreground">{fileName}</p>
          </div>
        ) : parsed.length === 0 ? (
          <div
            onDrop={(e) => { e.preventDefault(); const files = Array.from(e.dataTransfer.files); if (files.length) handleFiles(files); }}
            onDragOver={(e) => e.preventDefault()}
            className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-muted-foreground/30 p-12 text-center"
          >
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Drop file(s) here</p>
              <p className="text-sm text-muted-foreground">Supports CSV, Excel, Word and PDF — multiple files allowed</p>
              <p className="text-sm text-muted-foreground">Columns: Name, Asset Tag, Category, Make, Model, Serial Number, Status</p>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />{error}
              </div>
            )}
            <label>
              <input type="file" accept=".csv,.txt,.xlsx,.xls,.docx,.doc,.pdf" multiple className="hidden"
                onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) handleFiles(files); }} />
              <Button variant="outline" asChild>
                <span><Upload className="mr-2 h-4 w-4" />Choose File</span>
              </Button>
            </label>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{fileName} — {parsed.length} row(s)</span>
              <Button variant="ghost" size="sm" onClick={reset}>Clear</Button>
            </div>
            {error && (
              <div className="mb-3 flex items-center gap-2 rounded bg-destructive/10 p-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />{error}
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name *</TableHead>
                  <TableHead>Tag</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Make</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Serial</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell><Input value={a.name} onChange={(e) => updateRow(i, "name", e.target.value)} className="h-8 text-sm min-w-[120px]" /></TableCell>
                    <TableCell><Input value={a.asset_tag} onChange={(e) => updateRow(i, "asset_tag", e.target.value)} className="h-8 text-sm w-24" /></TableCell>
                    <TableCell>
                      <Select value={a.category} onValueChange={(v) => updateRow(i, "category", v)}>
                        <SelectTrigger className="h-8 w-[130px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}
                          <SelectItem value="general">General</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Input value={a.make} onChange={(e) => updateRow(i, "make", e.target.value)} className="h-8 text-sm w-24" /></TableCell>
                    <TableCell><Input value={a.model} onChange={(e) => updateRow(i, "model", e.target.value)} className="h-8 text-sm w-24" /></TableCell>
                    <TableCell><Input value={a.serial_number} onChange={(e) => updateRow(i, "serial_number", e.target.value)} className="h-8 text-sm w-28" /></TableCell>
                    <TableCell>
                      <Select value={a.status} onValueChange={(v) => updateRow(i, "status", v)}>
                        <SelectTrigger className="h-8 w-[130px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="operational">Operational</SelectItem>
                          <SelectItem value="maintenance">Maintenance</SelectItem>
                          <SelectItem value="faulty">Faulty</SelectItem>
                          <SelectItem value="decommissioned">Decommissioned</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><button onClick={() => removeRow(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {parsed.length > 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleImport} disabled={importing || parsed.length === 0}>
              {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Import {parsed.length} Asset(s)
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
