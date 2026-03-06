import { ReactNode, useEffect, useState as useReactState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEngineerLocation } from "@/hooks/useEngineerLocation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Briefcase, Users, Settings, LogOut, Menu, X, CalendarDays, Building2, FileText, MapPin, Package, Shield, ClipboardCheck, Library, MessageCircle, BarChart2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import CommandPalette from "@/components/CommandPalette";
import NotificationBell from "@/components/NotificationBell";
import AiHelpWizard from "@/components/AiHelpWizard";
import ClockInButton from "@/components/ClockInButton";
import { supabase } from "@/integrations/supabase/client";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const DEFAULT_NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/customers", label: "Customers", icon: Building2 },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/sites", label: "Sites", icon: MapPin },
  { to: "/assets", label: "Assets", icon: Package },
  { to: "/parts-library", label: "Parts Library", icon: Library },
  { to: "/industry-templates", label: "Templates", icon: ClipboardCheck },
  { to: "/compliance", label: "Compliance", icon: Shield },
  { to: "/audits", label: "Audits", icon: ClipboardCheck },
  { to: "/planner", label: "Planner", icon: CalendarDays },
  { to: "/reports", label: "Reports", icon: BarChart2, adminOnly: true },
  { to: "/reports/engineers", label: "Performance", icon: BarChart2, adminOnly: true },
  { to: "/engineers", label: "Engineers", icon: Users, adminOnly: true },
  { to: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

const STORAGE_KEY = "nav-order";

function loadNavOrder(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function SortableNavItem({ item, isActive, onClick }: {
  item: typeof DEFAULT_NAV_ITEMS[number];
  isActive: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.to });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 group">
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 opacity-0 group-hover:opacity-40 hover:!opacity-80 transition-opacity text-sidebar-foreground"
        tabIndex={-1}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Link
        to={item.to}
        onClick={onClick}
        className={cn(
          "flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-primary"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <item.icon className="h-4.5 w-4.5" />
        {item.label}
      </Link>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, userRole, profile, signOut } = useAuth();
  useEngineerLocation();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useReactState<string | null>(null);
  const [navOrder, setNavOrder] = useReactState<string[]>(() => loadNavOrder() || DEFAULT_NAV_ITEMS.map((i) => i.to));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "business_whatsapp_number")
      .single()
      .then(({ data }) => {
        if (data?.value && typeof data.value === "string" && data.value !== "Not configured") {
          setWhatsappNumber(data.value);
        }
      });
  }, []);

  const orderedItems = navOrder
    .map((to) => DEFAULT_NAV_ITEMS.find((i) => i.to === to))
    .filter(Boolean) as typeof DEFAULT_NAV_ITEMS;

  // Append any new items not in saved order
  const extraItems = DEFAULT_NAV_ITEMS.filter((i) => !navOrder.includes(i.to));
  const allOrderedItems = [...orderedItems, ...extraItems];

  const visibleNavItems = allOrderedItems.filter((item) => !item.adminOnly || userRole === "admin");

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = navOrder.indexOf(active.id as string);
    const newIndex = navOrder.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(navOrder, oldIndex, newIndex);
    setNavOrder(newOrder);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newOrder));
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
          <img src="/favicon.png" alt="FieldReport logo" className="h-11 w-11 rounded-lg" />
          <span className="text-lg font-bold text-sidebar-primary-foreground">FieldReport</span>
          <div className="ml-auto flex items-center gap-1.5">
            <ClockInButton />
            <NotificationBell />
            <button onClick={() => setMobileOpen(false)} className="lg:hidden">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto space-y-0.5 px-3 py-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleNavItems.map((i) => i.to)} strategy={verticalListSortingStrategy}>
              {visibleNavItems.map((item) => {
                const isActive = location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to));
                return (
                  <SortableNavItem
                    key={item.to}
                    item={item}
                    isActive={isActive}
                    onClick={() => setMobileOpen(false)}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </nav>

        <div className="shrink-0 border-t border-sidebar-border px-3 py-2">
          {whatsappNumber && (
            <a
              href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-1.5 flex items-center gap-2 rounded-lg bg-sidebar-accent px-2 py-1.5 text-xs font-medium text-sidebar-accent-foreground transition-colors hover:opacity-80"
            >
              <MessageCircle className="h-3.5 w-3.5 shrink-0 text-accent" />
              <span className="truncate">{whatsappNumber}</span>
            </a>
          )}
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
          <img src="/favicon.png" alt="FieldReport logo" className="ml-3 h-7 w-7 rounded" />
          <span className="font-semibold">FieldReport</span>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
      <CommandPalette />
      <AiHelpWizard />
    </div>
  );
}
