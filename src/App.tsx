import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import OfflineIndicator from "@/components/OfflineIndicator";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useEngineerPageAccess } from "@/hooks/useEngineerPageAccess";
import { ReactNode, lazy, Suspense } from "react";

// Eagerly loaded — used immediately on auth/landing
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";

// Lazily loaded — heavier pages loaded on demand
const Jobs = lazy(() => import("@/pages/Jobs"));
const JobDetail = lazy(() => import("@/pages/JobDetail"));
const Engineers = lazy(() => import("@/pages/Engineers"));
const Customers = lazy(() => import("@/pages/Customers"));
const CustomerDetail = lazy(() => import("@/pages/CustomerDetail"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const WeeklyPlanner = lazy(() => import("@/pages/WeeklyPlanner"));
const Sites = lazy(() => import("@/pages/Sites"));
const Assets = lazy(() => import("@/pages/Assets"));
const AssetDetail = lazy(() => import("@/pages/AssetDetail"));
const Compliance = lazy(() => import("@/pages/Compliance"));
const Audits = lazy(() => import("@/pages/Audits"));
const Invoices = lazy(() => import("@/pages/Invoices"));
const InvoiceDetail = lazy(() => import("@/pages/InvoiceDetail"));
const Quotes = lazy(() => import("@/pages/Quotes"));
const PartsLibrary = lazy(() => import("@/pages/PartsLibrary"));
const IndustryTemplates = lazy(() => import("@/pages/IndustryTemplates"));
const Install = lazy(() => import("@/pages/Install"));
const CustomerSignOff = lazy(() => import("@/pages/CustomerSignOff"));
const CustomerPortal = lazy(() => import("@/pages/CustomerPortal"));
const EngineerReport = lazy(() => import("@/pages/EngineerReport"));
const Reports = lazy(() => import("@/pages/Reports"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Servexa = lazy(() => import("@/pages/Servexa"));
const HandoverSignOff = lazy(() => import("@/components/HandoverSignOffPage"));
const JobHandover = lazy(() => import("@/pages/JobHandover"));
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const DataProcessingAgreement = lazy(() => import("@/pages/DataProcessingAgreement"));
const AcceptableUsePolicy = lazy(() => import("@/pages/AcceptableUsePolicy"));
const ServiceLevelAgreement = lazy(() => import("@/pages/ServiceLevelAgreement"));
const CookiePolicy = lazy(() => import("@/pages/CookiePolicy"));
const FireProtectionLiability = lazy(() => import("@/pages/FireProtectionLiability"));
const RamsEditor = lazy(() => import("@/pages/RamsEditor"));
const Offline = lazy(() => import("@/pages/Offline"));
const LeaveCalendar = lazy(() => import("@/pages/LeaveCalendar"));
const Defects = lazy(() => import("@/pages/Defects"));
const QuoteApproval = lazy(() => import("@/pages/QuoteApproval"));
const FireLog = lazy(() => import("@/pages/FireLog"));
const ReportDownloads = lazy(() => import("@/pages/ReportDownloads"));

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
    Loading…
  </div>
);

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  useOfflineSync();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <AppLayout><Suspense fallback={<PageFallback />}>{children}</Suspense></AppLayout>;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { user, userRole, loading } = useAuth();
  useOfflineSync();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (userRole !== "admin") return <Navigate to="/" replace />;
  return <AppLayout><Suspense fallback={<PageFallback />}>{children}</Suspense></AppLayout>;
}

function AccessRoute({ children, pageSlug }: { children: ReactNode; pageSlug: string }) {
  const { user, userRole, loading } = useAuth();
  const { hasAccess, loading: accessLoading } = useEngineerPageAccess();
  useOfflineSync();
  if (loading || accessLoading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (userRole === "admin" || hasAccess(pageSlug)) {
    return <AppLayout><Suspense fallback={<PageFallback />}>{children}</Suspense></AppLayout>;
  }
  return <Navigate to="/" replace />;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ErrorBoundary>
          <AuthProvider>
            <Routes>
              <Route path="/auth" element={<AuthRoute />} />
              <Route path="/offline" element={<Suspense fallback={<PageFallback />}><Offline /></Suspense>} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/jobs" element={<AccessRoute pageSlug="jobs"><Jobs /></AccessRoute>} />
              <Route path="/jobs/:id" element={<AccessRoute pageSlug="jobs"><JobDetail /></AccessRoute>} />
              <Route path="/jobs/:jobId/rams" element={<AccessRoute pageSlug="jobs"><RamsEditor /></AccessRoute>} />
              <Route path="/jobs/:jobId/rams/:ramsId" element={<AccessRoute pageSlug="jobs"><RamsEditor /></AccessRoute>} />
              <Route path="/rams/new" element={<AccessRoute pageSlug="jobs"><RamsEditor /></AccessRoute>} />
              <Route path="/rams/:ramsId" element={<AccessRoute pageSlug="jobs"><RamsEditor /></AccessRoute>} />
              <Route path="/planner" element={<AccessRoute pageSlug="planner"><WeeklyPlanner /></AccessRoute>} />
              <Route path="/leave" element={<AccessRoute pageSlug="leave"><LeaveCalendar /></AccessRoute>} />
              <Route path="/customers" element={<AccessRoute pageSlug="customers"><Customers /></AccessRoute>} />
              <Route path="/customers/:id" element={<AccessRoute pageSlug="customers"><CustomerDetail /></AccessRoute>} />
              <Route path="/quotes" element={<AdminRoute><Quotes /></AdminRoute>} />
              <Route path="/invoices" element={<AdminRoute><Invoices /></AdminRoute>} />
              <Route path="/invoices/:id" element={<AdminRoute><InvoiceDetail /></AdminRoute>} />
              <Route path="/sites" element={<AccessRoute pageSlug="sites"><Sites /></AccessRoute>} />
              <Route path="/assets" element={<AccessRoute pageSlug="assets"><Assets /></AccessRoute>} />
              <Route path="/assets/:id" element={<AccessRoute pageSlug="assets"><AssetDetail /></AccessRoute>} />
              <Route path="/parts-library" element={<AdminRoute><PartsLibrary /></AdminRoute>} />
              <Route path="/industry-templates" element={<AdminRoute><IndustryTemplates /></AdminRoute>} />
              <Route path="/compliance" element={<AccessRoute pageSlug="compliance"><Compliance /></AccessRoute>} />
              <Route path="/audits" element={<AccessRoute pageSlug="audits"><Audits /></AccessRoute>} />
              <Route path="/defects" element={<AccessRoute pageSlug="audits"><Defects /></AccessRoute>} />
              <Route path="/engineers" element={<AdminRoute><Engineers /></AdminRoute>} />
              <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
              <Route path="/install" element={<Suspense fallback={<PageFallback />}><Install /></Suspense>} />
              <Route path="/sign-off" element={<Suspense fallback={<PageFallback />}><CustomerSignOff /></Suspense>} />
              <Route path="/portal" element={<Suspense fallback={<PageFallback />}><CustomerPortal /></Suspense>} />
              <Route path="/quote-approval" element={<Suspense fallback={<PageFallback />}><QuoteApproval /></Suspense>} />
              <Route path="/reports/engineers" element={<AdminRoute><EngineerReport /></AdminRoute>} />
              <Route path="/reports" element={<AdminRoute><Reports /></AdminRoute>} />
              <Route path="/report-downloads" element={<AccessRoute pageSlug="jobs"><ReportDownloads /></AccessRoute>} />
              <Route path="/reset-password" element={<Suspense fallback={<PageFallback />}><ResetPassword /></Suspense>} />
              <Route path="/terms" element={<Suspense fallback={<PageFallback />}><TermsOfService /></Suspense>} />
              <Route path="/privacy" element={<Suspense fallback={<PageFallback />}><PrivacyPolicy /></Suspense>} />
              <Route path="/dpa" element={<Suspense fallback={<PageFallback />}><DataProcessingAgreement /></Suspense>} />
              <Route path="/aup" element={<Suspense fallback={<PageFallback />}><AcceptableUsePolicy /></Suspense>} />
              <Route path="/sla" element={<Suspense fallback={<PageFallback />}><ServiceLevelAgreement /></Suspense>} />
              <Route path="/cookies" element={<Suspense fallback={<PageFallback />}><CookiePolicy /></Suspense>} />
              <Route path="/fire-liability" element={<Suspense fallback={<PageFallback />}><FireProtectionLiability /></Suspense>} />
              <Route path="/servexa" element={<Suspense fallback={<PageFallback />}><Servexa /></Suspense>} />
              <Route path="/handover/:token" element={<Suspense fallback={<PageFallback />}><HandoverSignOff /></Suspense>} />
              <Route path="/job-handover/:token" element={<Suspense fallback={<PageFallback />}><JobHandover /></Suspense>} />
              <Route path="/fire-log/:token" element={<Suspense fallback={<PageFallback />}><FireLog /></Suspense>} />
              <Route path="*" element={<Suspense fallback={<PageFallback />}><NotFound /></Suspense>} />
            </Routes>
            <OfflineIndicator />
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
