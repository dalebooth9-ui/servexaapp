import { ReactNode, useEffect, useState as useReactState } from "react";
import servexaLogo from "@/assets/servexa-logo.png";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEngineerLocation } from "@/hooks/useEngineerLocation";
import { useEngineerPageAccess } from "@/hooks/useEngineerPageAccess";
import { ROUTE_TO_SLUG } from "@/lib/engineerPages";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Briefcase, Users, Settings, LogOut, Menu, X, CalendarDays, Building2, FileText, MapPin, Package, Shield, Library, MessageCircle, BarChart2, TrendingUp, GripVertical, BookOpen, ClipboardCheck, ClipboardList, ChevronDown, Pin, PinOff, Palmtree, AlertTriangle } from "lucide-react";
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
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { supabase } from "@/integrations/supabase/client";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent } from
"@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove } from
"@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const DEFAULT_NAV_ITEMS = [
{ to: "/", label: "Dashboard", icon: LayoutDashboard, section: "main" },
{ to: "/jobs", label: "Jobs", icon: Briefcase, section: "operations" },
{ to: "/planner", label: "Planner", icon: CalendarDays, section: "operations" },
{ to: "/leave", label: "Leave", icon: Palmtree, section: "operations" },
{ to: "/customers", label: "Customers", icon: Building2, section: "operations", adminOnly: true },
{ to: "/invoices", label: "Invoices", icon: FileText, section: "operations", adminOnly: true },
{ to: "/sites", label: "Sites", icon: MapPin, section: "more", adminOnly: true },
{ to: "/assets", label: "Assets", icon: Package, section: "more", adminOnly: true },
{ to: "/quotes", label: "Quotes", icon: ClipboardList, section: "more", adminOnly: true },
{ to: "/parts-library", label: "Parts Library", icon: Library, section: "more", adminOnly: true },
{ to: "/compliance", label: "Compliance", icon: Shield, section: "more", adminOnly: true },
  { to: "/audits", label: "Audits", icon: ClipboardCheck, section: "more", adminOnly: true },
  { to: "/defects", label: "Defects", icon: AlertTriangle, section: "more", adminOnly: false },
{ to: "/industry-templates", label: "Templates", icon: BookOpen, section: "admin", adminOnly: true },
{ to: "/reports", label: "Reports", icon: BarChart2, section: "admin", adminOnly: true },
{ to: "/reports/engineers", label: "Performance", icon: TrendingUp, section: "admin", adminOnly: true },
{ to: "/engineers", label: "Engineers", icon: Users, section: "admin", adminOnly: true },
{ to: "/settings", label: "Settings", icon: Settings, section: "admin", adminOnly: true }];


const SECTION_LABELS: Record<string, string> = {
  main: "",
  operations: "Operations",
  more: "More",
  admin: "Admin"
};

const STORAGE_KEY = "nav-order";
const SECTION_OVERRIDE_KEY = "nav-section-overrides";

