import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Pencil, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type TemplateField = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  section: string;
  options?: string[];
  allow_notes?: boolean;
};

interface Props {
  imagePreviews: string[];
  extractedFields: Record<string, any>;
  extractedHeader: Record<string, any>;
  templateFields: TemplateField[];
  templateName: string;
  onConfirm: (fields: Record<string, any>, header: Record<string, any>, fieldNotes: Record<string, string>) => void;
  onRescan: () => void;
}

// Simple similarity score (Dice coefficient on bigrams)
function similarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;
  const bigrams1 = new Set<string>();
  for (let i = 0; i < s1.length - 1; i++) bigrams1.add(s1.substring(i, i + 2));
  let matches = 0;
  const totalBigrams2 = s2.length - 1;
  for (let i = 0; i < s2.length - 1; i++) {
    if (bigrams1.has(s2.substring(i, i + 2))) matches++;
  }
  return (2 * matches) / (bigrams1.size + totalBigrams2);
}

type CustomerMatch = {
  name: string;
  score: number;
  exact: boolean;
};

export default function ScanReviewPanel({
  imagePreviews,
  extractedFields,
  extractedHeader,
  templateFields,
  templateName,
  onConfirm,
  onRescan,
}: Props) {
  const [fields, setFields] = useState<Record<string, any>>({ ...extractedFields });
  const [header, setHeader] = useState<Record<string, any>>({ ...extractedHeader });
  const [fieldNotes, setFieldNotes] = useState<Record<string, string>>({});
  const [customerMatch, setCustomerMatch] = useState<CustomerMatch | null>(null);
  const [allCustomers, setAllCustomers] = useState<string[]>([]);

  // Fetch all customer names on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("customers").select("name").order("name");
      if (data) setAllCustomers(data.map((c) => c.name));
    })();
  }, []);

  // Fuzzy-match customer name whenever header.customer or allCustomers changes
  useEffect(() => {
    const extracted = header.customer?.trim();
    if (!extracted || allCustomers.length === 0) {
      setCustomerMatch(null);
      return;
    }

    // Check exact match first
    const exactMatch = allCustomers.find((c) => c.toLowerCase() === extracted.toLowerCase());
    if (exactMatch) {
      setCustomerMatch({ name: exactMatch, score: 1, exact: true });
      // Auto-fill with the exact casing from DB
      if (exactMatch !== extracted) {
        setHeader((prev) => ({ ...prev, customer: exactMatch }));
      }
      return;
    }

    // Find best fuzzy match
    let bestName = "";
    let bestScore = 0;
    for (const name of allCustomers) {
      const score = similarity(extracted, name);
      if (score > bestScore) {
        bestScore = score;
        bestName = name;
      }
    }

    if (bestScore >= 0.7) {
      setCustomerMatch({ name: bestName, score: bestScore, exact: false });
    } else {
      setCustomerMatch(null);
    }
  }, [header.customer, allCustomers]);

  const acceptCustomerSuggestion = () => {
    if (customerMatch) {
      setHeader((prev) => ({ ...prev, customer: customerMatch.name }));
      setCustomerMatch({ ...customerMatch, exact: true });
    }
  };

  const updateField = (id: string, value: any) => {
    setFields((prev) => ({ ...prev, [id]: value }));
  };

  const updateNote = (id: string, value: string) => {
    setFieldNotes((prev) => ({ ...prev, [id]: value }));
  };

  const updateHeader = (key: string, value: string) => {
    setHeader((prev) => ({ ...prev, [key]: value }));
  };

  const headerFields = [
    { key: "customer", label: "Customer (Company)" },
    { key: "site", label: "Site Address" },
    { key: "engineer", label: "Engineer" },
    { key: "date", label: "Date" },
    { key: "po_ref", label: "PO / Reference" },
    { key: "riser_location", label: "Riser Location" },
    { key: "customer_signed_name", label: "Customer Signed Name" },
    { key: "customer_sign_date", label: "Customer Sign Date" },
  ];

  // Group template fields by section
  const sections = new Map<string, TemplateField[]>();
  for (const f of templateFields) {
    const sec = f.section || "General";
    if (!sections.has(sec)) sections.set(sec, []);
    sections.get(sec)!.push(f);
  }

  const renderFieldInput = (field: TemplateField) => {
    const value = fields[field.id];

    if (field.type === "pass_fail") {
      return (
        <Select value={value || ""} onValueChange={(v) => updateField(field.id, v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pass">Pass</SelectItem>
            <SelectItem value="fail">Fail</SelectItem>
            <SelectItem value="n/a">N/A</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    if (field.type === "checkbox") {
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={!!value}
            onCheckedChange={(checked) => updateField(field.id, !!checked)}
          />
          <span className="text-xs text-muted-foreground">{value ? "Yes" : "No"}</span>
        </div>
      );
    }

    if (field.type === "number") {
      return (
        <Input
          type="number"
          value={value ?? ""}
          onChange={(e) => updateField(field.id, e.target.value ? Number(e.target.value) : undefined)}
          className="h-8 text-xs"
        />
      );
    }

    if (field.type === "select" && field.options?.length) {
      const isCustom = value && !field.options.includes(value);
      if (isCustom) {
        return (
          <Input
            value={value || ""}
            onChange={(e) => updateField(field.id, e.target.value)}
            className="h-8 text-xs"
          />
        );
      }
      return (
        <Select value={value || ""} onValueChange={(v) => updateField(field.id, v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    return (
      <Input
        value={value || ""}
        onChange={(e) => updateField(field.id, e.target.value)}
        className="h-8 text-xs"
      />
    );
  };

  const filledCount = Object.values(fields).filter((v) => v !== undefined && v !== null && v !== "").length;

  const renderHeaderField = (key: string, label: string) => {
    const isCustomer = key === "customer";

    return (
      <div key={key}>
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="relative">
          <Input
            value={header[key] || ""}
            onChange={(e) => updateHeader(key, e.target.value)}
            className={`h-8 text-xs mt-0.5 ${isCustomer && customerMatch?.exact ? "border-green-500 pr-8" : ""}`}
            placeholder={`No ${label.toLowerCase()} detected`}
          />
          {isCustomer && customerMatch?.exact && (
            <Check className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600" />
          )}
        </div>
        {isCustomer && customerMatch && !customerMatch.exact && (
          <div className="mt-1 flex items-center gap-2 rounded bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-300 dark:border-yellow-700 px-2 py-1.5">
            <span className="text-xs text-yellow-800 dark:text-yellow-200 flex-1">
              Did you mean: <strong>{customerMatch.name}</strong>?
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-2 border-yellow-400 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900"
              onClick={acceptCustomerSuggestion}
            >
              Use this
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full max-h-[80vh]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Review & Confirm</span>
          <Badge variant="secondary" className="text-xs">{filledCount} fields extracted</Badge>
        </div>
        <span className="text-xs text-muted-foreground">{templateName}</span>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Original image(s) */}
        <div className="w-1/2 border-r bg-muted/10">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground mb-2">Original Scan</p>
              {imagePreviews.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`Scanned page ${i + 1}`}
                  className="w-full rounded border shadow-sm"
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Editable fields */}
        <div className="w-1/2">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-5">
              {/* Header fields */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Header Info</h3>
                <div className="space-y-2.5">
                  {headerFields.map(({ key, label }) => renderHeaderField(key, label))}
                </div>
              </div>

              {/* Template fields by section */}
              {Array.from(sections.entries()).map(([sectionName, sectionFields]) => (
                <div key={sectionName}>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{sectionName}</h3>
                  <div className="space-y-2.5">
                    {sectionFields.map((field) => (
                      <div key={field.id}>
                        <Label className="text-xs text-muted-foreground">{field.label}</Label>
                        <div className="mt-0.5">{renderFieldInput(field)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
        <Button variant="ghost" size="sm" onClick={onRescan}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Re-scan
        </Button>
        <Button size="sm" onClick={() => onConfirm(fields, header)}>
          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Confirm & Fill Form
        </Button>
      </div>
    </div>
  );
}
