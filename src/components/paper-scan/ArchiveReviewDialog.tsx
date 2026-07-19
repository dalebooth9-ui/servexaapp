import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Archive, XCircle } from "lucide-react";
import CustomerCombobox, {
  type CustomerOption,
} from "@/components/CustomerCombobox";
import SiteCombobox, { type SiteOption } from "@/components/SiteCombobox";
import { archiveScanConfirm } from "@/lib/archiveScanConfirm";

// A single queue item filed as a standalone archived document (no job).
export type ArchiveQueueItemInput = {
  itemId: string;
  batchId: string | null;
  templateId: string | null;
  templateName: string | null;
  documentType: string | null;
  extracted: Record<string, any>;
  header: Record<string, any>;
  imagePaths: string[];
  guessCustomerId: string | null;
  guessSiteId: string | null;
  guessDate: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ArchiveQueueItemInput | null;
  onResolved: () => void;
}

export default function ArchiveReviewDialog({
  open,
  onOpenChange,
  item,
  onResolved,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [docDate, setDocDate] = useState("");
  const [docType, setDocType] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    setCustomerId(item.guessCustomerId || "");
    setSiteId(item.guessSiteId || "");
    setDocDate(item.guessDate || "");
    setDocType(item.documentType || item.templateName || "");
    setTitle(item.templateName || "");
    setNotes("");
  }, [open, item]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: cs } = await supabase
        .from("customers")
        .select("id, name, email")
        .order("name");
      setCustomers((cs as any) || []);
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!customerId) {
      setSites([]);
      return;
    }
    (async () => {
      const { data: ss } = await supabase
        .from("sites")
        .select("id, name, address, postcode")
        .eq("customer_id", customerId)
        .order("name");
      setSites((ss as any) || []);
    })();
  }, [open, customerId]);

  useEffect(() => {
    if (!open || !item?.imagePaths?.length) {
      setThumbs([]);
      return;
    }
    (async () => {
      const urls: string[] = [];
      for (const p of item.imagePaths) {
        const { data } = await supabase.storage
          .from("submissions")
          .createSignedUrl(p, 60 * 60);
        if (data?.signedUrl) urls.push(data.signedUrl);
      }
      setThumbs(urls);
    })();
  }, [open, item]);

  const orgIdPromise = useMemo(async () => {
    if (!user) return null;
    const { data } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();
    return (data as any)?.org_id || null;
  }, [user]);

  const fileIt = async (asUnmatched = false) => {
    if (!user || !item) return;
    const orgId = await orgIdPromise;
    if (!orgId) {
      toast({ title: "No organisation found", variant: "destructive" });
      return;
    }
    if (!asUnmatched && !customerId) {
      toast({
        title: "Pick a customer",
        description:
          "Choose a customer to file this under, or send it to the Unmatched bucket.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await archiveScanConfirm({
        userId: user.id,
        orgId,
        itemId: item.itemId,
        batchId: item.batchId,
        templateId: item.templateId,
        templateName: item.templateName,
        documentType: docType || null,
        customerId: asUnmatched ? null : customerId || null,
        siteId: asUnmatched ? null : siteId || null,
        documentDate: docDate || null,
        title: title || null,
        notes: notes || null,
        extracted: item.extracted || {},
        header: item.header || {},
        storagePhotoPaths: item.imagePaths || [],
        status: asUnmatched ? "unmatched" : "filed",
      });
      toast({
        title: asUnmatched ? "Filed as Unmatched" : "Filed to archive",
      });
      onResolved();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Couldn't file document",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const discard = async () => {
    if (!user || !item) return;
    setSaving(true);
    try {
      await supabase
        .from("paper_scan_batch_items")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        } as any)
        .eq("id", item.itemId);
      toast({ title: "Discarded" });
      onResolved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" /> File to archive
          </DialogTitle>
          <DialogDescription>
            Archive-only — no job is created. Confirm or correct the filing
            details, then file this document to the archive library.
          </DialogDescription>
        </DialogHeader>

        {item && (
          <div className="space-y-4">
            {thumbs.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {thumbs.map((u, i) => (
                  <img
                    key={i}
                    src={u}
                    alt={`Page ${i + 1}`}
                    className="h-40 rounded border object-contain bg-muted"
                  />
                ))}
              </div>
            )}

            <div className="text-xs flex gap-2 items-center">
              {item.templateName ? (
                <Badge variant="secondary">Template: {item.templateName}</Badge>
              ) : (
                <Badge variant="outline">No template matched</Badge>
              )}
              <span className="text-muted-foreground">
                {item.imagePaths.length} page
                {item.imagePaths.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <CustomerCombobox
                  value={customerId}
                  customers={customers}
                  onChange={(v) => {
                    setCustomerId(v);
                    setSiteId("");
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Site</Label>
                <SiteCombobox
                  value={siteId}
                  sites={sites}
                  onChange={setSiteId}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Document date</Label>
                <Input
                  type="date"
                  value={docDate}
                  onChange={(e) => setDocDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Document type</Label>
                <Input
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  placeholder="e.g. Dry Riser Annual"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short label (optional)"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything the office should know"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-between pt-2 border-t">
              <Button
                variant="ghost"
                type="button"
                onClick={discard}
                disabled={saving}
              >
                <XCircle className="mr-1.5 h-4 w-4" /> Discard
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => fileIt(true)}
                  disabled={saving}
                >
                  File as Unmatched
                </Button>
                <Button
                  type="button"
                  onClick={() => fileIt(false)}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Archive className="mr-1.5 h-4 w-4" />
                  )}
                  File to archive
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
