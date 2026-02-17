import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type ParsedJob = {
  customer: string;
  name: string;
  reference_number: string;
  address: string;
  priority: string;
  category: string;
};

function parseCSV(text: string): ParsedJob[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map((h) => h.toLowerCase().trim());

  // Map headers to fields
  const fieldMap: Record<string, string> = {};
  const aliases: Record<string, string[]> = {
    customer: ["customer", "client", "company"],
    name: ["name", "job name", "job_name", "jobname", "title", "description", "drop"],
    reference_number: ["reference_number", "reference", "ref", "ref_number", "ref no", "ref number", "reference number"],
    address: ["address", "location", "site", "site address"],
    priority: ["priority", "prio"],
    category: ["category", "cat", "type"],
  };

  for (const [field, names] of Object.entries(aliases)) {
    const idx = headers.findIndex((h) => names.includes(h));
    if (idx !== -1) fieldMap[field] = String(idx);
  }

  const jobs: ParsedJob[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.every((c) => !c.trim())) continue;

    jobs.push({
      customer: cols[Number(fieldMap.customer)] || "",
      name: cols[Number(fieldMap.name)] || "",
      reference_number: cols[Number(fieldMap.reference_number)] || "",
      address: cols[Number(fieldMap.address)] || "",
      priority: cols[Number(fieldMap.priority)] || "medium",
      category: cols[Number(fieldMap.category)] || "general",
    });
  }
  return jobs;
}

function parseCSVLine(line: string): string[] {
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
      } else if (ch === ",") {
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

  const handleFile = useCallback((file: File) => {
    setError("");
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const jobs = parseCSV(text);
      if (jobs.length === 0) {
        setError("No valid rows found. Make sure your CSV has headers: Customer, Name, Reference Number, Address, Priority, Category");
        setParsed([]);
      } else {
        const invalid = jobs.filter((j) => !j.name || !j.reference_number);
        if (invalid.length > 0) {
          setError(`${invalid.length} row(s) missing required Name or Reference Number.`);
        }
        setParsed(jobs);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleImport = async () => {
    const valid = parsed.filter((j) => j.name && j.reference_number);
    if (valid.length === 0) return;

    setImporting(true);
    const { data, error: fnError } = await supabase.functions.invoke("bulk-import-jobs", {
      body: { jobs: valid },
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

  const validCount = parsed.filter((j) => j.name && j.reference_number).length;

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

        {parsed.length === 0 ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-muted-foreground/30 p-12 text-center"
          >
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Drop a CSV file here</p>
              <p className="text-sm text-muted-foreground">
                Required columns: <strong>Name</strong>, <strong>Reference Number</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                Optional: Customer, Address, Priority, Category
              </p>
            </div>
            <label>
              <input
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
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
                {fileName} — {validCount} valid row(s)
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
                  const valid = job.name && job.reference_number;
                  return (
                    <TableRow key={i} className={valid ? "" : "opacity-50"}>
                      <TableCell>{job.customer || "—"}</TableCell>
                      <TableCell className="font-medium">{job.name || <span className="text-destructive">Missing</span>}</TableCell>
                      <TableCell>{job.reference_number || <span className="text-destructive">Missing</span>}</TableCell>
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
            <Button onClick={handleImport} disabled={importing || validCount === 0}>
              {importing ? "Importing…" : `Import ${validCount} Job(s)`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
