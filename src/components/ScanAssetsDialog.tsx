import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, ScanLine, AlertCircle, Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAssetCategories } from "@/hooks/useAssetCategories";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";

type Row = {
  name: string;
  asset_tag: string;
  category: string;
  make: string;
  model: string;
  serial_number: string;
  location_notes: string;
  status: string;
};

type SiteOption = { id: string; name: string };

const VALID_STATUSES = ["operational", "maintenance", "faulty", "decommissioned"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  sites: SiteOption[];
  defaultSiteId?: string | null;
}

export default function ScanAssetsDialog({ open, onOpenChange, onImported, sites, defaultSiteId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { categories } = useAssetCategories();
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [siteId, setSiteId] = useState<string>(defaultSiteId || "");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setRows([]); setFileName(""); setScanFile(null); setError("");
    setSiteId(defaultSiteId || "");
  };

  const handleFile = useCallback(async (file: File) => {
    setError("");
    setRows([]);
    setFileName(file.name);
    setScanFile(file);
    setLoading(true);

    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ""));
      const { data, error: fnError } = await supabase.functions.invoke("parse-import-generic", {
        body: { file_base64: base64, file_name: file.name, entity_type: "assets" },
      });
      if (fnError || data?.error) throw new Error(data?.error || fnError?.message || "Failed to scan document.");

      const parsed: Row[] = (data?.records || []).map((r: any) => {
        const rawStatus = String(r.status || "").toLowerCase().trim();
        return {
          name: r.name || r.equipment || r.description || "",
          asset_tag: r.asset_tag || r.tag || r.asset_id || "",
          category: (r.category || "general").toString().toLowerCase().replace(/\s+/g, "_"),
          make: r.make || r.manufacturer || "",
          model: r.model || "",
          serial_number: r.serial_number || r.serial || r.sn || "",
          location_notes: r.location_notes || r.location || r.room || "",
          status: VALID_STATUSES.includes(rawStatus) ? rawStatus : "operational",
        };
      }).filter((r: Row) => r.name.trim());

      if (parsed.length === 0) {
        setError("No assets could be extracted from the scan. Try a clearer image or a different document.");
      } else {
        setRows(parsed);
      }
    } catch (err: any) {
      setError(err.message || "Failed to process scan.");
    } finally {
      setLoading(false);
    }
  }, []);

  const updateRow = (i: number, field: keyof Row, value: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const handleImport = async () => {
    if (!user || rows.length === 0) return;
    setImporting(true);

    // Upload the original scan for the record
    let scanPath: string | null = null;
    if (scanFile) {
      const path = `_scans/${user.id}/${Date.now()}_${scanFile.name.replace(/[^\w.\-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("asset-documents").upload(await buildOrgPathAsync(path), scanFile);
      if (!upErr) scanPath = path;
    }

    const scanTag = scanPath ? `Imported from scan: ${fileName}` : "";

    const payload = rows.map((r) => ({
      name: r.name.trim(),
      asset_tag: r.asset_tag.trim() || null,
      category: r.category.trim() || "general",
      make: r.make.trim() || null,
      model: r.model.trim() || null,
      serial_number: r.serial_number.trim() || null,
      site_id: siteId || null,
      status: VALID_STATUSES.includes(r.status) ? r.status : "operational",
      notes: [r.location_notes.trim(), scanTag].filter(Boolean).join(" — ") || null,
      created_by: user.id,
    }));

    const { data, error: dbError } = await supabase.from("assets").insert(payload).select("id");
    setImporting(false);

    if (dbError) {
      toast({ title: "Import failed", description: dbError.message, variant: "destructive" });
      return;
    }
    toast({ title: "Scan imported", description: `${data?.length ?? 0} asset(s) added${scanPath ? " and scan stored" : ""}.` });
    reset();
    onOpenChange(false);
    onImported();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-6xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" /> Scan Asset List
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            <p className="font-medium">Extracting assets with AI…</p>
            <p className="text-sm text-muted-foreground">{fileName}</p>
          </div>
        ) : rows.length === 0 ? (
          <div
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            onDragOver={(e) => e.preventDefault()}
            className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-muted-foreground/30 p-12 text-center"
          >
            <ScanLine className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Upload a scanned asset schedule</p>
              <p className="text-sm text-muted-foreground">
                Photo (JPG/PNG/HEIC), PDF, or spreadsheet — e.g. extinguisher list, sprinkler schedule, equipment register.
              </p>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />{error}
              </div>
            )}
            <label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,.xlsx,.xls,.csv,.docx"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <Button variant="outline" asChild>
                <span><Upload className="mr-2 h-4 w-4" />Choose File</span>
              </Button>
            </label>
          </div>
        ) : (
          <div className="flex-1 overflow-auto space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">{fileName} — {rows.length} row(s) extracted</span>
              <Button variant="ghost" size="sm" onClick={reset}>Clear</Button>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm">Assign to site:</span>
                <Select value={siteId || "none"} onValueChange={(v) => setSiteId(v === "none" ? "" : v)}>
                  <SelectTrigger className="w-[220px] h-8 text-sm">
                    <SelectValue placeholder="No site" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No site</SelectItem>
                    {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name *</TableHead>
                  <TableHead>Tag</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Make</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Serial</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell><Input value={r.name} onChange={(e) => updateRow(i, "name", e.target.value)} className="h-8 text-sm min-w-[140px]" /></TableCell>
                    <TableCell><Input value={r.asset_tag} onChange={(e) => updateRow(i, "asset_tag", e.target.value)} className="h-8 text-sm w-24" /></TableCell>
                    <TableCell>
                      <Select value={r.category} onValueChange={(v) => updateRow(i, "category", v)}>
                        <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}
                          {!categories.some((c) => c.slug === r.category) && r.category && (
                            <SelectItem value={r.category}>{r.category}</SelectItem>
                          )}
                          <SelectItem value="general">General</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Input value={r.make} onChange={(e) => updateRow(i, "make", e.target.value)} className="h-8 text-sm w-24" /></TableCell>
                    <TableCell><Input value={r.model} onChange={(e) => updateRow(i, "model", e.target.value)} className="h-8 text-sm w-24" /></TableCell>
                    <TableCell><Input value={r.serial_number} onChange={(e) => updateRow(i, "serial_number", e.target.value)} className="h-8 text-sm w-28" /></TableCell>
                    <TableCell><Input value={r.location_notes} onChange={(e) => updateRow(i, "location_notes", e.target.value)} className="h-8 text-sm min-w-[120px]" /></TableCell>
                    <TableCell>
                      <Select value={r.status} onValueChange={(v) => updateRow(i, "status", v)}>
                        <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="operational">Operational</SelectItem>
                          <SelectItem value="maintenance">Maintenance</SelectItem>
                          <SelectItem value="faulty">Faulty</SelectItem>
                          <SelectItem value="decommissioned">Decommissioned</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <button onClick={() => removeRow(i)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {rows.length > 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleImport} disabled={importing || rows.length === 0}>
              {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Import {rows.length} Asset(s)
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
