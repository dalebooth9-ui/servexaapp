import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Sparkles, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface ExtractedPO {
  customer_name?: string;
  contact_name?: string;
  address?: string;
  po_number?: string;
  job_description?: string;
  due_date?: string;
  priority?: string;
  total_value?: number | null;
  currency?: string;
  notes?: string;
}

interface PoImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  onJobCreated: () => void;
}

export default function PoImportDialog({ open, onOpenChange, file, onJobCreated }: PoImportDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedPO | null>(null);

  // Editable form state pre-filled from extraction
  const [form, setForm] = useState({
    name: "",
    reference_number: "",
    customer_id: "",
    customer_name_raw: "",
    address: "",
    priority: "medium",
    category: "general",
    due_date: "",
    notes: "",
  });

  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    supabase.from("customers").select("id, name").order("name").then(({ data }) => {
      setCustomers(data || []);
    });
  }, []);

  // Parse the file when dialog opens with a file
  useEffect(() => {
    if (!open || !file) return;
    setExtracted(null);
    setParseError(null);
    parseFile(file);
  }, [open, file]);

  const parseFile = async (f: File) => {
    setParsing(true);
    setParseError(null);
    try {
      const base64 = await fileToBase64(f);
      const { data, error } = await supabase.functions.invoke("parse-po-document", {
        body: { file_base64: base64, file_name: f.name },
      });
      if (error) throw new Error(error.message || "Failed to parse document");
      if (data?.error) throw new Error(data.error);

      const ext: ExtractedPO = data?.data || {};
      setExtracted(ext);

      // Try to match customer by name
      const matchedCustomer = customers.find(
        (c) => c.name.toLowerCase() === (ext.customer_name || "").toLowerCase()
      );

      setForm({
        name: ext.job_description || ext.po_number || f.name.replace(/\.[^.]+$/, ""),
        reference_number: ext.po_number || "",
        customer_id: matchedCustomer?.id || "",
        customer_name_raw: ext.customer_name || "",
        address: ext.address || "",
        priority: ["high", "medium", "low"].includes(ext.priority || "") ? ext.priority! : "medium",
        category: "general",
        due_date: ext.due_date || "",
        notes: ext.notes || "",
      });
    } catch (err: any) {
      setParseError(err.message || "Failed to parse document");
    } finally {
      setParsing(false);
    }
  };

  const handleCreate = async () => {
    if (!user) return;
    if (!form.name.trim()) {
      toast({ title: "Job name required", variant: "destructive" });
      return;
    }
    setCreating(true);

    // Resolve customer
    let customerId = form.customer_id || null;
    let customerName: string | null = null;

    if (customerId) {
      customerName = customers.find((c) => c.id === customerId)?.name || null;
    } else if (form.customer_name_raw.trim()) {
      // Create new customer if not matched
      const existing = customers.find(
        (c) => c.name.toLowerCase() === form.customer_name_raw.trim().toLowerCase()
      );
      if (existing) {
        customerId = existing.id;
        customerName = existing.name;
      } else {
        const { data: newCust } = await supabase
          .from("customers")
          .insert({ name: form.customer_name_raw.trim(), created_by: user.id } as any)
          .select("id, name")
          .single();
        if (newCust) {
          customerId = newCust.id;
          customerName = newCust.name;
        }
      }
    }

    const { data: newJob, error } = await supabase
      .from("jobs")
      .insert({
        name: form.name.trim(),
        ...(form.reference_number.trim() ? { reference_number: form.reference_number.trim() } : {}),
        customer_id: customerId,
        customer: customerName,
        address: form.address.trim() || null,
        priority: form.priority,
        category: form.category,
        due_date: form.due_date || null,
        created_by: user.id,
      } as any)
      .select("id, reference_number")
      .single();

    if (error || !newJob) {
      const message =
        error?.code === "23505"
          ? "A job with this reference number already exists."
          : "Failed to create job.";
      toast({ title: "Error", description: message, variant: "destructive" });
      setCreating(false);
      return;
    }

    // Upload the original PO file as a submission
    if (file) {
      const filePath = `${newJob.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("submissions").upload(filePath, file);
      if (!upErr) {
        const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(filePath);
        await supabase.from("submissions").insert({
          job_id: newJob.id,
          engineer_id: user.id,
          type: "document",
          file_url: urlData.publicUrl,
          file_name: file.name,
        } as any);
      }
    }

    toast({
      title: "Job created from PO",
      description: `"${form.name.trim()}" created (${newJob.reference_number})`,
    });
    setCreating(false);
    onOpenChange(false);
    onJobCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Create Job from Purchase Order
          </DialogTitle>
        </DialogHeader>

        {/* File name pill */}
        {file && (
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-muted-foreground">{file.name}</span>
          </div>
        )}

        {/* Parsing state */}
        {parsing && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Reading purchase order…</p>
            <p className="text-xs text-muted-foreground">AI is extracting job details</p>
          </div>
        )}

        {/* Parse error */}
        {parseError && !parsing && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{parseError}</span>
          </div>
        )}

        {/* Extracted fields preview */}
        {extracted && !parsing && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground text-sm mb-1">Extracted from document</p>
            {extracted.customer_name && <p><span className="font-medium">Customer:</span> {extracted.customer_name}</p>}
            {extracted.po_number && <p><span className="font-medium">PO Number:</span> {extracted.po_number}</p>}
            {extracted.address && <p><span className="font-medium">Address:</span> {extracted.address}</p>}
            {extracted.total_value != null && (
              <p><span className="font-medium">Value:</span> {extracted.currency || ""}{extracted.total_value?.toLocaleString()}</p>
            )}
            {extracted.due_date && <p><span className="font-medium">Due:</span> {extracted.due_date}</p>}
          </div>
        )}

        {/* Editable form */}
        {!parsing && (extracted || parseError) && (
          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label>Job Name <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Dry riser inspection at site"
              />
            </div>

            <div className="space-y-2">
              <Label>PO / Reference Number</Label>
              <Input
                value={form.reference_number}
                onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
                placeholder="Auto-generated if left blank"
              />
            </div>

            <div className="space-y-2">
              <Label>Customer</Label>
              <Select
                value={form.customer_id || "__none__"}
                onValueChange={(v) =>
                  setForm({ ...form, customer_id: v === "__none__" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select or create customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No customer</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!form.customer_id && form.customer_name_raw && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Badge variant="secondary" className="text-xs py-0">New</Badge>
                  "{form.customer_name_raw}" will be created as a new customer
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Site or delivery address"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
            </div>

            {extracted?.notes && (
              <div className="space-y-2">
                <Label>Notes (from PO)</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="resize-none"
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={parsing || creating || (!extracted && !parseError)}
          >
            {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…</> : "Create Job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
