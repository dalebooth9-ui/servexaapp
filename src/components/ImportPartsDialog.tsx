import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, FileText, Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ParsedPart {
  name: string;
  quantity: number;
  unit_cost: number; // China / purchase cost
  sell_price: number; // UK / sell price
  notes: string;
  selected: boolean;
}

export default function ImportPartsDialog({
  open,
  onOpenChange,
  jobId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  onImported: () => void;
}) {
  const { user, userRole } = useAuth();
  const isAdmin = userRole === "admin";
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parts, setParts] = useState<ParsedPart[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setParts([]);
    }
  };

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), "")
      );

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-import-parts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ file_base64: base64, file_name: file.name }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Parse failed" }));
        throw new Error(err.error || "Failed to parse document");
      }

      const { parts: parsed } = await res.json();
      setParts(
        (parsed || []).map((p: any) => {
          // Preserve quantity 0 exactly (don't fall back to 1) — a row showing
          // 0 in the source sheet is intentionally empty for this job.
          const rawQty = p.quantity;
          const qty =
            rawQty == null || rawQty === ""
              ? 0
              : Number.isFinite(parseFloat(rawQty))
                ? parseFloat(rawQty)
                : 0;

          // Per-unit prices: prefer the explicit china_cost / uk_cost pair
          // returned by parse-costing-sheet. Fall back to legacy single-price
          // fields when the parser only knew one column.
          const num = (v: any) => {
            if (v == null || v === "") return NaN;
            const n = parseFloat(String(v).replace(/[£$,\s]/g, ""));
            return Number.isFinite(n) ? n : NaN;
          };
          const china =
            [p.china_cost, p.unit_cost, p.cost, p.purchase_cost]
              .map(num)
              .find((n) => Number.isFinite(n) && n >= 0) ?? 0;
          const uk =
            [p.uk_cost, p.sell_price, p.price, p.unit_price]
              .map(num)
              .find((n) => Number.isFinite(n) && n >= 0) ?? 0;
          // If only one side came back, mirror it so the row still imports.
          const purchase = china > 0 ? china : uk;
          const sell = uk > 0 ? uk : china;

          return {
            name: p.name || p.part || p.material || "",
            quantity: qty,
            unit_cost: purchase,
            sell_price: sell,
            notes: p.notes || p.description || "",
            selected: true,
          };
        })
      );
    } catch (err: any) {
      toast({ title: "Parse Error", description: err.message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  const toggleAll = (checked: boolean) => {
    setParts((prev) => prev.map((p) => ({ ...p, selected: checked })));
  };

  const toggleOne = (idx: number) => {
    setParts((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, selected: !p.selected } : p))
    );
  };

  const updatePart = (idx: number, field: keyof ParsedPart, value: any) => {
    setParts((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    );
  };

  const removePart = (idx: number) => {
    setParts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleImport = async () => {
    if (!user) return;
    const selected = parts.filter((p) => p.selected && p.name.trim());
    if (selected.length === 0) {
      toast({ title: "No parts selected", variant: "destructive" });
      return;
    }
    setImporting(true);
    const rows = selected.map((p) => ({
      job_id: jobId,
      name: p.name.trim(),
      // Preserve qty 0 — only coerce truly invalid values (NaN) to 0.
      quantity: Number.isFinite(p.quantity) ? p.quantity : 0,
      unit_cost: Number.isFinite(p.unit_cost) ? p.unit_cost : 0,
      notes: p.notes.trim() || null,
      added_by: user.id,
    }));

    const { error } = await supabase.from("job_parts" as any).insert(rows as any);
    if (error) {
      toast({ title: "Import Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${selected.length} part(s) imported` });
      onImported();
      onOpenChange(false);
      setParts([]);
      setFile(null);
    }
    setImporting(false);
  };

  const allSelected = parts.length > 0 && parts.every((p) => p.selected);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Parts from Document</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File picker */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.csv,.xlsx,.xls,.txt"
                onChange={handleFileChange}
              />
            </div>
            <Button onClick={handleParse} disabled={!file || parsing} size="sm">
              {parsing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-1 h-4 w-4" />
              )}
              {parsing ? "Parsing…" : "Extract Parts"}
            </Button>
          </div>

          {file && !parsing && parts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Upload a document containing a parts/materials list, then click Extract Parts to parse it with AI.
            </p>
          )}

          {/* Preview table */}
          {parts.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground">
                {parts.filter((p) => p.selected).length} of {parts.length} parts selected. Edit values inline before importing.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead>Part / Material</TableHead>
                     <TableHead className="w-20 text-right">Qty</TableHead>
                     {isAdmin && <TableHead className="w-24 text-right">Unit £</TableHead>}
                     <TableHead>Notes</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parts.map((part, idx) => (
                    <TableRow key={idx} className={part.selected ? "" : "opacity-50"}>
                      <TableCell>
                        <Checkbox checked={part.selected} onCheckedChange={() => toggleOne(idx)} />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={part.name}
                          onChange={(e) => updatePart(idx, "name", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </TableCell>
                       <TableCell>
                         <Input
                           type="number"
                           value={part.quantity}
                           onChange={(e) => updatePart(idx, "quantity", parseFloat(e.target.value) || 0)}
                           className="h-8 text-sm text-right w-20"
                           min="0"
                         />
                       </TableCell>
                       {isAdmin && (
                       <TableCell>
                         <Input
                           type="number"
                           value={part.unit_cost}
                           onChange={(e) => updatePart(idx, "unit_cost", parseFloat(e.target.value) || 0)}
                           className="h-8 text-sm text-right w-24"
                           min="0"
                           step="0.01"
                         />
                       </TableCell>
                       )}
                      <TableCell>
                        <Input
                          value={part.notes}
                          onChange={(e) => updatePart(idx, "notes", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <button onClick={() => removePart(idx)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </div>

        {parts.length > 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={importing || parts.filter((p) => p.selected).length === 0}>
              {importing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
              Import {parts.filter((p) => p.selected).length} Parts
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
