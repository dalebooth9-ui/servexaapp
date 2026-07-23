import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import OfflineIndicator from "@/components/OfflineIndicator";
import PWAPrompts from "@/components/PWAPrompts";
import ConflictResolutionDialog from "@/components/ConflictResolutionDialog";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useEngineerPageAccess } from "@/hooks/useEngineerPageAccess";
import { ReactNode, lazy, Suspense, useEffect } from "react";
import { toast } from "sonner";
import { installGlobalErrorHandlers } from "@/lib/errorLogger";

installGlobalErrorHandlers();

// Eagerly loaded — used immediately on auth/landing
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
const OAuthConsent = lazy(() => import("@/pages/OAuthConsent"));

// Lazily loaded — heavier pages loaded on demand
const Jobs = lazy(() => import("@/pages/Jobs"));
const JobDetail = lazy(() => import("@/pages/JobDetail"));
const Engineers = lazy(() => import("@/pages/Engineers"));
const Customers = lazy(() => import("@/pages/Customers"));
const CustomerDetail = lazy(() => import("@/pages/CustomerDetail"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const BillingPage = lazy(() => import("@/pages/BillingPage"));
const WeeklyPlanner = lazy(() => import("@/pages/WeeklyPlanner"));
const Sites = lazy(() => import("@/pages/Sites"));
const Assets = lazy(() => import("@/pages/Assets"));
const AssetDetail = lazy(() => import("@/pages/AssetDetail"));
const Compliance = lazy(() => import("@/pages/Compliance"));
const Audits = lazy(() => import("@/pages/Audits"));
const Invoices = lazy(() => import("@/pages/Invoices"));
const InvoiceDetail = lazy(() => import("@/pages/InvoiceDetail"));
const Quotes = lazy(() => import("@/pages/Quotes"));
const ServiceContracts = lazy(() => import("@/pages/ServiceContracts"));
const ServiceContractDetail = lazy(() => import("@/pages/ServiceContractDetail"));
const PaperScans = lazy(() => import("@/pages/PaperScans"));

const PartsLibrary = lazy(() => import("@/pages/PartsLibrary"));
const VanStock = lazy(() => import("@/pages/VanStock"));
const IndustryTemplates = lazy(() => import("@/pages/IndustryTemplates"));
const PriceBook = lazy(() => import("@/pages/PriceBook"));
const Install = lazy(() => import("@/pages/Install"));
const CustomerSignOff = lazy(() => import("@/pages/CustomerSignOff"));
const CustomerPortal = lazy(() => import("@/pages/CustomerPortal"));
const PortalLayout = lazy(() => import("@/pages/portal/PortalLayout"));
const PortalHome = lazy(() => import("@/pages/portal/PortalHome"));
const PortalDocuments = lazy(() => import("@/pages/portal/PortalDocuments"));
const PortalQuotes = lazy(() => import("@/pages/portal/PortalQuotes"));
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
const GenericRamsPage = lazy(() => import("@/pages/GenericRamsPage"));
const NewRamsPage = lazy(() => import("@/pages/NewRamsPage"));
const RamsLibrary = lazy(() => import("@/pages/RamsLibrary"));
const Renewals = lazy(() => import("@/pages/Renewals"));
const RamsDetail = lazy(() => import("@/pages/RamsDetail"));
const Offline = lazy(() => import("@/pages/Offline"));
const LeaveCalendar = lazy(() => import("@/pages/LeaveCalendar"));
const Defects = lazy(() => import("@/pages/Defects"));
const DefectsReview = lazy(() => import("@/pages/DefectsReview"));
const QuoteApproval = lazy(() => import("@/pages/QuoteApproval"));
const FireLog = lazy(() => import("@/pages/FireLog"));
const SiteSurveys = lazy(() => import("@/pages/SiteSurveys"));
const SiteSurveyDetail = lazy(() => import("@/pages/SiteSurveyDetail"));
const ReportDownloads = lazy(() => import("@/pages/ReportDownloads"));
const JobApprovalAuditLog = lazy(() => import("@/pages/JobApprovalAuditLog"));
const MyProfile = lazy(() => import("@/pages/MyProfile"));
const MyTimesheet = lazy(() => import("@/pages/MyTimesheet"));
const SyncStatus = lazy(() => import("@/pages/SyncStatus"));
const SetupGuide = lazy(() => import("@/pages/SetupGuide"));
const ErrorLog = lazy(() => import("@/pages/ErrorLog"));
const SupportTickets = lazy(() => import("@/pages/SupportTickets"));
const ImportWizard = lazy(() => import("@/pages/ImportWizard"));
const HistoricReportsImport = lazy(() => import("@/pages/HistoricReportsImport"));
const FleetVehicles = lazy(() => import("@/pages/FleetVehicles"));
const PlatformOrganisations = lazy(() => import("@/pages/PlatformOrganisations"));
const PlatformSupportInbox = lazy(() => import("@/pages/PlatformSupportInbox"));
const MyTickets = lazy(() => import("@/pages/MyTickets"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const PricingPage = lazy(() => import("@/pages/PricingPage"));
const SignupPage = lazy(() => import("@/pages/SignupPage"));
// Hidden emergency route — no visible entry. Reach via direct URL.
const StorageMigrationPanel = lazy(() => import("@/components/StorageMigrationPanel"));
import CookieBanner from "@/components/CookieBanner";

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
  const denied =
    !loading && !accessLoading && !!user && userRole !== "admin" && !hasAccess(pageSlug);
  useEffect(() => {
    if (denied) {
      toast.error("You don't have access to this page");
    }
  }, [denied]);
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
  if (user) {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      return <Navigate to={next} replace />;
    }
    return <Navigate to="/app" replace />;
  }
  return <Auth />;
}

// Marketing landing at "/" for signed-out visitors; signed-in users go to dashboard.
function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  if (user) return <ProtectedRoute><Dashboard /></ProtectedRoute>;
  return <Suspense fallback={<PageFallback />}><LandingPage /></Suspense>;
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
              <Route path="/login" element={<AuthRoute />} />
              <Route path="/signup" element={<Suspense fallback={<PageFallback />}><SignupPage /></Suspense>} />
              <Route path="/.lovable/oauth/consent" element={<Suspense fallback={<PageFallback />}><OAuthConsent /></Suspense>} />
              <Route path="/offline" element={<Suspense fallback={<PageFallback />}><Offline /></Suspense>} />
              <Route path="/landing" element={<Navigate to="/" replace />} />
              <Route path="/pricing" element={<Suspense fallback={<PageFallback />}><PricingPage /></Suspense>} />
              <Route path="/" element={<RootRoute />} />
              <Route path="/app" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/my-profile" element={<ProtectedRoute><MyProfile /></ProtectedRoute>} />
              <Route path="/my-timesheet" element={<ProtectedRoute><MyTimesheet /></ProtectedRoute>} />
              <Route path="/sync-status" element={<ProtectedRoute><SyncStatus /></ProtectedRoute>} />
              <Route path="/setup" element={<AdminRoute><SetupGuide /></AdminRoute>} />
              <Route path="/admin/error-log" element={<AdminRoute><ErrorLog /></AdminRoute>} />
              <Route path="/admin/support-tickets" element={<AdminRoute><SupportTickets /></AdminRoute>} />
              <Route path="/fleet" element={<AdminRoute><FleetVehicles /></AdminRoute>} />
              <Route path="/platform/organisations" element={<AdminRoute><PlatformOrganisations /></AdminRoute>} />
              <Route path="/platform/support" element={<AdminRoute><PlatformSupportInbox /></AdminRoute>} />
              <Route path="/support/my-tickets" element={<ProtectedRoute><MyTickets /></ProtectedRoute>} />

              <Route path="/paper-scans" element={<AdminRoute><Suspense fallback={<PageFallback />}><PaperScans /></Suspense></AdminRoute>} />
              {/* Legacy routes — redirect to the unified surface with the right tab preselected. */}
              <Route path="/paper-scan-queue" element={<Navigate to={`/paper-scans?tab=review${typeof window !== "undefined" && window.location.search ? "&" + window.location.search.slice(1) : ""}`} replace />} />
              <Route path="/archive" element={<Navigate to={`/paper-scans?tab=history${typeof window !== "undefined" && window.location.search ? "&" + window.location.search.slice(1) : ""}`} replace />} />


              <Route path="/jobs" element={<AccessRoute pageSlug="jobs"><Jobs /></AccessRoute>} />
              <Route path="/jobs/:id" element={<AccessRoute pageSlug="jobs"><JobDetail /></AccessRoute>} />
              <Route path="/jobs/:jobId/rams" element={<AccessRoute pageSlug="jobs"><RamsEditor /></AccessRoute>} />
              <Route path="/jobs/:jobId/rams/:ramsId" element={<AccessRoute pageSlug="jobs"><RamsEditor /></AccessRoute>} />
              <Route path="/rams/new" element={<AccessRoute pageSlug="jobs"><RamsEditor /></AccessRoute>} />
              <Route path="/rams/:ramsId" element={<AccessRoute pageSlug="jobs"><RamsEditor /></AccessRoute>} />
              <Route path="/rams/generate" element={<AccessRoute pageSlug="jobs"><GenericRamsPage /></AccessRoute>} />
              <Route path="/rams/generate/:id" element={<AccessRoute pageSlug="jobs"><GenericRamsPage /></AccessRoute>} />
              <Route path="/rams/start" element={<AccessRoute pageSlug="jobs"><NewRamsPage /></AccessRoute>} />
              <Route path="/rams/view/:id" element={<AccessRoute pageSlug="jobs"><RamsDetail /></AccessRoute>} />
              <Route path="/settings/rams-library" element={<AdminRoute><RamsLibrary /></AdminRoute>} />
              <Route path="/renewals" element={<AdminRoute><Suspense fallback={<PageFallback />}><Renewals /></Suspense></AdminRoute>} />
              <Route path="/planner" element={<AccessRoute pageSlug="planner"><WeeklyPlanner /></AccessRoute>} />
              <Route path="/leave" element={<AccessRoute pageSlug="leave"><LeaveCalendar /></AccessRoute>} />
              <Route path="/customers" element={<AccessRoute pageSlug="customers"><Customers /></AccessRoute>} />
              <Route path="/customers/:id" element={<AccessRoute pageSlug="customers"><CustomerDetail /></AccessRoute>} />
              <Route path="/quotes" element={<AdminRoute><Quotes /></AdminRoute>} />
              <Route path="/invoices" element={<AdminRoute><Invoices /></AdminRoute>} />
              <Route path="/invoices/:id" element={<AdminRoute><InvoiceDetail /></AdminRoute>} />
              <Route path="/contracts" element={<AdminRoute><Suspense fallback={<PageFallback />}><ServiceContracts /></Suspense></AdminRoute>} />
              <Route path="/contracts/:id" element={<AdminRoute><Suspense fallback={<PageFallback />}><ServiceContractDetail /></Suspense></AdminRoute>} />
              <Route path="/sites" element={<AccessRoute pageSlug="sites"><Sites /></AccessRoute>} />
              <Route path="/site-surveys" element={<AccessRoute pageSlug="site-surveys"><Suspense fallback={<PageFallback />}><SiteSurveys /></Suspense></AccessRoute>} />
              <Route path="/site-surveys/:id" element={<AccessRoute pageSlug="site-surveys"><Suspense fallback={<PageFallback />}><SiteSurveyDetail /></Suspense></AccessRoute>} />
              <Route path="/assets" element={<AccessRoute pageSlug="assets"><Assets /></AccessRoute>} />
              <Route path="/assets/:id" element={<AccessRoute pageSlug="assets"><AssetDetail /></AccessRoute>} />
              <Route path="/parts-library" element={<AdminRoute><PartsLibrary /></AdminRoute>} />
              <Route path="/stock" element={<ProtectedRoute><VanStock /></ProtectedRoute>} />
              <Route path="/industry-templates" element={<AdminRoute><IndustryTemplates /></AdminRoute>} />
              <Route path="/templates" element={<Navigate to="/industry-templates" replace />} />
              <Route path="/compliance" element={<AccessRoute pageSlug="compliance"><Compliance /></AccessRoute>} />
              <Route path="/audits" element={<AccessRoute pageSlug="audits"><Audits /></AccessRoute>} />
              <Route path="/defects" element={<AdminRoute><Defects /></AdminRoute>} />
              <Route path="/defects/review" element={<AdminRoute><DefectsReview /></AdminRoute>} />
              <Route path="/engineers" element={<AdminRoute><Engineers /></AdminRoute>} />
              <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
              <Route path="/billing" element={<AdminRoute><BillingPage /></AdminRoute>} />
              <Route path="/settings/billing" element={<AdminRoute><BillingPage /></AdminRoute>} />
              <Route path="/settings/price-book" element={<AdminRoute><PriceBook /></AdminRoute>} />
              <Route path="/settings/import" element={<AdminRoute><ImportWizard /></AdminRoute>} />
              <Route path="/settings/import-historic-reports" element={<AdminRoute><HistoricReportsImport /></AdminRoute>} />
              <Route path="/settings/storage-migration" element={<AdminRoute><div className="p-6"><StorageMigrationPanel /></div></AdminRoute>} />
              <Route path="/install" element={<Suspense fallback={<PageFallback />}><Install /></Suspense>} />
              <Route path="/sign-off" element={<Suspense fallback={<PageFallback />}><CustomerSignOff /></Suspense>} />
              <Route path="/portal" element={<Suspense fallback={<PageFallback />}><CustomerPortal /></Suspense>} />
              <Route path="/customer-portal" element={<Suspense fallback={<PageFallback />}><PortalLayout /></Suspense>}>
                <Route index element={<Suspense fallback={<PageFallback />}><PortalHome /></Suspense>} />
                <Route path="documents" element={<Suspense fallback={<PageFallback />}><PortalDocuments /></Suspense>} />
                <Route path="quotes" element={<Suspense fallback={<PageFallback />}><PortalQuotes /></Suspense>} />
              </Route>
              <Route path="/quote-approval" element={<Suspense fallback={<PageFallback />}><QuoteApproval /></Suspense>} />
              <Route path="/reports/engineers" element={<AdminRoute><EngineerReport /></AdminRoute>} />
              <Route path="/reports" element={<AdminRoute><Reports /></AdminRoute>} />
              <Route path="/audit-log" element={<AdminRoute><JobApprovalAuditLog /></AdminRoute>} />
              <Route path="/report-downloads" element={<AdminRoute><ReportDownloads /></AdminRoute>} />
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
            <PWAPrompts />
            <ConflictResolutionDialog />
            <CookieBanner />
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
