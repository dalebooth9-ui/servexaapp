import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  FolderOpen, Upload, FileText, Loader2, CheckCircle2, AlertCircle,
  Building2, MapPin, ChevronDown, ChevronRight, Pencil, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────────

type ParsedSystem = {
  system_name: string;
  outlets_count: number | null;
  riser_location: string | null;
};

type ParsedSite = {
  customer_name: string;
  site_name: string;
  site_address: string;
  postcode: string;
  contact_name: string;
  systems: ParsedSystem[];
};

type ExtractedCustomer = {
  folderName: string;          // name from folder
  resolvedCustomerId: string | null;
  resolvedCustomerName: string | null;
  sites: DeduplicatedSite[];
  fileCount: number;
  error?: string;
};

type DeduplicatedSite = {
  id: string; // temp local id
  site_name: string;
  site_address: string;
  postcode: string;
  contact_name: string;
  systems: ParsedSystem[];
  sourceFiles: string[];
  selected: boolean;
  isDuplicate?: boolean; // exists in DB already
  // editable overrides
  editName: string;
  editAddress: string;
};

type ImportStatus = {
  customerId: string;
  siteKey: string;
  status: "pending" | "creating" | "done" | "error";
  message?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const ALLOWED = [".pdf", ".doc", ".docx"];

function normalizeSiteKey(name: string, address: string) {
  return `${name.toLowerCase().trim()}|${address.toLowerCase().trim()}`;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Component ──────────────────────────────────────────────────────────────

export default function FolderSiteImportDialog({ open, onOpenChange, onImported }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<"idle" | "scanning" | "review" | "importing" | "done">("idle");
  const [scanProgress, setScanProgress] = useState(0);
  const [scanText, setScanText] = useState("");
  const [customers, setCustomers] = useState<ExtractedCustomer[]>([]);
  const [importStatuses, setImportStatuses] = useState<ImportStatus[]>([]);
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);

  const reset = () => {
    setStage("idle");
    setScanProgress(0);
    setScanText("");
    setCustomers([]);
    setImportStatuses([]);
    setExpandedCustomers(new Set());
    setEditingSiteId(null);
  };

  // ── Folder processing ──────────────────────────────────────────────────

  const processFolder = useCallback(async (fileList: FileList) => {
    setStage("scanning");
    setScanProgress(0);

    // Group files by top-level customer folder
    const customerMap = new Map<string, File[]>();
    for (const file of Array.from(fileList)) {
      const path = (file as any).webkitRelativePath || file.name;
      const parts = path.split("/");
      if (parts.some((p: string) => p.startsWith("."))) continue;
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!ALLOWED.includes(ext)) continue;
      if (file.size > 50 * 1024 * 1024) continue; // 50MB per file
      // Skip files from excluded years (2021–2024) based on path or filename
      const EXCLUDED_YEARS = ["2021", "2022", "2023", "2024"];
      if (EXCLUDED_YEARS.some((yr) => path.includes(yr))) continue;
      // parts[0] = root folder selected, parts[1] = customer subfolder
      const customerName = parts.length >= 3 ? parts[1] : parts[0];
      if (!customerMap.has(customerName)) customerMap.set(customerName, []);
      customerMap.get(customerName)!.push(file);
    }

    if (customerMap.size === 0) {
      toast({ title: "No documents found", description: "No PDF or Word files found in the selected folder.", variant: "destructive" });
      setStage("idle");
      return;
    }

    // Fetch existing customers for name matching
    const { data: existingCustomers } = await supabase.from("customers").select("id, name");

    const totalFiles = [...customerMap.values()].reduce((s, f) => s + f.length, 0);
    let processedFiles = 0;
    const results: ExtractedCustomer[] = [];
    const authToken = (await supabase.auth.getSession()).data.session?.access_token;

    for (const [folderName, files] of customerMap.entries()) {
      setScanText(`Processing: ${folderName} (${files.length} files)`);

      // Match to existing customer
      const matched = (existingCustomers || []).find(
        (c) => c.name.toLowerCase().trim() === folderName.toLowerCase().trim()
      );

      const siteMap = new Map<string, DeduplicatedSite>();

      for (const file of files) {
        setScanText(`Reading: ${file.name}`);
        try {
          const base64 = await fileToBase64(file);
          const resp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-import-generic`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authToken}`,
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              },
              body: JSON.stringify({
                file_base64: base64,
                file_name: file.name,
                entity_type: "site_document",
              }),
            }
          );
          if (resp.ok) {
            const { records } = await resp.json();
            const sites: ParsedSite[] = Array.isArray(records) ? records : [records];
            for (const s of sites) {
              if (!s.site_name && !s.site_address) continue;
              const key = normalizeSiteKey(
                s.site_name || s.customer_name || folderName,
                s.site_address || ""
              );
              if (siteMap.has(key)) {
                // Merge systems — deduplicate by system_name
                const existing = siteMap.get(key)!;
                existing.sourceFiles.push(file.name);
                for (const sys of s.systems || []) {
                  const sysKey = sys.system_name?.toLowerCase().trim();
                  const exists = existing.systems.some(
                    (es) => es.system_name?.toLowerCase().trim() === sysKey
                  );
                  if (!exists) existing.systems.push(sys);
                }
              } else {
                const tempId = `${folderName}-${key}-${Math.random()}`;
                siteMap.set(key, {
                  id: tempId,
                  site_name: s.site_name || s.customer_name || folderName,
                  site_address: s.site_address || "",
                  postcode: s.postcode || "",
                  contact_name: s.contact_name || "",
                  systems: s.systems || [],
                  sourceFiles: [file.name],
                  selected: true,
                  editName: s.site_name || s.customer_name || folderName,
                  editAddress: s.site_address || "",
                });
              }
            }
          }
        } catch {
          // Silent fail per file
        }
        processedFiles++;
        setScanProgress(Math.round((processedFiles / totalFiles) * 100));
      }

      results.push({
        folderName,
        resolvedCustomerId: matched?.id || null,
        resolvedCustomerName: matched?.name || null,
        sites: [...siteMap.values()].sort((a, b) =>
          (a.site_name || "").localeCompare(b.site_name || "")
        ),
        fileCount: files.length,
      });
    }

    results.sort((a, b) => a.folderName.localeCompare(b.folderName));
    setCustomers(results);
    setExpandedCustomers(new Set(results.map((r) => r.folderName)));
    setStage("review");
  }, [toast]);

  // ── Selection helpers ──────────────────────────────────────────────────

  const toggleSite = (folderName: string, siteId: string) => {
    setCustomers((prev) =>
      prev.map((c) =>
        c.folderName !== folderName
          ? c
          : {
              ...c,
              sites: c.sites.map((s) =>
                s.id === siteId ? { ...s, selected: !s.selected } : s
              ),
            }
      )
    );
  };

  const toggleAll = (folderName: string, val: boolean) => {
    setCustomers((prev) =>
      prev.map((c) =>
        c.folderName !== folderName
          ? c
          : { ...c, sites: c.sites.map((s) => ({ ...s, selected: val })) }
      )
    );
  };

  const updateSiteField = (
    folderName: string,
    siteId: string,
    field: "editName" | "editAddress",
    val: string
  ) => {
    setCustomers((prev) =>
      prev.map((c) =>
        c.folderName !== folderName
          ? c
          : {
              ...c,
              sites: c.sites.map((s) =>
                s.id === siteId ? { ...s, [field]: val } : s
              ),
            }
      )
    );
  };

  const totalSelected = customers.reduce(
    (sum, c) => sum + c.sites.filter((s) => s.selected).length,
    0
  );

  // ── Import ─────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!user) return;
    setStage("importing");
    const statuses: ImportStatus[] = [];

    for (const customer of customers) {
      const selectedSites = customer.sites.filter((s) => s.selected);
      if (selectedSites.length === 0) continue;

      // Ensure customer exists
      let customerId = customer.resolvedCustomerId;
      if (!customerId) {
        const { data: newCust, error } = await supabase
          .from("customers")
          .insert({ name: customer.folderName })
          .select("id")
          .single();
        if (error || !newCust) {
          for (const s of selectedSites) {
            statuses.push({ customerId: customer.folderName, siteKey: s.id, status: "error", message: "Failed to create customer" });
          }
          setImportStatuses([...statuses]);
          continue;
        }
        customerId = newCust.id;
      }

      for (const site of selectedSites) {
        const statusEntry: ImportStatus = {
          customerId: customer.folderName,
          siteKey: site.id,
          status: "creating",
        };
        statuses.push(statusEntry);
        setImportStatuses([...statuses]);

        try {
          // Create parent site record
          const { data: newSite, error: siteErr } = await supabase
            .from("sites")
            .insert({
              name: site.editName.trim() || site.site_name,
              site_type: "site",
              address: site.editAddress.trim() || site.site_address || null,
              postcode: site.postcode || null,
              contact_name: site.contact_name || null,
            } as any)
            .select("id")
            .single();

          if (siteErr || !newSite) throw siteErr || new Error("Failed to create site");

          // Link site to customer
          await supabase.from("customer_sites" as any).insert({
            customer_id: customerId,
            site_id: newSite.id,
          });

          // Create building records for each system (if multiple)
          if (site.systems && site.systems.length > 1) {
            for (const sys of site.systems) {
              await supabase.from("sites").insert({
                name: sys.system_name || `System`,
                site_type: "building",
                parent_id: newSite.id,
                riser_location: sys.riser_location || null,
                outlets_count: sys.outlets_count || null,
              } as any);
            }
          } else if (site.systems && site.systems.length === 1) {
            // Single system — update parent site with riser/outlets info
            const sys = site.systems[0];
            if (sys.riser_location || sys.outlets_count) {
              await supabase.from("sites").update({
                riser_location: sys.riser_location || null,
                outlets_count: sys.outlets_count || null,
              }).eq("id", newSite.id);
            }
          }

          const idx = statuses.findIndex((s) => s.siteKey === site.id);
          if (idx >= 0) statuses[idx].status = "done";
          setImportStatuses([...statuses]);
        } catch (err: any) {
          const idx = statuses.findIndex((s) => s.siteKey === site.id);
          if (idx >= 0) { statuses[idx].status = "error"; statuses[idx].message = err.message; }
          setImportStatuses([...statuses]);
        }
      }
    }

    const doneCount = statuses.filter((s) => s.status === "done").length;
    const errCount = statuses.filter((s) => s.status === "error").length;
    toast({
      title: "Import complete",
      description: `${doneCount} site(s) imported${errCount > 0 ? `, ${errCount} error(s)` : ""}.`,
    });
    setStage("done");
    onImported();
  };

  // ── Render helpers ─────────────────────────────────────────────────────

  const toggleExpand = (folderName: string) => {
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      next.has(folderName) ? next.delete(folderName) : next.add(folderName);
      return next;
    });
  };

  const getSiteImportStatus = (siteId: string) =>
    importStatuses.find((s) => s.siteKey === siteId);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            Import Sites from Customer Folders
          </DialogTitle>
        </DialogHeader>

        {/* ── IDLE ── */}
        {stage === "idle" && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-muted-foreground/30 p-12 text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-semibold text-base">Select your customer folders</p>
              <p className="text-sm text-muted-foreground max-w-md">
                Select the root folder that contains your customer subfolders. Each subfolder
                becomes a customer. PDFs and Word docs inside are scanned with AI to extract
                unique site records — duplicates across years are automatically merged.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Supported: PDF, DOC, DOCX (dry riser visual &amp; pressure test sheets)
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              // @ts-ignore
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0)
                  processFolder(e.target.files);
              }}
            />
            <Button onClick={() => inputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Choose Root Folder
            </Button>
          </div>
        )}

        {/* ── SCANNING ── */}
        {stage === "scanning" && (
          <div className="flex flex-col items-center justify-center gap-4 p-10">
            <Loader2 className="h-9 w-9 animate-spin text-primary" />
            <div className="w-full max-w-sm space-y-2">
              <Progress value={scanProgress} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">{scanText}</p>
              <p className="text-xs text-muted-foreground text-center">{scanProgress}% — AI extracting site data…</p>
            </div>
          </div>
        )}

        {/* ── REVIEW ── */}
        {(stage === "review" || stage === "importing" || stage === "done") && (
          <>
            <div className="flex items-center justify-between py-1 shrink-0">
              <p className="text-sm text-muted-foreground">
                Found <span className="font-semibold text-foreground">{totalSelected}</span> unique site
                {totalSelected !== 1 ? "s" : ""} across{" "}
                <span className="font-semibold text-foreground">{customers.length}</span> customer
                {customers.length !== 1 ? "s" : ""}
              </p>
              {stage === "review" && (
                <Button variant="ghost" size="sm" onClick={() => reset()}>
                  <X className="mr-1.5 h-3.5 w-3.5" /> Start over
                </Button>
              )}
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-3 pr-2">
                {customers.map((customer) => {
                  const isExpanded = expandedCustomers.has(customer.folderName);
                  const allSelected = customer.sites.length > 0 && customer.sites.every((s) => s.selected);
                  const someSelected = customer.sites.some((s) => s.selected);

                  return (
                    <div key={customer.folderName} className="rounded-lg border bg-card overflow-hidden">
                      {/* Customer header */}
                      <button
                        type="button"
                        className="w-full flex items-center gap-2.5 p-3 hover:bg-muted/50 transition-colors text-left"
                        onClick={() => toggleExpand(customer.folderName)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <FolderOpen className="h-4 w-4 text-warning shrink-0" />
                        <span className="font-semibold text-sm flex-1">{customer.folderName}</span>
                        {customer.resolvedCustomerName ? (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            Matched: {customer.resolvedCustomerName}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">
                            New customer
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {customer.fileCount} file{customer.fileCount !== 1 ? "s" : ""}
                        </Badge>
                        <Badge className="text-xs shrink-0 bg-primary/10 text-primary border-0">
                          {customer.sites.filter((s) => s.selected).length} site
                          {customer.sites.filter((s) => s.selected).length !== 1 ? "s" : ""}
                        </Badge>
                      </button>

                      {isExpanded && (
                        <div className="border-t">
                          {/* Select all row */}
                          {stage === "review" && customer.sites.length > 1 && (
                            <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b">
                              <Checkbox
                                checked={allSelected}
                                onCheckedChange={(v) => toggleAll(customer.folderName, !!v)}
                              />
                              <span className="text-xs text-muted-foreground">
                                {someSelected && !allSelected
                                  ? `${customer.sites.filter((s) => s.selected).length} of ${customer.sites.length} selected`
                                  : allSelected
                                  ? "All selected"
                                  : "Select all"}
                              </span>
                            </div>
                          )}

                          {customer.sites.length === 0 ? (
                            <div className="px-4 py-4 text-center text-sm text-muted-foreground">
                              No sites extracted from this folder's documents.
                            </div>
                          ) : (
                            <div className="divide-y">
                              {customer.sites.map((site) => {
                                const status = getSiteImportStatus(site.id);
                                const isEditing = editingSiteId === site.id;

                                return (
                                  <div
                                    key={site.id}
                                    className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                                      site.selected ? "bg-background" : "bg-muted/20"
                                    } ${status?.status === "done" ? "bg-green-500/5" : ""}
                                    ${status?.status === "error" ? "bg-destructive/5" : ""}`}
                                  >
                                    {stage === "review" && (
                                      <Checkbox
                                        checked={site.selected}
                                        onCheckedChange={() =>
                                          toggleSite(customer.folderName, site.id)
                                        }
                                        className="mt-0.5 shrink-0"
                                      />
                                    )}

                                    <div className="flex-1 min-w-0 space-y-1.5">
                                      {isEditing ? (
                                        <div className="space-y-2">
                                          <Input
                                            value={site.editName}
                                            onChange={(e) =>
                                              updateSiteField(
                                                customer.folderName,
                                                site.id,
                                                "editName",
                                                e.target.value
                                              )
                                            }
                                            placeholder="Site name"
                                            className="h-7 text-sm"
                                          />
                                          <Input
                                            value={site.editAddress}
                                            onChange={(e) =>
                                              updateSiteField(
                                                customer.folderName,
                                                site.id,
                                                "editAddress",
                                                e.target.value
                                              )
                                            }
                                            placeholder="Address"
                                            className="h-7 text-sm"
                                          />
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 text-xs"
                                            onClick={() => setEditingSiteId(null)}
                                          >
                                            Done
                                          </Button>
                                        </div>
                                      ) : (
                                        <div className="flex items-start gap-1.5">
                                          <MapPin className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium leading-tight">
                                              {site.editName || site.site_name}
                                            </p>
                                            {(site.editAddress || site.site_address) && (
                                              <p className="text-xs text-muted-foreground truncate">
                                                {site.editAddress || site.site_address}
                                                {site.postcode ? `, ${site.postcode}` : ""}
                                              </p>
                                            )}
                                          </div>
                                          {stage === "review" && (
                                            <button
                                              type="button"
                                              onClick={() => setEditingSiteId(site.id)}
                                              className="ml-1 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                              <Pencil className="h-3 w-3" />
                                            </button>
                                          )}
                                        </div>
                                      )}

                                      {/* Systems */}
                                      {site.systems.length > 0 && (
                                        <div className="ml-5 space-y-0.5">
                                          {site.systems.map((sys, i) => (
                                            <div
                                              key={i}
                                              className="flex items-center gap-2 text-xs text-muted-foreground"
                                            >
                                              <Building2 className="h-3 w-3 shrink-0" />
                                              <span className="font-medium">{sys.system_name}</span>
                                              {sys.outlets_count != null && (
                                                <span>· {sys.outlets_count} outlets</span>
                                              )}
                                              {sys.riser_location && (
                                                <span className="truncate">· {sys.riser_location}</span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {/* Source files */}
                                      <p className="text-[11px] text-muted-foreground/60 ml-5">
                                        From: {site.sourceFiles.slice(0, 2).join(", ")}
                                        {site.sourceFiles.length > 2
                                          ? ` +${site.sourceFiles.length - 2} more`
                                          : ""}
                                      </p>
                                    </div>

                                    {/* Status indicator */}
                                    {status && (
                                      <div className="shrink-0 mt-0.5" aria-label={status.message}>
                                        {status.status === "creating" && (
                                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                        )}
                                        {status.status === "done" && (
                                          <CheckCircle2 className="h-4 w-4 text-primary" />
                                        )}
                                        {status.status === "error" && (
                                          <AlertCircle className="h-4 w-4 text-destructive" />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Footer */}
            {stage === "review" && (
              <div className="flex items-center justify-between pt-3 border-t shrink-0">
                <p className="text-sm text-muted-foreground">
                  {totalSelected} site{totalSelected !== 1 ? "s" : ""} will be imported
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={reset}>
                    Cancel
                  </Button>
                  <Button onClick={handleImport} disabled={totalSelected === 0}>
                    <Upload className="mr-2 h-4 w-4" />
                    Import {totalSelected} Site{totalSelected !== 1 ? "s" : ""}
                  </Button>
                </div>
              </div>
            )}

            {stage === "done" && (
              <div className="flex justify-end pt-3 border-t shrink-0">
                <Button
                  onClick={() => {
                    reset();
                    onOpenChange(false);
                  }}
                >
                  Close
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
