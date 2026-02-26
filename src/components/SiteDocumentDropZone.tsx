import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FileText, Loader2, Upload, ChevronLeft, ChevronRight } from "lucide-react";

interface ExtractedSite {
  customer_name: string;
  site_name: string;
  site_address: string;
  postcode: string;
  outlets_count: number | null;
  riser_location: string;
  contact_name: string;
  notes: string;
}

interface Props {
  onSiteCreated: () => void;
  disabled?: boolean;
}

export default function SiteDocumentDropZone({ onSiteCreated, disabled }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [sites, setSites] = useState<ExtractedSite[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const toSite = (record: any): ExtractedSite => ({
    customer_name: record.customer_name || "",
    site_name: record.site_name || record.customer_name || "",
    site_address: record.site_address || "",
    postcode: record.postcode || "",
    outlets_count: record.outlets_count != null ? Number(record.outlets_count) : null,
    riser_location: record.riser_location || "",
    contact_name: record.contact_name || "",
    notes: record.notes || "",
  });

  const processFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "doc", "docx"].includes(ext || "")) {
      toast({ title: "Unsupported file", description: "Drop a PDF or Word (.doc/.docx) document.", variant: "destructive" });
      return;
    }
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);
      const { data, error: fnError } = await supabase.functions.invoke("parse-import-generic", {
        body: { file_base64: base64, file_name: file.name, entity_type: "site_document" },
      });
      if (fnError || data?.error) {
        toast({ title: "AI extraction failed", description: fnError?.message || data?.error, variant: "destructive" });
        return;
      }
      let records = data.records;
      if (!Array.isArray(records)) records = records ? [records] : [];
      if (records.length === 0) {
        toast({ title: "Nothing found", description: "The AI couldn't extract site details from this document.", variant: "destructive" });
        return;
      }
      setSites(records.map(toSite));
      setCurrentIndex(0);
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const update = (key: keyof ExtractedSite, value: string | number | null) => {
    setSites((prev) => prev.map((s, i) => i === currentIndex ? { ...s, [key]: value } : s));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const names = sites.map((s) => (s.site_name.trim() || s.customer_name.trim() || "Unnamed Site"));
      const { data: existing } = await supabase.from("sites").select("name").in("name", names);
      const existingNames = new Set((existing || []).map((r: any) => r.name.trim().toLowerCase()));

      const sitesToCreate = sites.filter(
        (s) => !existingNames.has((s.site_name.trim() || s.customer_name.trim() || "Unnamed Site").toLowerCase())
      );
      const skipped = sites.length - sitesToCreate.length;

      if (sitesToCreate.length === 0) {
        toast({ title: "All duplicates", description: `All ${skipped} site${skipped > 1 ? "s" : ""} already exist and were skipped.`, variant: "destructive" });
        setSites([]);
        onSiteCreated();
        return;
      }

      // Insert sites and get back their IDs
      const newRows = sitesToCreate.map((s) => ({
        name: s.site_name.trim() || s.customer_name.trim() || "Unnamed Site",
        address: s.site_address.trim() || null,
        postcode: s.postcode.trim() || null,
        site_type: "site" as const,
        contact_name: s.contact_name.trim() || null,
        outlets_count: s.outlets_count ?? null,
        riser_location: s.riser_location.trim() || null,
        notes: s.notes.trim() || null,
      }));

      const { data: createdSites, error } = await supabase.from("sites").insert(newRows as any).select("id, name");
      if (error || !createdSites) {
        toast({ title: "Save failed", description: error?.message, variant: "destructive" });
        return;
      }

      // Resolve customers by name (find existing or create new)
      const customerNames = [...new Set(sitesToCreate.map((s) => s.customer_name.trim()).filter(Boolean))];
      const customerIdMap = new Map<string, string>();

      if (customerNames.length > 0) {
        const { data: existingCustomers } = await supabase
          .from("customers")
          .select("id, name")
          .in("name", customerNames);

        for (const c of existingCustomers || []) {
          customerIdMap.set(c.name.toLowerCase(), c.id);
        }

        // Create any customers that don't exist yet
        const missing = customerNames.filter((n) => !customerIdMap.has(n.toLowerCase()));
        if (missing.length > 0) {
          const { data: newCustomers } = await supabase
            .from("customers")
            .insert(missing.map((name) => ({ name })))
            .select("id, name");
          for (const c of newCustomers || []) {
            customerIdMap.set(c.name.toLowerCase(), c.id);
          }
        }
      }

      // Create link jobs to associate each site with its customer
      const siteNameToId = new Map(createdSites.map((s: any) => [s.name.toLowerCase(), s.id]));
      const linkJobs = sitesToCreate
        .map((s) => {
          const siteName = s.site_name.trim() || s.customer_name.trim() || "Unnamed Site";
          const siteId = siteNameToId.get(siteName.toLowerCase());
          const customerId = customerIdMap.get(s.customer_name.trim().toLowerCase());
          if (!siteId || !customerId) return null;
          return {
            name: `Site link — ${s.customer_name.trim()}`,
            customer_id: customerId,
            site_id: siteId,
            status: "active" as const,
            priority: "medium" as const,
            category: "general",
          };
        })
        .filter(Boolean);

      if (linkJobs.length > 0) {
        await supabase.from("jobs").insert(linkJobs as any);
      }

      const msg = skipped > 0 ? `${skipped} duplicate${skipped > 1 ? "s" : ""} skipped.` : undefined;
      toast({ title: `${createdSites.length} site${createdSites.length > 1 ? "s" : ""} created`, description: msg });
      setSites([]);
      onSiteCreated();
    } finally {
      setSaving(false);
    }
  };

  const form = sites[currentIndex] ?? null;
  const isOpen = sites.length > 0;

  return (
    <>
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && fileRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors
          ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          disabled={disabled}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }}
        />
        {parsing ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Extracting site details with AI…</p>
          </>
        ) : (
          <>
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Drop a PDF or Word document here</p>
            <p className="text-xs text-muted-foreground">AI will extract each system's address, outlets & riser location</p>
            <Button variant="outline" size="sm" className="mt-1 pointer-events-none gap-2">
              <Upload className="h-3.5 w-3.5" /> Browse file
            </Button>
          </>
        )}
      </div>

      {/* Review dialog */}
      <Dialog open={isOpen} onOpenChange={(v) => { if (!v) setSites([]); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Extracted Site Details</DialogTitle>
            <DialogDescription>
              {sites.length > 1
                ? `${sites.length} systems found. Review each before saving.`
                : "AI extracted the following details. Review and edit before saving."}
            </DialogDescription>
          </DialogHeader>

          {/* Pagination if multiple systems */}
          {sites.length > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground border rounded-md px-3 py-1.5">
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={currentIndex === 0} onClick={() => setCurrentIndex((i) => i - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>System {currentIndex + 1} of {sites.length}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={currentIndex === sites.length - 1} onClick={() => setCurrentIndex((i) => i + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {form && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Customer Name</Label>
                  <Input value={form.customer_name} onChange={(e) => update("customer_name", e.target.value)} placeholder="Customer name" />
                </div>
                <div className="space-y-1">
                  <Label>Site Name</Label>
                  <Input value={form.site_name} onChange={(e) => update("site_name", e.target.value)} placeholder="Site name" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Site Address</Label>
                <Input value={form.site_address} onChange={(e) => update("site_address", e.target.value)} placeholder="Full address" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Postcode</Label>
                  <Input value={form.postcode} onChange={(e) => update("postcode", e.target.value)} placeholder="Postcode" />
                </div>
                <div className="space-y-1">
                  <Label>Contact Name</Label>
                  <Input value={form.contact_name} onChange={(e) => update("contact_name", e.target.value)} placeholder="Contact person" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Number of Outlets</Label>
                  <Input
                    type="number"
                    value={form.outlets_count ?? ""}
                    onChange={(e) => update("outlets_count", e.target.value ? Number(e.target.value) : null)}
                    placeholder="e.g. 12"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Riser Location</Label>
                  <Input value={form.riser_location} onChange={(e) => update("riser_location", e.target.value)} placeholder="e.g. Floor 2, east stairwell" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={3} placeholder="Any additional notes…" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSites([])}>Cancel</Button>
            <Button onClick={handleSaveAll} disabled={saving} className="gap-2">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : `Create ${sites.length} Site${sites.length > 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
