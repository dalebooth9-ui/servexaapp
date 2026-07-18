import { ReactNode, useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, LogOut, FileText, LayoutDashboard, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PortalContext {
  customerId: string;
  customerName: string;
  orgId: string;
  orgName: string;
}

export default function PortalLayout() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ctx, setCtx] = useState<PortalContext | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    (async () => {
      const { data: link } = await supabase
        .from("customer_portal_users")
        .select("customer_id, org_id, is_active, customers:customer_id(name), organisations:org_id(name, portal_enabled)")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!link || !link.is_active) { setBlocked("Your portal access has been revoked."); setLoading(false); return; }
      const orgRow: any = link.organisations;
      if (!orgRow?.portal_enabled) { setBlocked("The customer portal is currently disabled."); setLoading(false); return; }

      setCtx({
        customerId: link.customer_id,
        customerName: (link.customers as any)?.name ?? "Your account",
        orgId: link.org_id,
        orgName: orgRow?.name ?? "Provider",
      });
      setLoading(false);
    })();
  }, [user, authLoading]);

  if (authLoading || loading) return <FullScreen><Loader2 className="w-6 h-6 animate-spin" /></FullScreen>;
  if (!user) return <Navigate to="/auth?next=/customer-portal" replace />;
  if (blocked) return <FullScreen><div className="max-w-md text-center space-y-4"><h1 className="text-xl font-semibold">Portal unavailable</h1><p className="text-muted-foreground">{blocked}</p><Button onClick={async () => { await supabase.auth.signOut(); navigate("/auth"); }}><LogOut className="w-4 h-4 mr-2" />Sign out</Button></div></FullScreen>;
  if (!ctx) return <FullScreen>No portal record</FullScreen>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{ctx.orgName}</div>
            <div className="font-semibold">{ctx.customerName} — Compliance portal</div>
          </div>
          <Button variant="ghost" size="sm" onClick={async () => { await supabase.auth.signOut(); navigate("/auth"); }}>
            <LogOut className="w-4 h-4 mr-2" />Sign out
          </Button>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 text-sm">
          <PortalTab to="/customer-portal" icon={<LayoutDashboard className="w-4 h-4" />} label="My sites" end />
          <PortalTab to="/customer-portal/documents" icon={<FileText className="w-4 h-4" />} label="Documents" />
          <PortalTab to="/customer-portal/quotes" icon={<Receipt className="w-4 h-4" />} label="Quotes" />
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet context={ctx satisfies PortalContext} />
      </main>
    </div>
  );
}

function PortalTab({ to, icon, label, end }: { to: string; icon: ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) =>
      `flex items-center gap-2 px-3 py-2 border-b-2 ${isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`
    }>
      {icon}{label}
    </NavLink>
  );
}

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center p-6">{children}</div>;
}

export type { PortalContext };
