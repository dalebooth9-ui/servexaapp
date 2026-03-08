import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { readExcelFile } from "@/lib/excelUtils";

type ParsedJob = {
  customer: string;
  name: string;
  reference_number: string;
  address: string;
  priority: string;
  category: string;
};

function normalizeRows(rows: string[][]): ParsedJob[] {
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.toLowerCase().trim().replace(/[^\w\s]/g, ""));

  const aliases: Record<string, string[]> = {
    customer: ["customer", "client", "company"],
    name: ["name", "job name", "job_name", "jobname", "title", "description", "drop"],
    reference_number: ["reference_number", "reference", "ref", "ref_number", "ref no", "ref number", "reference number"],
    address: ["address", "location", "site", "site address"],
    priority: ["priority", "prio"],
    category: ["category", "cat", "type"],
  };

  const fieldMap: Record<string, number> = {};
  for (const [field, names] of Object.entries(aliases)) {
    const idx = headers.findIndex((h) => names.includes(h));
    if (idx !== -1) fieldMap[field] = idx;
  }

  const jobs: ParsedJob[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (cols.every((c) => !c.trim())) continue;

    jobs.push({
      customer: cols[fieldMap.customer] || "",
      name: cols[fieldMap.name] || "",
      reference_number: cols[fieldMap.reference_number] || "",
      address: cols[fieldMap.address] || "",
      priority: cols[fieldMap.priority] || "medium",
      category: cols[fieldMap.category] || "general",
    });
  }
  return jobs;
}

function parseCSV(text: string): string[][] {
  // Strip BOM (common in SharePoint exports)
  const clean = text.replace(/^\uFEFF/, "");
  // Detect delimiter: semicolon (SharePoint EU) vs comma
  const firstLine = clean.split(/\r?\n/)[0] || "";
  const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";

  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line) => parseCSVLine(line, delimiter));
}

// parseExcel is replaced by readExcelFile from excelUtils

function parseCSVLine(line: string, delimiter = ","): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}



interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export default function BulkImportDialog({ open, onOpenChange, onImported }: BulkImportDialogProps) {
  const [parsed, setParsed] = useState<ParsedJob[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();


  const handleFile = useCallback(async (file: File): Promise<ParsedJob[]> => {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

    if (ext === ".xlsx" || ext === ".xls") {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const buffer = e.target?.result as ArrayBuffer;
          resolve(normalizeRows(parseExcel(buffer)));
        };
        reader.readAsArrayBuffer(file);
      });
    } else if (ext === ".pdf" || ext === ".docx" || ext === ".doc") {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );
      const { data, error: fnError } = await supabase.functions.invoke("parse-import-document", {
        body: { file_base64: base64, file_name: file.name },
      });
      if (fnError || data?.error) {
        const errMsg = data?.error || "Failed to parse document.";
        if (errMsg.includes("Rate limit")) {
          toast({ title: "Rate limit exceeded", description: "Please wait a moment and try again.", variant: "destructive" });
        } else if (errMsg.includes("credits exhausted")) {
          toast({ title: "Credits exhausted", description: "AI credits have been used up. Please add funds to continue.", variant: "destructive" });
        }
        throw new Error(errMsg);
      }
      if (data?.jobs) {
        return data.jobs.map((j: any) => ({
          customer: j.customer || "",
          name: j.name || "",
          reference_number: j.reference_number || "",
          address: j.address || "",
          priority: j.priority || "medium",
          category: j.category || "general",
        }));
      }
      return [];
    } else {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          resolve(normalizeRows(parseCSV(text)));
        };
        reader.readAsText(file);
      });
    }
  }, [toast]);

  const handleFiles = useCallback(async (files: File[]) => {
    setError("");
    setParsed([]);
    setFileName(files.map((f) => f.name).join(", "));
    setImporting(true);

    const allJobs: ParsedJob[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const jobs = await handleFile(file);
        allJobs.push(...jobs);
      } catch (err: any) {
        errors.push(`${file.name}: ${err.message}`);
      }
    }

    if (allJobs.length === 0 && errors.length > 0) {
      setError(errors.join("; "));
    } else if (allJobs.length === 0) {
      setError("No valid rows found. Make sure your files have headers: Customer, Name, Reference Number, Address, Priority, Category");
    } else {
      const incomplete = allJobs.filter((j) => !j.name || !j.reference_number);
      const msgs: string[] = [];
      if (incomplete.length > 0) {
        msgs.push(`${incomplete.length} row(s) missing Name or Reference Number — defaults will be generated.`);
      }
      if (errors.length > 0) msgs.push(...errors);
      if (msgs.length > 0) setError(msgs.join(" "));
      setParsed(allJobs);
    }
    setImporting(false);
  }, [handleFile]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) handleFiles(files);
    },
    [handleFiles]
  );

  const handleImport = async () => {
    if (parsed.length === 0) return;

    setImporting(true);
    const { data, error: fnError } = await supabase.functions.invoke("bulk-import-jobs", {
      body: { jobs: parsed },
    });
    setImporting(false);

    if (fnError || data?.error) {
      toast({ title: "Import failed", description: data?.error || "Something went wrong.", variant: "destructive" });
    } else {
      toast({ title: "Import complete", description: `${data.imported} job(s) imported successfully.` });
      setParsed([]);
      setFileName("");
      onOpenChange(false);
      onImported();
    }
  };

  const totalCount = parsed.length;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) { setParsed([]); setFileName(""); setError(""); }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Import Jobs</DialogTitle>
        </DialogHeader>

        {parsed.length === 0 && importing ? (
          <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            <p className="font-medium">Parsing document with AI…</p>
            <p className="text-sm text-muted-foreground">Extracting job data from {fileName}</p>
          </div>
        ) : parsed.length === 0 ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-muted-foreground/30 p-12 text-center"
          >
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Drop file(s) here</p>
              <p className="text-sm text-muted-foreground">
                Supports CSV, Excel, Word, and PDF — multiple files allowed
              </p>
              <p className="text-sm text-muted-foreground">
                Columns: Customer, Name, Reference Number, Address, Priority, Category
              </p>
              <p className="text-sm text-muted-foreground">
                Missing Name or Reference Number will be auto-generated
              </p>
            </div>
            <label>
              <input
                type="file"
                accept=".csv,.txt,.xlsx,.xls,.docx,.doc,.pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) handleFiles(files);
                }}
              />
              <Button variant="outline" asChild>
                <span><Upload className="mr-2 h-4 w-4" /> Choose File</span>
              </Button>
            </label>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {fileName} — {totalCount} row(s)
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setParsed([]); setFileName(""); setError(""); }}
              >
                Clear
              </Button>
            </div>

            {error && (
              <div className="mb-3 flex items-center gap-2 rounded bg-destructive/10 p-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.slice(0, 50).map((job, i) => {
                  const incomplete = !job.name || !job.reference_number;
                  return (
                    <TableRow key={i} className={incomplete ? "bg-muted/50" : ""}>
                      <TableCell>{job.customer || "—"}</TableCell>
                      <TableCell className="font-medium">{job.name || <span className="text-muted-foreground italic">Auto-generated</span>}</TableCell>
                      <TableCell>{job.reference_number || <span className="text-muted-foreground italic">Auto-generated</span>}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{job.address || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{job.priority}</Badge>
                      </TableCell>
                      <TableCell>{job.category}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {parsed.length > 50 && (
              <p className="mt-2 text-center text-sm text-muted-foreground">
                Showing first 50 of {parsed.length} rows
              </p>
            )}
          </div>
        )}

        {parsed.length > 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleImport} disabled={importing || totalCount === 0}>
              {importing ? "Importing…" : `Import ${totalCount} Job(s)`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
