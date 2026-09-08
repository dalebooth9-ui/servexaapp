import { ReactNode, useEffect, useState as useReactState } from "react";
import servexaLogo from "@/assets/servexa-logo.png";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEngineerLocation } from "@/hooks/useEngineerLocation";
import { useEngineerPageAccess } from "@/hooks/useEngineerPageAccess";
import { useOrgStatus } from "@/hooks/useOrgStatus";
import AccountPaused from "@/components/AccountPaused";
import { ROUTE_TO_SLUG } from "@/lib/engineerPages";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Briefcase, Users, Settings, LogOut, Menu, X, CalendarDays, Building2, FileText, MapPin, Package, Shield, ShieldAlert, Library, MessageCircle, BarChart2, TrendingUp, BookOpen, ClipboardCheck, ClipboardList, ChevronDown, Palmtree, AlertTriangle, FileArchive, History, Truck, CloudUpload, Rocket, LifeBuoy, Bug, CreditCard, ScanLine, Eye } from "lucide-react";
import EngineerPreviewBanner from "@/components/engineer/EngineerPreviewBanner";
import EngineerPreviewDialog from "@/components/engineer/EngineerPreviewDialog";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import CommandPalette from "@/components/CommandPalette";
import NotificationBell from "@/components/NotificationBell";
import AiHelpWizard from "@/components/AiHelpWizard";
import ClockInButton from "@/components/ClockInButton";
import TodaysVisitsBadge from "@/components/TodaysVisitsBadge";
import UnreadMessagesBadge from "@/components/UnreadMessagesBadge";
import UndoButton from "@/components/UndoButton";
import KeyboardShortcutsHelp from "@/components/KeyboardShortcutsHelp";
import SetupSpotlightBanner from "@/components/SetupSpotlightBanner";
import PlanBandBanner from "@/components/billing/PlanBandBanner";
import SubscriptionActivationBanner from "@/components/billing/SubscriptionActivationBanner";
import ReportProblemDialog from "@/components/ReportProblemDialog";
import BackButton from "@/components/BackButton";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useRecentErrorCount } from "@/hooks/useRecentErrorCount";
import { usePaperScanPendingCount } from "@/hooks/usePaperScanQueue";
import { supabase } from "@/integrations/supabase/client";

type NavItemDef = {
  to: string;
  label: string;
  icon: any;
  adminOnly?: boolean;
  platformOnly?: boolean;
};

type NavGroupDef = {
  id: string;
  label: string;
  items: NavItemDef[];
};

/**
 * ONE canonical navigation structure, rendered identically on every route.
 * Six collapsible groups plus a fixed utility strip at the bottom.
 */
