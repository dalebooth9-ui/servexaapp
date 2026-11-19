import { lazy } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import GroupedPageTabs from "@/components/GroupedPageTabs";
import { useAuth } from "@/hooks/useAuth";
import { useEngineerPageAccess } from "@/hooks/useEngineerPageAccess";
import { canOpenComplianceTab } from "@/lib/groupedPages";

const Compliance = lazy(() => import("./Compliance"));
const Audits = lazy(() => import("./Audits"));
const DefectsReview = lazy(() => import("./DefectsReview"));

export default function ComplianceHub() {
  const { userRole } = useAuth();
  const { hasAccess, loading } = useEngineerPageAccess();
  const [params] = useSearchParams();
  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  const tabs = [
    { value: "compliance", label: "Compliance", content: <Compliance /> },
    { value: "audits", label: "Audits", content: <Audits /> },
    { value: "defects-review", label: "Defects review", content: <DefectsReview /> },
  ].filter((tab) => canOpenComplianceTab(tab.value, userRole, hasAccess));
  const requested = params.get("tab");
  if (!tabs.length || (requested && !canOpenComplianceTab(requested, userRole, hasAccess))) return <Navigate to="/" replace />;
  return <GroupedPageTabs title="Compliance" tabs={tabs} />;
}