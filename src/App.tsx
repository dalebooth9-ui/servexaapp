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
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const DataProcessingAgreement = lazy(() => import("@/pages/DataProcessingAgreement"));
const AcceptableUsePolicy = lazy(() => import("@/pages/AcceptableUsePolicy"));
const ServiceLevelAgreement = lazy(() => import("@/pages/ServiceLevelAgreement"));
const CookiePolicy = lazy(() => import("@/pages/CookiePolicy"));
const FireProtectionLiability = lazy(() => import("@/pages/FireProtectionLiability"));
const RamsEditor = lazy(() => import("@/pages/RamsEditor"));
const Offline = lazy(() => import("@/pages/Offline"));

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
              <Route path="/jobs" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
              <Route path="/jobs/:id" element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
              <Route path="/jobs/:jobId/rams" element={<ProtectedRoute><RamsEditor /></ProtectedRoute>} />
              <Route path="/jobs/:jobId/rams/:ramsId" element={<ProtectedRoute><RamsEditor /></ProtectedRoute>} />
              <Route path="/planner" element={<ProtectedRoute><WeeklyPlanner /></ProtectedRoute>} />
              <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
              <Route path="/customers/:id" element={<ProtectedRoute><CustomerDetail /></ProtectedRoute>} />
              <Route path="/quotes" element={<AdminRoute><Quotes /></AdminRoute>} />
              <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
              <Route path="/invoices/:id" element={<ProtectedRoute><InvoiceDetail /></ProtectedRoute>} />
              <Route path="/sites" element={<ProtectedRoute><Sites /></ProtectedRoute>} />
              <Route path="/assets" element={<ProtectedRoute><Assets /></ProtectedRoute>} />
              <Route path="/assets/:id" element={<ProtectedRoute><AssetDetail /></ProtectedRoute>} />
              <Route path="/parts-library" element={<ProtectedRoute><PartsLibrary /></ProtectedRoute>} />
              <Route path="/industry-templates" element={<ProtectedRoute><IndustryTemplates /></ProtectedRoute>} />
              <Route path="/compliance" element={<ProtectedRoute><Compliance /></ProtectedRoute>} />
              <Route path="/audits" element={<ProtectedRoute><Audits /></ProtectedRoute>} />
              <Route path="/engineers" element={<AdminRoute><Engineers /></AdminRoute>} />
              <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
              <Route path="/install" element={<Suspense fallback={<PageFallback />}><Install /></Suspense>} />
              <Route path="/sign-off" element={<Suspense fallback={<PageFallback />}><CustomerSignOff /></Suspense>} />
              <Route path="/portal" element={<Suspense fallback={<PageFallback />}><CustomerPortal /></Suspense>} />
              <Route path="/reports/engineers" element={<AdminRoute><EngineerReport /></AdminRoute>} />
              <Route path="/reports" element={<AdminRoute><Reports /></AdminRoute>} />
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
