// Unified paper-scan surface. Replaces the previous three-way split:
//   • "Scan paper report" launcher on Jobs (job intake dialog)
//   • /paper-scan-queue (job-mode review page)
//   • /archive (archive-mode intake + filed archive list)
//
// From the user's perspective this is ONE activity: "digitise these sheets".
// The destination (file as job vs archive-only) is decided per-item during
// review, not up-front. Everything under the tabs is still the existing,
// proven pipeline — this file is just the shell.

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScanLine, ClipboardCheck, Archive, Upload } from "lucide-react";
import BulkScanTab from "@/components/paper-scan/BulkScanTab";
import PaperScanQueue from "@/pages/PaperScanQueue";
import ArchivedDocuments from "@/pages/ArchivedDocuments";
import { useAuth } from "@/hooks/useAuth";
import { usePaperScanPendingCount } from "@/hooks/usePaperScanQueue";
import { Badge } from "@/components/ui/badge";

type Tab = "upload" | "review" | "history";

const VALID: Tab[] = ["upload", "review", "history"];

export default function PaperScans() {
  const { userRole } = useAuth();
  const [params, setParams] = useSearchParams();
  const pendingCount = usePaperScanPendingCount();

  const requested = params.get("tab");
  // Default: if items are waiting, jump straight to review; otherwise Upload.
  const activeTab: Tab = useMemo(() => {
    if (requested && VALID.includes(requested as Tab)) return requested as Tab;
    return pendingCount > 0 ? "review" : "upload";
  }, [requested, pendingCount]);

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.set("tab", t);
    // Drop tab-specific deep-link params when moving between tabs so stale
    // ?doc=… from the History tab doesn't fight the Upload tab.
    if (t !== "history") {
      next.delete("doc");
      next.delete("customer");
    }
    if (t !== "review") next.delete("batch");
    setParams(next, { replace: true });
  };

  if (userRole !== "admin") {
    return (
      <AppLayout>
        <div className="p-6">
          <p className="text-sm text-muted-foreground">
            Paper scans are managed by administrators only.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ScanLine className="h-6 w-6" /> Paper scans
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload paper sheets, review what the AI extracted, and file each
            one — as a completed job or an archive-only electronic copy. Choose
            the outcome per sheet during review.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="upload" className="gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Upload
            </TabsTrigger>
            <TabsTrigger value="review" className="gap-1.5">
              <ClipboardCheck className="h-3.5 w-3.5" /> Review
              {pendingCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 px-1.5 text-[10px]"
                >
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <Archive className="h-3.5 w-3.5" /> History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-4">
            <Card className="p-4 max-w-2xl">
              <div className="mb-3">
                <h2 className="text-base font-medium">Upload paper sheets</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Drop photos of each sheet, or a multi-page scanner PDF —
                  we'll split it into individual forms automatically. Match to
                  customer/template happens next; you pick "File as job" or
                  "Archive only" for each sheet during review.
                </p>
              </div>
              <BulkScanTab
                mode="job"
                onClose={() => setTab("review")}
              />
            </Card>
          </TabsContent>

          <TabsContent value="review" className="mt-2">
            <PaperScanQueue embedded onGoUpload={() => setTab("upload")} />
          </TabsContent>

          <TabsContent value="history" className="mt-2">
            <ArchivedDocuments embedded />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
