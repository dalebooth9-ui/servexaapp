import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileSpreadsheet, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { readExcelFile } from "@/lib/excelUtils";

interface ParsedSite {
  name: string;
  address: string;
  postcode: string;
  site_type: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  isDuplicate?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

function parseCSVLine(line: string): string[] {
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
      else if (ch === "," || ch === "\t") { result.push(current.trim()); current = ""; }
      else current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeHeader(h: string): string {
  const lower = h.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (lower.includes("name") && !lower.includes("contact")) return "name";
  if (lower.includes("address") && !lower.includes("email")) return "address";
  if (lower.includes("postcode") || lower.includes("zipcode") || lower.includes("zip") || lower.includes("post")) return "postcode";
  if (lower.includes("type")) return "site_type";
  if (lower.includes("contactname") || lower === "contact") return "contact_name";
  if (lower.includes("phone") || lower.includes("tel") || lower.includes("mobile")) return "contact_phone";
  if (lower.includes("email")) return "contact_email";
  return "";
}

function parseRowsFromText(text: string): ParsedSite[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(normalizeHeader);
  const sites: ParsedSite[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const site: ParsedSite = { name: "", address: "", postcode: "", site_type: "site", contact_name: "", contact_phone: "", contact_email: "" };
    headers.forEach((h, idx) => {
      if (h && cols[idx]) (site as any)[h] = cols[idx];
    });
    if (site.name.trim()) sites.push(site);
  }
  return sites;
}

function parseRowsFromStringArray(rows: string[][]): ParsedSite[] {
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => normalizeHeader(String(h || "")));
  const sites: ParsedSite[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i] || [];
    const site: ParsedSite = { name: "", address: "", postcode: "", site_type: "site", contact_name: "", contact_phone: "", contact_email: "" };
    headers.forEach((h, idx) => {
      if (h && cols[idx] != null) (site as any)[h] = String(cols[idx]);
    });
    if (site.name.trim()) sites.push(site);
  }
  return sites;
}

