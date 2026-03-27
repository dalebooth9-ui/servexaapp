import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FileText, Loader2, Upload, ChevronLeft, ChevronRight, Layers, UserCheck, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ── Fuzzy matching ────────────────────────────────────────────────────────────
function normalise(s: string) {
  return s
    .toLowerCase()
    .replace(/\b(ltd|limited|plc|inc|co|the|and|&)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalise(a);
  const nb = normalise(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  // Bigram overlap
  const bigrams = (s: string) => {
    const arr: string[] = [];
    for (let i = 0; i < s.length - 1; i++) arr.push(s.slice(i, i + 2));
    return new Set(arr);
  };
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let common = 0;
  ba.forEach((g) => { if (bb.has(g)) common++; });
  return (2 * common) / (ba.size + bb.size) || 0;
}

interface ExistingCustomer { id: string; name: string }

// Returns closest match above threshold (0.6), or null
function bestMatch(name: string, customers: ExistingCustomer[]): ExistingCustomer | null {
  let best: ExistingCustomer | null = null;
  let bestScore = 0.6; // minimum threshold
  for (const c of customers) {
    const score = similarity(name, c.name);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ExtractedSystem {
  system_name: string;
  outlets_count: number | null;
  riser_location: string;
  notes: string;
}

interface ExtractedSite {
  customer_name: string;
  site_name: string;
  site_address: string;
  postcode: string;
  contact_name: string;
  notes: string;
  systems: ExtractedSystem[];
}

// Per-site customer resolution: "new" | existing customer id
type CustomerResolution = { mode: "new" } | { mode: "existing"; customerId: string; customerName: string };

interface Props {
  onSiteCreated: () => void;
  disabled?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SiteDocumentDropZone({ onSiteCreated, disabled }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [sites, setSites] = useState<ExtractedSite[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [allCustomers, setAllCustomers] = useState<ExistingCustomer[]>([]);
  // Map from site index → customer resolution chosen by the user
  const [resolutions, setResolutions] = useState<CustomerResolution[]>([]);

  const toSite = (record: any): ExtractedSite => {
    let systems: ExtractedSystem[] = [];
    if (Array.isArray(record.systems) && record.systems.length > 0) {
      systems = record.systems.map((s: any) => ({
        system_name: s.system_name || "Main System",
        outlets_count: s.outlets_count != null ? Number(s.outlets_count) : null,
        riser_location: s.riser_location || "",
        notes: s.notes || "",
      }));
    } else {
      systems = [{
        system_name: "Main System",
        outlets_count: record.outlets_count != null ? Number(record.outlets_count) : null,
        riser_location: record.riser_location || "",
        notes: "",
      }];
    }
    return {
      customer_name: record.customer_name || "",
      site_name: record.site_name || record.customer_name || "",
      site_address: record.site_address || "",
      postcode: record.postcode || "",
      contact_name: record.contact_name || "",
      notes: record.notes || "",
      systems,
    };
  };

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

      const [{ data: fnData, error: fnError }, { data: customers }, { data: existingSites }] = await Promise.all([
        supabase.functions.invoke("parse-import-generic", {
          body: { file_base64: base64, file_name: file.name, entity_type: "site_document" },
        }),
        supabase.from("customers").select("id, name").order("name"),
        supabase.from("sites").select("name"),
      ]);

      if (fnError || fnData?.error) {
        toast({ title: "AI extraction failed", description: fnError?.message || fnData?.error, variant: "destructive" });
        return;
      }

      const existingCustomers: ExistingCustomer[] = customers || [];
      setAllCustomers(existingCustomers);

      // Build a set of existing site names for duplicate detection
      const existingSiteNames = new Set((existingSites || []).map((s: any) => s.name.trim().toLowerCase()));

      let records = fnData.records;
      if (!Array.isArray(records)) records = records ? [records] : [];
      if (records.length === 0) {
        toast({ title: "Nothing found", description: "The AI couldn't extract site details from this document.", variant: "destructive" });
        return;
      }

      const allParsed: ExtractedSite[] = records.map(toSite);

      // Deduplicate: remove sites that already exist in the DB or appear multiple times in this batch
      const seenInBatch = new Set<string>();
      const parsed = allParsed.filter((s) => {
        const key = (s.site_name.trim() || s.customer_name.trim()).toLowerCase();
        if (!key) return false;
        if (existingSiteNames.has(key) || seenInBatch.has(key)) return false;
        seenInBatch.add(key);
        return true;
      });

      const skippedCount = allParsed.length - parsed.length;
      if (skippedCount > 0) {
        toast({ title: `${skippedCount} duplicate${skippedCount > 1 ? "s" : ""} skipped`, description: `${skippedCount} site${skippedCount > 1 ? "s" : ""} already exist and won't be re-imported.` });
      }

      if (parsed.length === 0) {
        toast({ title: "All duplicates", description: "All extracted sites already exist in the database.", variant: "destructive" });
        return;
      }

      // Auto-resolve resolutions: exact match (case-insensitive) → existing, otherwise new
      const defaultResolutions: CustomerResolution[] = parsed.map((s) => {
        const extractedName = s.customer_name.trim();
        if (!extractedName) return { mode: "new" };
        const exact = existingCustomers.find((c) => c.name.toLowerCase() === extractedName.toLowerCase());
        if (exact) return { mode: "existing", customerId: exact.id, customerName: exact.name };
        return { mode: "new" };
      });

      setSites(parsed);
      setResolutions(defaultResolutions);
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

  const updateSite = (key: keyof Omit<ExtractedSite, "systems">, value: string) => {
    setSites((prev) => prev.map((s, i) => i === currentIndex ? { ...s, [key]: value } : s));
  };

  const updateSystem = (sysIndex: number, key: keyof ExtractedSystem, value: string | number | null) => {
    setSites((prev) => prev.map((s, i) => {
      if (i !== currentIndex) return s;
      return { ...s, systems: s.systems.map((sys, j) => j === sysIndex ? { ...sys, [key]: value } : sys) };
    }));
  };

  const setResolution = (idx: number, res: CustomerResolution) => {
    setResolutions((prev) => prev.map((r, i) => i === idx ? res : r));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const names = sites.map((s) => s.site_name.trim() || s.customer_name.trim() || "Unnamed Site");
      const { data: existing } = await supabase.from("sites").select("name").in("name", names);
      const existingNames = new Set((existing || []).map((r: any) => r.name.trim().toLowerCase()));

      const sitesToCreate = sites.filter(
        (s) => !existingNames.has((s.site_name.trim() || s.customer_name.trim() || "Unnamed Site").toLowerCase())
      );
      const skipped = sites.length - sitesToCreate.length;

      if (sitesToCreate.length === 0) {
        toast({ title: "All duplicates", description: `All ${skipped} site${skipped > 1 ? "s" : ""} already exist and were skipped.`, variant: "destructive" });
        setSites([]); onSiteCreated(); return;
      }

      // Insert parent sites
      const parentRows = sitesToCreate.map((s) => ({
        name: s.site_name.trim() || s.customer_name.trim() || "Unnamed Site",
        address: s.site_address.trim() || null,
        postcode: s.postcode.trim() || null,
        site_type: "site" as const,
        contact_name: s.contact_name.trim() || null,
        notes: s.notes.trim() || null,
      }));

      const { data: createdParents, error } = await supabase.from("sites").insert(parentRows as any).select("id, name");
      if (error || !createdParents) {
        toast({ title: "Save failed", description: error?.message, variant: "destructive" });
        return;
      }

      const parentIdMap = new Map(createdParents.map((s: any) => [s.name.toLowerCase(), s.id]));

      // Insert child system records (deduplicate by name+parent)
      const childRows: any[] = [];
      const seenChildNames = new Set<string>();
      for (const s of sitesToCreate) {
        const parentName = (s.site_name.trim() || s.customer_name.trim() || "Unnamed Site").toLowerCase();
        const parentId = parentIdMap.get(parentName);
        if (!parentId) continue;
        if (s.systems.length > 1) {
          for (const sys of s.systems) {
            const childKey = `${parentId}::${sys.system_name.toLowerCase()}`;
            if (seenChildNames.has(childKey)) continue;
            seenChildNames.add(childKey);
            childRows.push({
              name: sys.system_name, parent_id: parentId, site_type: "building" as const,
              outlets_count: sys.outlets_count ?? null, riser_location: sys.riser_location.trim() || null,
            });
          }
        } else if (s.systems.length === 1) {
          const sys = s.systems[0];
          await supabase.from("sites").update({ outlets_count: sys.outlets_count ?? null, riser_location: sys.riser_location.trim() || null }).eq("id", parentId);
        }
      }
      if (childRows.length > 0) await supabase.from("sites").insert(childRows as any);

      // Resolve customers using confirmed resolutions
      const customerIdMap = new Map<string, string>(); // extracted name (lower) → customer id
      const newCustomerNames: string[] = [];

      sitesToCreate.forEach((s, idx) => {
        const origIdx = sites.indexOf(s);
        const res = resolutions[origIdx] ?? { mode: "new" };
        if (res.mode === "existing") {
          customerIdMap.set(s.customer_name.trim().toLowerCase(), res.customerId);
        } else {
          const name = s.customer_name.trim();
          if (name && !customerIdMap.has(name.toLowerCase())) newCustomerNames.push(name);
        }
      });

      if (newCustomerNames.length > 0) {
        const { data: newCustomers } = await supabase.from("customers").insert([...new Set(newCustomerNames)].map((name) => ({ name }))).select("id, name");
        for (const c of newCustomers || []) customerIdMap.set(c.name.toLowerCase(), c.id);
      }

      // Create link jobs
      const linkJobs = sitesToCreate
        .map((s) => {
          const siteName = (s.site_name.trim() || s.customer_name.trim() || "Unnamed Site").toLowerCase();
          const siteId = parentIdMap.get(siteName);
          const customerId = customerIdMap.get(s.customer_name.trim().toLowerCase());
          if (!siteId || !customerId) return null;
          return { name: `Site link — ${s.customer_name.trim()}`, customer_id: customerId, site_id: siteId, status: "active" as const, priority: "medium" as const, category: "general" };
        })
        .filter(Boolean);

      if (linkJobs.length > 0) await supabase.from("jobs").insert(linkJobs as any);

      const totalSystems = sitesToCreate.reduce((sum, s) => sum + s.systems.length, 0);
      const systemsNote = totalSystems > sitesToCreate.length ? ` (${totalSystems} systems across ${createdParents.length} site${createdParents.length > 1 ? "s" : ""})` : "";
      const skipMsg = skipped > 0 ? `${skipped} duplicate${skipped > 1 ? "s" : ""} skipped.` : undefined;
      toast({ title: `${createdParents.length} site${createdParents.length > 1 ? "s" : ""} created${systemsNote}`, description: skipMsg });
      setSites([]); onSiteCreated();
    } finally {
      setSaving(false);
    }
  };

  const form = sites[currentIndex] ?? null;
  const currentResolution = resolutions[currentIndex];
  const isOpen = sites.length > 0;
  const totalSystems = sites.reduce((sum, s) => sum + s.systems.length, 0);

  // Determine if this site's customer name was fuzzy-matched (i.e. extracted name ≠ resolved name)
  const extractedCustomerName = form?.customer_name.trim() ?? "";
  const isFuzzyMatch =
    currentResolution?.mode === "existing" &&
    currentResolution.customerName.toLowerCase() !== extractedCustomerName.toLowerCase();
  const isExactMatch =
    currentResolution?.mode === "existing" &&
    currentResolution.customerName.toLowerCase() === extractedCustomerName.toLowerCase();

  return (
    <>
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
            <p className="text-xs text-muted-foreground">AI extracts sites & systems — multiple systems at one address become sub-records</p>
            <Button variant="outline" size="sm" className="mt-1 pointer-events-none gap-2">
              <Upload className="h-3.5 w-3.5" /> Browse file
            </Button>
          </>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={(v) => { if (!v) setSites([]); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Extracted Sites</DialogTitle>
            <DialogDescription>
              {sites.length > 1
                ? `${sites.length} sites found (${totalSystems} systems total). Review each before saving.`
                : form?.systems.length === 1
                  ? "1 site found. Review and edit before saving."
                  : `1 site with ${form?.systems.length} systems found. Review before saving.`}
            </DialogDescription>
          </DialogHeader>

          {sites.length > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground border rounded-md px-3 py-1.5">
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={currentIndex === 0} onClick={() => setCurrentIndex((i) => i - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>Site {currentIndex + 1} of {sites.length}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={currentIndex === sites.length - 1} onClick={() => setCurrentIndex((i) => i + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {form && (
            <div className="space-y-4 py-2">
              {/* ── Customer resolution panel ── */}
              <div className="rounded-md border p-3 space-y-2 bg-muted/20">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">Customer</span>
                  {isExactMatch && <Badge variant="secondary" className="text-xs">matched</Badge>}
                  {isFuzzyMatch && (
                    <Badge variant="outline" className="text-xs gap-1 border-warning text-warning">
                      <AlertCircle className="h-3 w-3" /> similar name found
                    </Badge>
                  )}
                  {currentResolution?.mode === "new" && (
                    <Badge variant="outline" className="text-xs">will be created</Badge>
                  )}
                </div>

                {isFuzzyMatch && (
                  <p className="text-xs text-muted-foreground">
                    Document says <span className="font-medium text-foreground">"{extractedCustomerName}"</span> — closest match is <span className="font-medium text-foreground">"{currentResolution.customerName}"</span>. Confirm below or choose another.
                  </p>
                )}

                <Select
                  value={currentResolution?.mode === "existing" ? currentResolution.customerId : "__new__"}
                  onValueChange={(val) => {
                    if (val === "__new__") {
                      setResolution(currentIndex, { mode: "new" });
                    } else {
                      const c = allCustomers.find((x) => x.id === val);
                      if (c) setResolution(currentIndex, { mode: "existing", customerId: c.id, customerName: c.name });
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select customer…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__new__">
                      <span className="text-muted-foreground">Create new: "{extractedCustomerName || "Unnamed"}"</span>
                    </SelectItem>
                    {allCustomers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* ── Site fields ── */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Customer Name (from doc)</Label>
                  <Input value={form.customer_name} onChange={(e) => updateSite("customer_name", e.target.value)} placeholder="Customer name" />
                </div>
                <div className="space-y-1">
                  <Label>Site Name</Label>
                  <Input value={form.site_name} onChange={(e) => updateSite("site_name", e.target.value)} placeholder="Site name" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Site Address</Label>
                <Input value={form.site_address} onChange={(e) => updateSite("site_address", e.target.value)} placeholder="Full address" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Postcode</Label>
                  <Input value={form.postcode} onChange={(e) => updateSite("postcode", e.target.value)} placeholder="Postcode" />
                </div>
                <div className="space-y-1">
                  <Label>Contact Name</Label>
                  <Input value={form.contact_name} onChange={(e) => updateSite("contact_name", e.target.value)} placeholder="Contact person" />
                </div>
              </div>

              {/* ── Systems ── */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {form.systems.length === 1 ? "System" : `${form.systems.length} Systems`}
                  </span>
                  {form.systems.length > 1 && (
                    <Badge variant="secondary" className="text-xs">stored as sub-records</Badge>
                  )}
                </div>
                {form.systems.map((sys, i) => (
                  <div key={i} className="rounded-md border bg-muted/30 p-3 space-y-2">
                    {form.systems.length > 1 && (
                      <div className="space-y-1">
                        <Label className="text-xs">System Label</Label>
                        <Input value={sys.system_name} onChange={(e) => updateSystem(i, "system_name", e.target.value)} placeholder="e.g. System 1" className="h-8 text-sm" />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">{[form.site_name, sys.system_name].some(s => (s || "").toLowerCase().includes("sprinkler")) ? "Heads" : "Outlets"}</Label>
                        <Input type="number" value={sys.outlets_count ?? ""} onChange={(e) => updateSystem(i, "outlets_count", e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 12" className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Riser Location</Label>
                        <Input value={sys.riser_location} onChange={(e) => updateSystem(i, "riser_location", e.target.value)} placeholder="e.g. Floor 2 east" className="h-8 text-sm" />
                      </div>
                    </div>
                    {sys.notes && (
                      <div className="space-y-1">
                        <Label className="text-xs">Notes</Label>
                        <Textarea value={sys.notes} onChange={(e) => updateSystem(i, "notes", e.target.value)} rows={2} className="text-sm" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {form.notes && (
                <div className="space-y-1">
                  <Label>Site Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => updateSite("notes", e.target.value)} rows={2} />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSites([])}>Cancel</Button>
            <Button onClick={handleSaveAll} disabled={saving} className="gap-2">
              {saving
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                : `Create ${sites.length} Site${sites.length > 1 ? "s" : ""}${totalSystems > sites.length ? ` · ${totalSystems} systems` : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