function loadNavOrder(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function loadSectionOverrides(): Record<string, "operations" | "more"> {
  try {
    const raw = localStorage.getItem(SECTION_OVERRIDE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function SortableNavItem({
  item, isActive, onClick, inOps, onTogglePin, collapsed,
}: {
  item: typeof DEFAULT_NAV_ITEMS[number];
  isActive: boolean;
  onClick: () => void;
  inOps: boolean;
  onTogglePin: () => void;
  collapsed?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.to });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  if (collapsed) {
    return (
      <div ref={setNodeRef} style={style}>
        <Link
          to={item.to}
          onClick={onClick}
          title={item.label}
          className={cn(
            "flex items-center justify-center w-full rounded-lg p-2.5 transition-all duration-150",
            isActive
              ? "bg-gradient-to-r from-[hsl(25,95%,53%)] to-[hsl(25,95%,46%)] text-white shadow-md"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}>
          <item.icon className="h-5 w-5 shrink-0" />
        </Link>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 group">
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 opacity-0 group-hover:opacity-40 hover:!opacity-80 transition-opacity text-sidebar-foreground"
        tabIndex={-1}>
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Link
        to={item.to}
        onClick={onClick}
        className={cn(
          "flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
          isActive
            ? "bg-gradient-to-r from-[hsl(25,95%,53%)] to-[hsl(25,95%,46%)] text-white shadow-md shadow-[hsl(25,95%,30%)]/40 font-semibold"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}>
        <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-white" : "")} />
        {item.label}
      </Link>
      <button
        onClick={(e) => { e.preventDefault(); onTogglePin(); }}
        title={inOps ? "Move to More" : "Pin to Operations"}
        className={cn(
          "p-1 rounded transition-all shrink-0",
          inOps
            ? "opacity-0 group-hover:opacity-50 hover:!opacity-100 text-sidebar-primary"
            : "opacity-0 group-hover:opacity-40 hover:!opacity-80 text-sidebar-foreground"
        )}
        tabIndex={-1}>
        {inOps ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
      </button>
    </div>
  );
}

export default function AppLayout({ children }: {children: ReactNode;}) {
  const { user, userRole, profile, signOut } = useAuth();
  useEngineerLocation();
  const { hasAccess } = useEngineerPageAccess();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopExpanded, setDesktopExpanded] = useReactState(true);
  // Sidebar is always expanded on desktop — remove auto-collapse on mouse leave
  const [shortcutsOpen, setShortcutsOpen] = useReactState(false);
  useKeyboardShortcuts(() => setShortcutsOpen(true));
  const [whatsappNumber, setWhatsappNumber] = useReactState<string | null>(null);
  const [navOrder, setNavOrder] = useReactState<string[]>(() => loadNavOrder() || DEFAULT_NAV_ITEMS.map((i) => i.to));
  const [sectionOverrides, setSectionOverrides] = useReactState<Record<string, "operations" | "more">>(loadSectionOverrides);

  const handleTogglePin = (to: string, currentSection: "operations" | "more") => {
    setSectionOverrides((prev) => {
      const defaultSection = DEFAULT_NAV_ITEMS.find((i) => i.to === to)?.section as "operations" | "more";
      const next = { ...prev };
      const target = currentSection === "operations" ? "more" : "operations";
      if (target === defaultSection) {
        delete next[to];
      } else {
        next[to] = target;
      }
      localStorage.setItem(SECTION_OVERRIDE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    supabase.from("app_settings").select("value").eq("key", "business_whatsapp_number").single()
      .then(({ data }) => {
        if (data?.value && typeof data.value === "string" && data.value !== "Not configured") {
          setWhatsappNumber(data.value);
        }
      });
  }, []);

  const orderedItems = navOrder.map((to) => DEFAULT_NAV_ITEMS.find((i) => i.to === to)).filter(Boolean) as typeof DEFAULT_NAV_ITEMS;
  const extraItems = DEFAULT_NAV_ITEMS.filter((i) => !navOrder.includes(i.to));
  const allOrderedItems = [...orderedItems, ...extraItems];
  const visibleNavItems = allOrderedItems.filter((item) => {
    if (item.adminOnly && userRole !== "admin") {
      // For engineers, check per-user page access
      if (userRole === "engineer") {
        const slug = ROUTE_TO_SLUG[item.to];
        return slug ? hasAccess(slug) : false;
      }
      return false;
    }
    // Non-adminOnly items: for engineers, still check page access
    if (userRole === "engineer") {
      const slug = ROUTE_TO_SLUG[item.to];
      if (slug) return hasAccess(slug);
    }
    return true;
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const visibleIds = visibleNavItems.map((i) => i.to);
    const oldIndex = visibleIds.indexOf(active.id as string);
    const newIndex = visibleIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const reorderedVisible = arrayMove(visibleIds, oldIndex, newIndex);
    let visibleCursor = 0;
    const merged = allOrderedItems.map((item) => {
      if (visibleIds.includes(item.to)) return reorderedVisible[visibleCursor++];
      return item.to;
    });
    setNavOrder(merged);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  };

  const [moreOpen, setMoreOpen] = useReactState(() => {
    const moreRoutes = ["/sites", "/assets", "/quotes", "/parts-library", "/compliance", "/audits"];
    return moreRoutes.some((r) => location.pathname.startsWith(r));
  });

  const sections = ["main", "operations", "more", "admin"] as const;
  const itemsBySection = sections.reduce((acc, section) => {
    acc[section] = visibleNavItems.filter((i) => {
      if (section === "operations" || section === "more") {
        const effective = sectionOverrides[i.to] ?? i.section;
        return effective === section;
      }
      return i.section === section;
    });
    return acc;
  }, {} as Record<string, typeof visibleNavItems>);

  return (
    <div className="flex h-screen overflow-hidden">
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleNavItems.map((i) => i.to)} strategy={verticalListSortingStrategy}>
              {sections.map((section) => {
                const items = itemsBySection[section];
                if (!items || items.length === 0) return null;
                const label = SECTION_LABELS[section];
                const isMoreSection = section === "more";
                const isOpsSection = section === "operations";
                const sidebarCollapsed = !desktopExpanded;

                // Accent colour per section label
                const sectionAccent =
                  section === "operations" ? "text-[hsl(25,95%,60%)]" :
                  section === "admin" ? "text-[hsl(200,80%,65%)]" :
                  "text-sidebar-foreground/40";

                return (
                  <div key={section} className="mb-1">
                    {label && !isMoreSection && !sidebarCollapsed &&
                    <p className={cn("mb-1 mt-3 px-4 text-[10px] font-bold uppercase tracking-widest select-none", sectionAccent)}>
                        {label}
                      </p>
                    }
                    {sidebarCollapsed && label && !isMoreSection && (
                      <div className="my-2 h-px bg-sidebar-border/30 mx-1" />
                    )}
                    {isMoreSection ? (
                      <>
                        {!sidebarCollapsed && (
                          <button
                            onClick={() => setMoreOpen((v) => !v)}
                            className="mt-3 mb-1 flex w-full items-center gap-1 px-4 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors select-none"
                          >
                            <span className="flex-1 text-left">{label}</span>
                            <ChevronDown className={cn("h-3 w-3 transition-transform", moreOpen && "rotate-180")} />
                          </button>
                        )}
                        {(moreOpen || sidebarCollapsed) && (
                          <div className="space-y-0.5">
                            {items.map((item) => {
                              const isActive = location.pathname === item.to || item.to !== "/" && location.pathname.startsWith(item.to);
                              return (
                                <SortableNavItem
                                  key={item.to}
                                  item={item}
                                  isActive={isActive}
                                  onClick={() => setMobileOpen(false)}
                                  inOps={false}
                                  collapsed={sidebarCollapsed}
                                  onTogglePin={() => handleTogglePin(item.to, "more")} />
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="space-y-0.5">
                        {items.map((item) => {
                          const isActive = location.pathname === item.to || item.to !== "/" && location.pathname.startsWith(item.to);
                          return (
                            <SortableNavItem
                              key={item.to}
                              item={item}
                              isActive={isActive}
                              onClick={() => setMobileOpen(false)}
                              inOps={isOpsSection}
                              collapsed={sidebarCollapsed}
                              onTogglePin={() => handleTogglePin(item.to, isOpsSection ? "operations" : section as "operations" | "more")} />
                          );
                        })}
                      </div>
                    )}
                  </div>);
              })}
            </SortableContext>
          </DndContext>
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
          <div className={cn("flex items-center gap-2", desktopExpanded ? "justify-between" : "lg:justify-center justify-between")}>
            {desktopExpanded && (
              <div className="min-w-0 text-xs">
                <p className="truncate font-semibold text-white">{profile?.full_name || user?.email}</p>
                <p className="text-[hsl(25,95%,60%)] capitalize text-[10px] font-medium">{userRole || "user"}</p>
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
          <button onClick={() => setMobileOpen(true)} className="text-white">
            <Menu className="h-5 w-5" />
          </button>
          <img src={servexaLogo} alt="Servexa logo" className="ml-3 h-7 w-auto object-contain" />
        </header>
        {/* Top accent bar on desktop — gives the content area a branded edge */}
        <div className="hidden lg:block h-0.5 w-full bg-gradient-to-r from-[hsl(25,95%,53%)] via-[hsl(213,51%,35%)] to-transparent shrink-0" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-[hsl(210,22%,96%)]">{children}</main>
      </div>
      {userRole === "admin" && <CommandPalette />}
      {userRole === "admin" && <AiHelpWizard />}
      <KeyboardShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>);

}