const NAV_GROUPS: NavGroupDef[] = [
  {
    id: "work",
    label: "Work",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/jobs", label: "Jobs", icon: Briefcase },
      { to: "/planner", label: "Planner", icon: CalendarDays },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    items: [
      { to: "/customers", label: "Customers", icon: Building2, adminOnly: true },
      { to: "/sites", label: "Sites", icon: MapPin, adminOnly: true },
      { to: "/assets", label: "Assets", icon: Package, adminOnly: true },
      { to: "/site-surveys", label: "Site Surveys", icon: ClipboardList },
    ],
  },
  {
    id: "commercial",
    label: "Commercial",
    items: [
      { to: "/quotes", label: "Quotes", icon: ClipboardList, adminOnly: true },
      { to: "/invoices", label: "Invoices", icon: FileText, adminOnly: true },
      { to: "/agreements", label: "Agreements", icon: FileText, adminOnly: true },
      { to: "/contracts", label: "Contracts", icon: FileText, adminOnly: true },
      { to: "/renewals", label: "Renewals", icon: CalendarDays, adminOnly: true },
    ],
  },
  {
    id: "compliance",
    label: "Compliance",
    items: [
      { to: "/defects", label: "Defects", icon: ShieldAlert, adminOnly: true },
      { to: "/defects/review", label: "Defects Review", icon: ShieldAlert, adminOnly: true },
      { to: "/rams/start", label: "RAMS", icon: Shield, adminOnly: true },
      { to: "/compliance", label: "Compliance", icon: Shield, adminOnly: true },
      { to: "/audits", label: "Audits", icon: ClipboardCheck, adminOnly: true },
      { to: "/report-downloads", label: "Reports & certificates", icon: FileArchive, adminOnly: true },
      { to: "/paper-scans", label: "Paper scans & archive", icon: ScanLine, adminOnly: true },
    ],
  },
  {
    id: "resources",
    label: "Resources",
    items: [
      { to: "/engineers", label: "Engineers", icon: Users, adminOnly: true },
      { to: "/stock", label: "Van stock", icon: Truck },
      { to: "/parts-library", label: "Parts library", icon: Library, adminOnly: true },
      { to: "/leave", label: "Leave", icon: Palmtree },
      { to: "/fleet", label: "Vehicle checks", icon: Truck, adminOnly: true },
      { to: "/industry-templates", label: "Templates", icon: BookOpen, adminOnly: true },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    items: [
      { to: "/reports", label: "Reports", icon: BarChart2, adminOnly: true },
      { to: "/reports/engineers", label: "Performance", icon: TrendingUp, adminOnly: true },
      { to: "/audit-log", label: "Audit log", icon: History, adminOnly: true },
      { to: "/admin/error-log", label: "Error log", icon: Bug, adminOnly: true },
      { to: "/platform/organisations", label: "Platform Orgs", icon: Building2, adminOnly: true, platformOnly: true },
      { to: "/platform/support", label: "Platform Support", icon: LifeBuoy, adminOnly: true, platformOnly: true },
    ],
  },
];

const UTILITY_ITEMS: NavItemDef[] = [
  { to: "/help", label: "Help & guides", icon: BookOpen },
  { to: "/sync-status", label: "Sync status", icon: CloudUpload },
  { to: "/support/my-tickets", label: "My tickets", icon: LifeBuoy },
  { to: "/admin/support-tickets", label: "Org support tickets", icon: LifeBuoy, adminOnly: true },
  { to: "/setup", label: "Setup guide", icon: Rocket, adminOnly: true },
  { to: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

const GROUP_OPEN_KEY = "nav-groups-open";

function loadGroupState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(GROUP_OPEN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}


function NavItem({
  item, isActive, onClick, collapsed, badge,
}: {
  item: NavItemDef;
  isActive: boolean;
  onClick: () => void;
  collapsed?: boolean;
  badge?: number;
}) {
  const badgeEl = badge && badge > 0 ? (
    <span className={cn(
      "ml-auto inline-flex items-center justify-center rounded-full text-[10px] font-semibold px-1.5 min-w-[18px] h-[18px]",
      isActive ? "bg-white/25 text-white" : "bg-orange-500/90 text-white"
    )}>
      {badge > 99 ? "99+" : badge}
    </span>
  ) : null;

  if (collapsed) {
    return (
      <Link
        to={item.to}
        onClick={onClick}
        title={item.label + (badge ? ` (${badge} open)` : "")}
        data-tour={`nav-${item.to.replace(/^\//, "").replace(/\//g, "-") || "dashboard"}`}
        className={cn(
          "relative flex items-center justify-center w-full rounded-lg p-2.5 transition-all duration-150",
          isActive
            ? "bg-gradient-to-r from-[hsl(25,95%,53%)] to-[hsl(25,95%,46%)] text-white shadow-md"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}>
        <item.icon className="h-5 w-5 shrink-0" />
        {badge && badge > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center rounded-full text-[9px] font-semibold px-1 min-w-[16px] h-[16px] bg-orange-500 text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <Link
      to={item.to}
      onClick={onClick}
      data-tour={`nav-${item.to.replace(/^\//, "").replace(/\//g, "-") || "dashboard"}`}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
        isActive
          ? "bg-gradient-to-r from-[hsl(25,95%,53%)] to-[hsl(25,95%,46%)] text-white shadow-md shadow-[hsl(25,95%,30%)]/40 font-semibold"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}>
      <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-white" : "")} />
      <span className="flex-1 truncate">{item.label}</span>
      {badgeEl}
    </Link>
  );
}



export default function AppLayout({ children }: {children: ReactNode;}) {
  const { user, userRole, realUserRole, profile, signOut, isPreviewingAsEngineer, effectiveUserId, previewEngineerId } = useAuth();
  const [previewDialogOpen, setPreviewDialogOpen] = useReactState(false);

  const location = useLocation();
  useEngineerLocation();
  const { hasAccess } = useEngineerPageAccess();
  const orgStatus = useOrgStatus();
  const isPlatformRoute = location.pathname.startsWith("/platform");
  const isBillingRoute = location.pathname === "/billing" || location.pathname === "/settings/billing";
  if (!orgStatus.loading && orgStatus.status && orgStatus.status !== "active" && !orgStatus.is_platform_admin && !isPlatformRoute && !isBillingRoute) {
    return <AccountPaused orgStatus={orgStatus} />;
  }
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopExpanded, setDesktopExpanded] = useReactState(true);
  // Sidebar is always expanded on desktop — remove auto-collapse on mouse leave
  const [shortcutsOpen, setShortcutsOpen] = useReactState(false);
  useKeyboardShortcuts(() => setShortcutsOpen(true));
  const [whatsappNumber, setWhatsappNumber] = useReactState<string | null>(null);
  const [groupOpen, setGroupOpen] = useReactState<Record<string, boolean>>(loadGroupState);

  const toggleGroup = (id: string) => {
    setGroupOpen((prev) => {
      const next = { ...prev, [id]: prev[id] === false ? true : false };
      try { localStorage.setItem(GROUP_OPEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };


  const [openDefectCount, setOpenDefectCount] = useReactState<number>(0);
  const [pendingReviewCount, setPendingReviewCount] = useReactState<number>(0);
  const [platformSupportOpen, setPlatformSupportOpen] = useReactState<number>(0);
  const paperScansPending = usePaperScanPendingCount();
  const recentErrorCount = useRecentErrorCount(userRole === "admin");


  useEffect(() => {
    supabase.from("app_settings").select("value").eq("key", "business_whatsapp_number").single()
      .then(({ data }) => {
        if (data?.value && typeof data.value === "string" && data.value !== "Not configured") {
          setWhatsappNumber(data.value);
        }
      });
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchCount = async () => {
      const { count } = await supabase
        .from("defects")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");
      if (mounted) setOpenDefectCount(count || 0);
    };
    fetchCount();
    const channel = supabase
      .channel("defect-count-sidebar")
      .on("postgres_changes", { event: "*", schema: "public", table: "defects" }, fetchCount)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchPending = async () => {
      if (userRole === "engineer") {
        // Engineer view (real engineer OR admin previewing a specific engineer):
        // badge must match the Jobs page — their own current assigned jobs only.
        // Generic preview (no specific engineer picked) shows 0, matching the
        // placeholder Jobs page.
        const genericPreview = isPreviewingAsEngineer && !previewEngineerId;
        const targetId = effectiveUserId ?? user?.id ?? null;
        if (genericPreview || !targetId) {
          if (mounted) setPendingReviewCount(0);
          return;
        }
        const { data: assignments } = await supabase
          .from("job_assignments")
          .select("job_id")
          .eq("engineer_id", targetId);
        const ids = (assignments ?? []).map((a: any) => a.job_id);
        if (ids.length === 0) {
          if (mounted) setPendingReviewCount(0);
          return;
        }
        const { count } = await supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .in("id", ids)
          .not("status", "in", "(completed,archived,rejected)");
        if (mounted) setPendingReviewCount(count || 0);
        return;
      }
      // Admin: keep existing behaviour — count pending-review jobs org-wide.
      const { count } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_review");
      if (mounted) setPendingReviewCount(count || 0);
    };
    fetchPending();
    const channel = supabase
      .channel("pending-review-count-sidebar")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, fetchPending)
      .on("postgres_changes", { event: "*", schema: "public", table: "job_assignments" }, fetchPending)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [userRole, effectiveUserId, previewEngineerId, isPreviewingAsEngineer, user?.id]);

  useEffect(() => {
    if (!orgStatus.is_platform_admin) return;
    let mounted = true;
    const fetchOpen = async () => {
      const { count } = await supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .neq("status", "resolved");
      if (mounted) setPlatformSupportOpen(count || 0);
    };
    fetchOpen();
    const channel = supabase
      .channel("platform-support-count-sidebar")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, fetchOpen)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [orgStatus.is_platform_admin]);



  const canSee = (item: NavItemDef) => {
    if (item.platformOnly) {
      if (userRole === "engineer") return false;
      return orgStatus.is_platform_admin;
    }
    if (item.to === "/") return true;
    if (userRole === "admin") return true;
    if (userRole === "engineer") {
      const slug = ROUTE_TO_SLUG[item.to];
      return slug ? hasAccess(slug) : false;
    }
    return !item.adminOnly;
  };

  const badgeFor = (to: string) =>
    to === "/defects" ? openDefectCount :
    to === "/jobs" ? pendingReviewCount :
    to === "/platform/support" ? platformSupportOpen :
    to === "/paper-scans" ? paperScansPending :
    to === "/admin/error-log" ? recentErrorCount : undefined;

  const isItemActive = (to: string) =>
    location.pathname === to || (to !== "/" && location.pathname.startsWith(to));

  const visibleGroups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter(canSee) }))
    .filter((g) => g.items.length > 0);
  const visibleUtility = UTILITY_ITEMS.filter(canSee);
  // Engineers get a single flat list — no group headers, no admin sections.
  const engineerItems = userRole === "engineer"
    ? visibleGroups.flatMap((g) => g.items)
    : [];


  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <EngineerPreviewBanner />
      <EngineerPreviewDialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen} />
      <div className="flex flex-1 overflow-hidden">

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col transition-all duration-300",
          "bg-gradient-to-b from-[hsl(213,55%,13%)] via-[hsl(213,51%,16%)] to-[hsl(213,48%,12%)]",
          "text-sidebar-foreground",
          /* mobile */
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          /* desktop */
          "lg:static lg:translate-x-0",
          desktopExpanded ? "lg:w-64" : "lg:w-14"
        )}>

        {/* Accent stripe at top */}
        <div className="h-1 w-full bg-gradient-to-r from-[hsl(25,95%,53%)] via-[hsl(25,95%,62%)] to-[hsl(25,95%,45%)] shrink-0" />

        <div className="border-b border-sidebar-border/50">
          {/* Desktop hamburger — hover to expand */}
          <div className="hidden lg:flex items-center px-3 pt-2 pb-1">
            <button
              onMouseEnter={() => setDesktopExpanded(true)}
              onClick={() => setDesktopExpanded((v) => !v)}
              className="p-1.5 rounded-md text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent transition-colors"
              title={desktopExpanded ? "Collapse sidebar" : "Expand sidebar"}
            >
              <Menu className="h-4 w-4" />
            </button>
            {desktopExpanded && (
              <img src={servexaLogo} alt="Servexa logo" className="h-8 w-auto object-contain ml-2" />
            )}
          </div>
          {/* Mobile logo */}
          <img src={servexaLogo} alt="Servexa logo" className="lg:hidden w-full h-auto object-contain px-4 -mt-2 pb-0" />
          <div className={cn("flex items-center gap-1 px-3 pb-2", desktopExpanded ? "justify-center" : "lg:justify-center")}>
            {desktopExpanded && <ClockInButton />}
            {desktopExpanded && <TodaysVisitsBadge />}
            {desktopExpanded && <UnreadMessagesBadge />}
            <UndoButton />
            <NotificationBell />
            <button onClick={() => setMobileOpen(false)} className="lg:hidden">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className={cn("flex-1 min-h-0 overflow-y-auto py-2", desktopExpanded ? "px-3" : "lg:px-1 px-3")}>
          {userRole === "engineer" ? (
            <div className="space-y-0.5">
              {engineerItems.map((item) => (
                <NavItem
                  key={item.to}
                  item={item}
                  isActive={isItemActive(item.to)}
                  onClick={() => setMobileOpen(false)}
                  collapsed={!desktopExpanded}
                  badge={badgeFor(item.to)}
                />
              ))}
            </div>
          ) : (
            visibleGroups.map((group) => {
              const sidebarCollapsed = !desktopExpanded;
              const hasActive = group.items.some((i) => isItemActive(i.to));
              // Default open; a group containing the active route is always open.
              const open = sidebarCollapsed || hasActive || groupOpen[group.id] !== false;
              return (
                <div key={group.id} className="mb-1">
                  {!sidebarCollapsed ? (
                    <button
                      onClick={() => toggleGroup(group.id)}
                      className="mt-3 mb-1 flex w-full items-center gap-1 px-4 text-[10px] font-bold uppercase tracking-widest text-[hsl(25,95%,60%)] hover:text-white transition-colors select-none"
                    >
                      <span className="flex-1 text-left">{group.label}</span>
                      <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
                    </button>
                  ) : (
                    <div className="my-2 h-px bg-sidebar-border/30 mx-1" />
                  )}
                  {open && (
                    <div className="space-y-0.5">
                      {group.items.map((item) => (
                        <NavItem
                          key={item.to}
                          item={item}
                          isActive={isItemActive(item.to)}
                          onClick={() => setMobileOpen(false)}
                          collapsed={sidebarCollapsed}
                          badge={badgeFor(item.to)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {visibleUtility.length > 0 && (
            <div className="mt-3 border-t border-sidebar-border/40 pt-2 space-y-0.5">
              {visibleUtility.map((item) => (
                <NavItem
                  key={item.to}
                  item={item}
                  isActive={isItemActive(item.to)}
                  onClick={() => setMobileOpen(false)}
                  collapsed={!desktopExpanded}
                />
              ))}
            </div>
          )}
        </nav>


        {/* Footer */}
        <div className="shrink-0 border-t border-sidebar-border/50 bg-[hsl(213,55%,10%)] px-3 py-2">
          {whatsappNumber && desktopExpanded &&
          <a
            href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-1.5 flex items-center gap-2 rounded-lg bg-[hsl(142,60%,25%)] px-2 py-1.5 text-xs font-medium text-green-100 transition-colors hover:opacity-80">
              <MessageCircle className="h-3.5 w-3.5 shrink-0 text-green-300" />
              <span className="truncate">{whatsappNumber}</span>
            </a>
          }
          {desktopExpanded && (
            <div className="mb-2 flex flex-wrap gap-x-2 gap-y-0.5">
              {[
                { to: "/terms", label: "Terms" },
                { to: "/privacy", label: "Privacy" },
                { to: "/dpa", label: "DPA" },
                { to: "/aup", label: "AUP" },
                { to: "/sla", label: "SLA" },
                { to: "/cookies", label: "Cookies" },
                { to: "/fire-liability", label: "Fire Liability" },
              ].map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className="text-[10px] text-sidebar-foreground/35 hover:text-sidebar-foreground/70 transition-colors"
                >
                  {label}
                </Link>
              ))}
            </div>
          )}
          {desktopExpanded && (
            <div className="mb-2">
              <ReportProblemDialog
                trigger={
                  <button className="w-full flex items-center gap-2 rounded-lg border border-sidebar-border/40 bg-sidebar-accent/20 px-2 py-1.5 text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors">
                    <LifeBuoy className="h-3.5 w-3.5 shrink-0" />
                    <span>Report a problem</span>
                  </button>
                }
              />
            </div>
          )}
          {realUserRole === "admin" && !isPreviewingAsEngineer && desktopExpanded && (
            <div className="mb-2">
              <button
                onClick={() => setPreviewDialogOpen(true)}
                className="w-full flex items-center gap-2 rounded-lg border border-sidebar-border/40 bg-sidebar-accent/20 px-2 py-1.5 text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
                title="Preview the app as an engineer sees it"
              >
                <Eye className="h-3.5 w-3.5 shrink-0" />
                <span>Preview as Engineer</span>
              </button>
            </div>
          )}
          <div className={cn("flex items-center gap-2", desktopExpanded ? "justify-between" : "lg:justify-center justify-between")}>
            {desktopExpanded && (
              <div className="min-w-0 text-xs">
                <p className="truncate font-semibold text-white">{profile?.full_name || user?.email}</p>
                <p className="text-[hsl(25,95%,60%)] capitalize text-[10px] font-medium">
                  {isPreviewingAsEngineer ? "engineer (preview)" : userRole || "user"}
                </p>
              </div>
            )}
            <Button variant="ghost" size="icon" onClick={signOut} className="h-7 w-7 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" title="Sign Out">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>

        </div>
      </aside>

      {/* Overlay */}
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-14 items-center border-b bg-gradient-to-r from-[hsl(213,51%,16%)] to-[hsl(213,51%,20%)] px-4 lg:hidden shadow-sm">
          <button onClick={() => setMobileOpen(true)} className="text-white" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <BackButton tone="dark" className="ml-2" />
          <img src={servexaLogo} alt="Servexa logo" className="ml-auto h-7 w-auto object-contain" />
        </header>
        {/* Top accent bar on desktop — gives the content area a branded edge */}
        <div className="hidden lg:block h-0.5 w-full bg-gradient-to-r from-[hsl(25,95%,53%)] via-[hsl(213,51%,35%)] to-transparent shrink-0" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-[hsl(210,22%,96%)]">
          {/* Desktop back affordance — sits above content so page titles are undisturbed. */}
          <div className="hidden lg:block -mt-1 mb-2">
            <BackButton />
          </div>
          <PlanBandBanner />
          <SubscriptionActivationBanner />
          {userRole === "admin" && <SetupSpotlightBanner />}
          {children}
        </main>

      </div>
      {userRole === "admin" && <CommandPalette />}
      {userRole === "admin" && <div data-tour="ai-help"><AiHelpWizard /></div>}
      <KeyboardShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      </div>
    </div>);


}
