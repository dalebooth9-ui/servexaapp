import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageSquare, ScanLine, Trash2, Eye, Loader2, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

type PendingScan = {
  id: string;
  engineer_user_id: string;
  engineer_phone: string;
  image_storage_path: string;
  extracted_fields: any;
  ocr_path: string | null;
  ocr_confidence: number | null;
  status: string;
  created_at: string;
  engineer_name?: string;
};

export default function PendingWhatsAppScans() {
  const [scans, setScans] = useState<PendingScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [reviewScan, setReviewScan] = useState<PendingScan | null>(null);
  const [reviewImageUrl, setReviewImageUrl] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchScans = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pending_whatsapp_scans")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      // Get engineer names
      const userIds = [...new Set(data.map((s: any) => s.engineer_user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const nameMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { nameMap[p.user_id] = p.full_name; });

      const enriched = data.map((s: any) => ({
        ...s,
        engineer_name: nameMap[s.engineer_user_id] || s.engineer_phone,
      }));

      setScans(enriched);

      // Get thumbnails
      const thumbMap: Record<string, string> = {};
      await Promise.all(
        enriched.map(async (s: PendingScan) => {
          const { data: signed } = await supabase.storage
            .from("submissions")
            .createSignedUrl(s.image_storage_path, 600);
          if (signed?.signedUrl) thumbMap[s.id] = signed.signedUrl;
        })
      );
      setThumbnails(thumbMap);
    } else {
      setScans([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchScans(); }, []);

  const openReview = async (scan: PendingScan) => {
    setReviewScan(scan);
    const { data: signed } = await supabase.storage
      .from("submissions")
      .createSignedUrl(scan.image_storage_path, 3600);
    if (signed?.signedUrl) setReviewImageUrl(signed.signedUrl);
  };

  const handleDiscard = async (scanId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from("pending_whatsapp_scans")
      .update({ status: "discarded", reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", scanId);
    setReviewScan(null);
    toast({ title: "Scan discarded" });
    fetchScans();
  };

  const handleCreateJob = async (scan: PendingScan) => {
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const fields = scan.extracted_fields || {};
      const header = fields.header || {};
      const templateFields = fields.fields || {};

      const customerName = header.customer || header.Customer || "";
      const address = header.site_address || header.address || "";
      const engineerName = header.engineer || header.Engineer || "";
      const date = header.date || header.Date || "";

      // Try to find the customer
      let customerId: string | null = null;
      if (customerName) {
        const { data: cust } = await supabase
          .from("customers")
          .select("id")
          .ilike("name", customerName)
          .maybeSingle();
        if (cust) customerId = cust.id;
      }

      const { data: job, error } = await supabase
        .from("jobs")
        .insert({
          name: customerName ? `${customerName} — WhatsApp Scan` : "WhatsApp Scanned Job",
          customer: customerName || null,
          customer_id: customerId,
          address: address || null,
          status: "active",
          priority: "medium",
          category: "general",
          created_by: user?.id,
          brief: `Auto-scanned from WhatsApp image sent by ${scan.engineer_name || scan.engineer_phone} on ${new Date(scan.created_at).toLocaleDateString("en-GB")}.\n\nExtracted fields: ${JSON.stringify(templateFields, null, 2)}`,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Mark scan as reviewed
      await supabase
        .from("pending_whatsapp_scans")
        .update({
          status: "reviewed",
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          created_job_id: job.id,
        })
        .eq("id", scan.id);

      // Move the image as a submission under the new job
      await supabase.from("submissions").insert({
        job_id: job.id,
        engineer_id: scan.engineer_user_id,
        type: "document",
        file_url: scan.image_storage_path,
        file_name: scan.image_storage_path.split("/").pop() || "whatsapp_scan.jpg",
        content: "WhatsApp auto-scanned sheet",
      });

      toast({ title: "Job created", description: `Job created from WhatsApp scan` });
      setReviewScan(null);
      fetchScans();
      navigate(`/jobs/${job.id}`);
    } catch (err: any) {
      console.error("Create job error:", err);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  if (loading) return null;
  if (scans.length === 0) return null;

  const extractedSummary = (fields: any) => {
    const h = fields?.header || {};
    const parts: string[] = [];
    if (h.customer || h.Customer) parts.push(h.customer || h.Customer);
    if (h.engineer || h.Engineer) parts.push(h.engineer || h.Engineer);
    if (h.date || h.Date) parts.push(h.date || h.Date);
    return parts.join(" • ") || "Fields extracted";
  };

  return (
    <>
      <Card className="mb-6 border-amber-500/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5 text-amber-500" />
            Pending WhatsApp Scans
            <Badge variant="secondary" className="ml-auto bg-amber-500/10 text-amber-600">{scans.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {scans.map((scan) => (
              <div key={scan.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                {thumbnails[scan.id] ? (
                  <img
                    src={thumbnails[scan.id]}
                    alt="Scanned sheet"
                    className="h-14 w-14 rounded object-cover border shrink-0"
                  />
                ) : (
                  <div className="h-14 w-14 rounded bg-muted flex items-center justify-center shrink-0">
                    <ScanLine className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{scan.engineer_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{extractedSummary(scan.extracted_fields)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(scan.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {scan.ocr_confidence != null && (
                      <span className={`ml-2 ${Number(scan.ocr_confidence) >= 0.7 ? "text-green-600" : "text-amber-600"}`}>
                        {Math.round(Number(scan.ocr_confidence) * 100)}% confidence
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="default" onClick={() => openReview(scan)}>
                    <Eye className="h-3.5 w-3.5 mr-1" /> Review
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDiscard(scan.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!reviewScan} onOpenChange={(o) => { if (!o) { setReviewScan(null); setReviewImageUrl(""); } }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5" />
              Review WhatsApp Scan — {reviewScan?.engineer_name}
            </DialogTitle>
          </DialogHeader>
          {reviewScan && (
            <div className="flex-1 overflow-y-auto grid md:grid-cols-2 gap-4">
              {/* Left: Image */}
              <div className="flex flex-col items-center">
                {reviewImageUrl ? (
                  <img
                    src={reviewImageUrl}
                    alt="Scanned sheet"
                    className="w-full max-h-[60vh] object-contain rounded border"
                  />
                ) : (
                  <div className="flex items-center justify-center h-64 w-full bg-muted rounded">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  OCR: {reviewScan.ocr_path} • Confidence: {reviewScan.ocr_confidence != null ? `${Math.round(Number(reviewScan.ocr_confidence) * 100)}%` : "N/A"}
                </p>
              </div>

              {/* Right: Extracted fields */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Extracted Fields</h3>
                {reviewScan.extracted_fields?.header && Object.keys(reviewScan.extracted_fields.header).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Header Info</p>
                    {Object.entries(reviewScan.extracted_fields.header).map(([key, value]) => (
                      <div key={key} className="grid grid-cols-3 gap-2 text-sm">
                        <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}:</span>
                        <span className="col-span-2 font-medium">{String(value || "—")}</span>
                      </div>
                    ))}
                  </div>
                )}
                {reviewScan.extracted_fields?.fields && Object.keys(reviewScan.extracted_fields.fields).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Template Fields</p>
                    {Object.entries(reviewScan.extracted_fields.fields)
                      .filter(([k]) => !k.startsWith("_"))
                      .map(([key, value]) => (
                        <div key={key} className="grid grid-cols-3 gap-2 text-sm">
                          <span className="text-muted-foreground truncate">{key.replace(/_/g, " ")}:</span>
                          <span className="col-span-2 font-medium break-words">{String(value || "—")}</span>
                        </div>
                      ))}
                  </div>
                )}
                {(!reviewScan.extracted_fields?.header || Object.keys(reviewScan.extracted_fields.header).length === 0) &&
                 (!reviewScan.extracted_fields?.fields || Object.keys(reviewScan.extracted_fields.fields).length === 0) && (
                  <p className="text-sm text-muted-foreground italic">No fields could be extracted. You can still create a job manually.</p>
                )}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="ghost" className="text-destructive" onClick={() => reviewScan && handleDiscard(reviewScan.id)}>
              <Trash2 className="h-4 w-4 mr-1" /> Discard
            </Button>
            <Button onClick={() => reviewScan && handleCreateJob(reviewScan)} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Review & Create Job
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
