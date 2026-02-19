import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEngineerLocation } from "@/hooks/useEngineerLocation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Briefcase, Users, Settings, LogOut, Menu, X, CalendarDays, Building2, FileText, MapPin, Package, Shield, ClipboardCheck, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import CommandPalette from "@/components/CommandPalette";
import NotificationBell from "@/components/NotificationBell";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/customers", label: "Customers", icon: Building2 },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/sites", label: "Sites", icon: MapPin },
  { to: "/assets", label: "Assets", icon: Package },
  { to: "/parts-library", label: "Parts Library", icon: Library },
  { to: "/compliance", label: "Compliance", icon: Shield },
  { to: "/audits", label: "Audits", icon: ClipboardCheck },
  { to: "/planner", label: "Planner", icon: CalendarDays },
  { to: "/engineers", label: "Engineers", icon: Users, adminOnly: true },
  { to: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, userRole, profile, signOut } = useAuth();
  useEngineerLocation(); // Start GPS tracking for engineers
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleNavItems = navItems.filter((item) => !item.adminOnly || userRole === "admin");

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
          <img src="/favicon.png" alt="FieldReport logo" className="h-9 w-9 rounded-lg" />
          <span className="text-lg font-bold text-sidebar-primary-foreground">FieldReport</span>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <button onClick={() => setMobileOpen(false)} className="lg:hidden">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {visibleNavItems.map((item) => {
            const isActive = location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="h-4.5 w-4.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="mb-3 text-xs">
            <p className="font-medium text-sidebar-accent-foreground">{profile?.full_name || user?.email}</p>
            <p className="text-sidebar-foreground/60 capitalize">{userRole || "user"}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <LogOut className="mr-2 h-4 w-4" /> Sign Out
          </Button>
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
    </div>
  );
}