export default function BulkImportSitesDialog({ open, onOpenChange, onImported }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasteText, setPasteText] = useState("");
  const [parsed, setParsed] = useState<ParsedSite[]>([]);
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<"input" | "preview">("input");

  const reset = () => {
    setPasteText("");
    setParsed([]);
    setStep("input");
  };

  const checkDuplicates = async (sites: ParsedSite[]): Promise<ParsedSite[]> => {
    const names = sites.map((s) => s.name.trim().toLowerCase());
    const { data: existing } = await supabase.from("sites").select("name").in("name", sites.map((s) => s.name.trim()));
    const existingNames = new Set((existing || []).map((s: any) => s.name.trim().toLowerCase()));
    // Also flag within-batch duplicates
    const seenInBatch = new Set<string>();
    return sites.map((s) => {
      const key = s.name.trim().toLowerCase();
      const isDuplicate = existingNames.has(key) || seenInBatch.has(key);
      seenInBatch.add(key);
      return { ...s, isDuplicate };
    });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "csv" || ext === "tsv" || ext === "txt") {
      const text = await file.text();
      const sites = parseRowsFromText(text);
      if (sites.length === 0) {
        toast({ title: "No sites found", description: "Check your file has a header row with Name and Address columns.", variant: "destructive" });
        return;
      }
      setParsed(await checkDuplicates(sites));
      setStep("preview");
    } else if (ext === "xlsx" || ext === "xls") {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sites = parseRowsFromWorkbook(wb);
      if (sites.length === 0) {
        toast({ title: "No sites found", description: "Check your file has a header row with Name and Address columns.", variant: "destructive" });
        return;
      }
      setParsed(await checkDuplicates(sites));
      setStep("preview");
    } else if (ext === "pdf" || ext === "doc" || ext === "docx") {
      setImporting(true);
      try {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        const base64 = btoa(binary);

        const { data, error: fnError } = await supabase.functions.invoke("parse-import-generic", {
          body: { file_base64: base64, file_name: file.name, entity_type: "site_document" },
        });
        if (fnError || data?.error) {
          toast({ title: "AI parsing failed", description: fnError?.message || data?.error, variant: "destructive" });
        } else {
          // site_document returns sites with nested systems — flatten into ParsedSite rows
          const rawRecords: any[] = Array.isArray(data.records) ? data.records : data.records ? [data.records] : [];
          const records: ParsedSite[] = [];

          for (const site of rawRecords) {
            const systems: any[] = Array.isArray(site.systems) && site.systems.length > 0 ? site.systems : [{ system_name: "Main System" }];
            const siteName = (site.site_name || site.customer_name || "").trim();
            if (!siteName) continue;

            if (systems.length === 1) {
              // Single system → one flat site record
              records.push({
                name: siteName,
                address: site.site_address || "",
                postcode: site.postcode || "",
                site_type: "site",
                contact_name: site.contact_name || "",
                contact_phone: "",
                contact_email: "",
              });
            } else {
              // Multiple systems → parent site + child building per system
              records.push({
                name: siteName,
                address: site.site_address || "",
                postcode: site.postcode || "",
                site_type: "site",
                contact_name: site.contact_name || "",
                contact_phone: "",
                contact_email: "",
              });
              for (const sys of systems) {
                records.push({
                  name: `${siteName} — ${sys.system_name || "System"}`,
                  address: site.site_address || "",
                  postcode: site.postcode || "",
                  site_type: "building",
                  contact_name: "",
                  contact_phone: "",
                  contact_email: "",
                });
              }
            }
          }

          if (records.length === 0) {
            toast({ title: "No sites found", description: "The AI couldn't find any site records in this document.", variant: "destructive" });
          } else {
            setParsed(await checkDuplicates(records));
            setStep("preview");
          }
        }
      } finally {
        setImporting(false);
      }
    } else {
      toast({ title: "Unsupported file", description: "Use CSV, TSV, XLS, XLSX, PDF, DOC or DOCX.", variant: "destructive" });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleParse = async () => {
    const sites = parseRowsFromText(pasteText);
    if (sites.length === 0) {
      toast({ title: "No sites found", description: "Paste data with headers: Name, Address, Postcode (comma or tab separated).", variant: "destructive" });
      return;
    }
    setParsed(await checkDuplicates(sites));
    setStep("preview");
  };

  const removeSite = (idx: number) => {
    setParsed((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateType = (idx: number, type: string) => {
    setParsed((prev) => prev.map((s, i) => i === idx ? { ...s, site_type: type } : s));
  };

  const handleImport = async () => {
    const toImport = parsed.filter((s) => !s.isDuplicate);
    if (toImport.length === 0) {
      toast({ title: "Nothing to import", description: "All sites are duplicates. Remove them or they will be skipped.", variant: "destructive" });
      return;
    }
    setImporting(true);

    const payload = toImport.map((s) => ({
      name: s.name.trim(),
      address: s.address.trim() || null,
      postcode: s.postcode.trim() || null,
      site_type: s.site_type || "site",
      contact_name: s.contact_name.trim() || null,
      contact_phone: s.contact_phone.trim() || null,
      contact_email: s.contact_email.trim() || null,
    }));

    const { error, data } = await supabase.from("sites").insert(payload as any).select("id");
    if (error) {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    } else {
      const skipped = parsed.length - toImport.length;
      toast({ title: "Sites imported", description: `${data?.length || toImport.length} sites added${skipped > 0 ? `, ${skipped} duplicate(s) skipped` : ""}.` });
      onImported();
      onOpenChange(false);
      reset();
    }
    setImporting(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Import Sites</DialogTitle>
          <DialogDescription>
            Upload a CSV, Excel, PDF or Word file, or paste data. AI will extract sites from documents automatically. Required: <strong>Name</strong>. Optional: Address, Postcode, Type, Contact Name, Phone, Email.
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-4 pt-2">
            {/* File upload */}
            <div>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.pdf,.doc,.docx" className="hidden" onChange={handleFile} />
              <Button variant="outline" className="w-full gap-2" onClick={() => fileRef.current?.click()} disabled={importing}>
                {importing ? <><Loader2 className="h-4 w-4 animate-spin" /> Parsing with AI...</> : <><FileSpreadsheet className="h-4 w-4" /> Upload CSV / Excel / PDF / Word</>}
              </Button>
            </div>

            <div className="relative flex items-center">
              <div className="flex-1 border-t border-border" />
              <span className="px-3 text-xs text-muted-foreground">or paste data</span>
              <div className="flex-1 border-t border-border" />
            </div>

            {/* Paste area */}
            <Textarea
              placeholder={"Name, Address, Postcode\nManchester Office, 123 High St, M1 1AA\nBirmingham Depot, 456 Oak Rd, B1 2BB"}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={8}
              className="font-mono text-xs"
            />
            <Button onClick={handleParse} disabled={!pasteText.trim()} className="w-full gap-2">
              <Upload className="h-4 w-4" /> Parse Data
            </Button>
          </div>
        )}

        {step === "preview" && (
        <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{parsed.length} site(s) ready to import. Review and edit before importing.</p>
              {parsed.some((s) => s.isDuplicate) && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  {parsed.filter((s) => s.isDuplicate).length} duplicate(s) will be skipped
                </span>
              )}
            </div>
            <div className="max-h-[400px] overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Postcode</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.map((site, idx) => (
                    <TableRow key={idx} className={site.isDuplicate ? "opacity-60" : ""}>
                      <TableCell className="font-medium text-sm">
                        <TooltipProvider>
                          <div className="flex items-center gap-1.5">
                            {site.isDuplicate && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent>Duplicate — will be skipped</TooltipContent>
                              </Tooltip>
                            )}
                            <span className={site.isDuplicate ? "text-muted-foreground line-through" : ""}>{site.name}</span>
                          </div>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{site.address || "—"}</TableCell>
                      <TableCell className="text-sm font-mono">{site.postcode || "—"}</TableCell>
                      <TableCell>
                        <Select value={site.site_type} onValueChange={(v) => updateType(idx, v)}>
                          <SelectTrigger className="h-7 w-[100px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="region">Region</SelectItem>
                            <SelectItem value="site">Site</SelectItem>
                            <SelectItem value="building">Building</SelectItem>
                            <SelectItem value="zone">Zone</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <button onClick={() => removeSite(idx)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} className="flex-1">Back</Button>
              <Button onClick={handleImport} disabled={parsed.length === 0 || importing} className="flex-1 gap-2">
                {importing ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing...</> : `Import ${parsed.length} Site(s)`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
