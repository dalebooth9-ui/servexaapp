import { ReactNode, useEffect, useState as useReactState } from "react";
import servexaLogo from "@/assets/servexa-logo.png";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEngineerLocation } from "@/hooks/useEngineerLocation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Briefcase, Users, Settings, LogOut, Menu, X, CalendarDays, Building2, FileText, MapPin, Package, Shield, Library, MessageCircle, BarChart2, GripVertical, BookOpen, ListChecks, ClipboardList, ChevronDown, Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import CommandPalette from "@/components/CommandPalette";
import NotificationBell from "@/components/NotificationBell";
import AiHelpWizard from "@/components/AiHelpWizard";
import ClockInButton from "@/components/ClockInButton";
import TodaysVisitsBadge from "@/components/TodaysVisitsBadge";
import UnreadMessagesBadge from "@/components/UnreadMessagesBadge";
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
{ to: "/customers", label: "Customers", icon: Building2, section: "operations" },
{ to: "/invoices", label: "Invoices", icon: FileText, section: "operations" },
{ to: "/sites", label: "Sites", icon: MapPin, section: "more" },
{ to: "/assets", label: "Assets", icon: Package, section: "more" },
{ to: "/quotes", label: "Quotes", icon: ClipboardList, section: "more", adminOnly: true },
{ to: "/parts-library", label: "Parts Library", icon: Library, section: "more" },
{ to: "/compliance", label: "Compliance", icon: Shield, section: "more" },
{ to: "/audits", label: "Audits", icon: ListChecks, section: "more" },
{ to: "/industry-templates", label: "Templates", icon: BookOpen, section: "admin", adminOnly: true },
{ to: "/reports", label: "Reports", icon: BarChart2, section: "admin", adminOnly: true },
{ to: "/reports/engineers", label: "Performance", icon: BarChart2, section: "admin", adminOnly: true },
{ to: "/engineers", label: "Engineers", icon: Users, section: "admin", adminOnly: true },
{ to: "/settings", label: "Settings", icon: Settings, section: "admin", adminOnly: true }];


const SECTION_LABELS: Record<string, string> = {
  main: "",
  operations: "Operations",
  more: "More",
  admin: "Admin"
};

const STORAGE_KEY = "nav-order";
// Stores { [to]: "operations" | "more" } overrides for items moved between sections
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
  item, isActive, onClick, inOps, onTogglePin,
}: {
  item: typeof DEFAULT_NAV_ITEMS[number];
  isActive: boolean;
  onClick: () => void;
  inOps: boolean;
  onTogglePin: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.to });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

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
          "flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          isActive ?
          "bg-sidebar-accent text-sidebar-primary" :
          "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}>
        <item.icon className="h-4.5 w-4.5" />
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
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useReactState(false);
  useKeyboardShortcuts(() => setShortcutsOpen(true));
  const [whatsappNumber, setWhatsappNumber] = useReactState<string | null>(null);
  const [navOrder, setNavOrder] = useReactState<string[]>(() => loadNavOrder() || DEFAULT_NAV_ITEMS.map((i) => i.to));
  // sectionOverrides: { [to]: "operations" | "more" } — user-controlled moves between sections
  const [sectionOverrides, setSectionOverrides] = useReactState<Record<string, "operations" | "more">>(loadSectionOverrides);

  const handleTogglePin = (to: string, currentSection: "operations" | "more") => {
    setSectionOverrides((prev) => {
      const defaultSection = DEFAULT_NAV_ITEMS.find((i) => i.to === to)?.section as "operations" | "more";
      const next = { ...prev };
      const target = currentSection === "operations" ? "more" : "operations";
      if (target === defaultSection) {
        // Back to default — remove override
        delete next[to];
      } else {
        next[to] = target;
      }
      localStorage.setItem(SECTION_OVERRIDE_KEY, JSON.stringify(next));
      return next;
    });
  };
...
  // Group items by section respecting user overrides
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
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}>
        
        <div className="border-b border-sidebar-border border-dashed">
          <img src={servexaLogo} alt="Servexa logo" className="w-full h-auto object-contain px-4 -mt-2 pb-0" />
          <div className="flex items-center justify-center gap-1 px-3 pb-2">
            <ClockInButton />
            <TodaysVisitsBadge />
            <UnreadMessagesBadge />
            <NotificationBell />
            <button onClick={() => setMobileOpen(false)} className="lg:hidden">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleNavItems.map((i) => i.to)} strategy={verticalListSortingStrategy}>
              {sections.map((section) => {
                const items = itemsBySection[section];
                if (!items || items.length === 0) return null;
                const label = SECTION_LABELS[section];
                const isMoreSection = section === "more";
                return (
                  <div key={section} className="mb-1">
                    {label && !isMoreSection &&
                    <p className="mb-1 mt-3 px-4 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 select-none">
                        {label}
                      </p>
                    }
                    {isMoreSection ? (
                      <>
                        <button
                          onClick={() => setMoreOpen((v) => !v)}
                          className="mt-3 mb-1 flex w-full items-center gap-1 px-4 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors select-none"
                        >
                          <span className="flex-1 text-left">{label}</span>
                          <ChevronDown className={cn("h-3 w-3 transition-transform", moreOpen && "rotate-180")} />
                        </button>
                        {moreOpen && (
                          <div className="space-y-0.5">
                            {items.map((item) => {
                              const isActive = location.pathname === item.to || item.to !== "/" && location.pathname.startsWith(item.to);
                              return (
                                <SortableNavItem
                                  key={item.to}
                                  item={item}
                                  isActive={isActive}
                                  onClick={() => setMobileOpen(false)}
                                  showPin
                                  isPinned={false}
                                  onTogglePin={() => handleTogglePin(item.to)} />
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="space-y-0.5">
                        {items.map((item) => {
                          const isActive = location.pathname === item.to || item.to !== "/" && location.pathname.startsWith(item.to);
                          // Show unpin button for non-core ops items that were pinned from "more"
                          const wasPinnedFromMore = item.section === "more" && pinnedOps.includes(item.to);
                          return (
                            <SortableNavItem
                              key={item.to}
                              item={item}
                              isActive={isActive}
                              onClick={() => setMobileOpen(false)}
                              showPin={wasPinnedFromMore}
                              isPinned={wasPinnedFromMore}
                              onTogglePin={wasPinnedFromMore ? () => handleTogglePin(item.to) : undefined} />);
                        })}
                      </div>
                    )}
                  </div>);
              })}
            </SortableContext>
          </DndContext>
        </nav>

        <div className="shrink-0 border-t border-sidebar-border px-3 py-2">
          {whatsappNumber &&
          <a
            href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-1.5 flex items-center gap-2 rounded-lg bg-sidebar-accent px-2 py-1.5 text-xs font-medium text-sidebar-accent-foreground transition-colors hover:opacity-80">
            
              <MessageCircle className="h-3.5 w-3.5 shrink-0 text-accent" />
              <span className="truncate">{whatsappNumber}</span>
            </a>
          }
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 text-xs">
              <p className="truncate font-medium text-sidebar-accent-foreground">{profile?.full_name || user?.email}</p>
              <p className="text-sidebar-foreground/60 capitalize">{userRole || "user"}</p>
            </div>
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
        <header className="flex h-14 items-center border-b bg-card px-4 lg:hidden">
          <button onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <img src={servexaLogo} alt="Servexa logo" className="ml-3 h-7 w-auto object-contain" />
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
      <CommandPalette />
      <AiHelpWizard />
      <KeyboardShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>);

}