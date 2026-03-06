import { useState } from "react";
import {
  LayoutDashboard, ClipboardList, FileText, Package, Users2,
  UserCircle, BarChart3, Settings, Bell, Search, Plus, ChevronRight,
  TrendingUp, Clock, CheckCircle2, AlertCircle, Wrench, MapPin,
  MoreHorizontal, ArrowUpRight, ArrowDownRight, ChevronDown, Menu, X,
  Zap, Calendar, Activity,
} from "lucide-react";

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const brand = {
  primary: "#1E3A5F",
  primaryLight: "#2A5080",
  primaryDim: "#16304F",
  accent: "#F97316",
  accentLight: "#FFF7ED",
  bg: "#F4F6F8",
  surface: "#FFFFFF",
  border: "#E2E8F0",
  text: "#0F172A",
  muted: "#64748B",
  mutedBg: "#F1F5F9",
};

// ─── Static data ──────────────────────────────────────────────────────────────
const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: ClipboardList, label: "Work Orders", badge: 14 },
  { icon: FileText, label: "Service Reports", badge: 3 },
  { icon: Package, label: "Assets" },
  { icon: Users2, label: "Field Team" },
  { icon: UserCircle, label: "Customers" },
  { icon: BarChart3, label: "Insights" },
];

const kpis = [
  {
    label: "Active Work Orders",
    value: "47",
    delta: "+8%",
    up: true,
    icon: ClipboardList,
    color: brand.primary,
    bg: "#EEF3F9",
  },
  {
    label: "Scheduled Today",
    value: "12",
    delta: "+2",
    up: true,
    icon: Calendar,
    color: "#0EA5E9",
    bg: "#E0F4FE",
  },
  {
    label: "Engineers in Field",
    value: "9",
    delta: "-1",
    up: false,
    icon: MapPin,
    color: brand.accent,
    bg: "#FFF4EC",
  },
  {
    label: "Open Service Reports",
    value: "23",
    delta: "+5",
    up: false,
    icon: FileText,
    color: "#8B5CF6",
    bg: "#F3F0FF",
  },
  {
    label: "Completed This Week",
    value: "61",
    delta: "+14%",
    up: true,
    icon: CheckCircle2,
    color: "#10B981",
    bg: "#ECFDF5",
  },
];

type StatusType = "In Progress" | "Scheduled" | "Completed" | "On Hold";

const activity: {
  id: string;
  customer: string;
  engineer: string;
  type: string;
  status: StatusType;
  updated: string;
  priority: "High" | "Medium" | "Low";
}[] = [
  { id: "WO-2841", customer: "Meridian Corp", engineer: "James Kirk", type: "HVAC Service", status: "In Progress", updated: "2 min ago", priority: "High" },
  { id: "WO-2840", customer: "Apex Logistics", engineer: "Sarah Chen", type: "Boiler Inspection", status: "Scheduled", updated: "18 min ago", priority: "Medium" },
  { id: "WO-2839", customer: "BlueStar Hotels", engineer: "Tom Walsh", type: "Electrical Fault", status: "In Progress", updated: "34 min ago", priority: "High" },
  { id: "WO-2838", customer: "Greenfield NHS", engineer: "Priya Patel", type: "Fire System Test", status: "Completed", updated: "1 hr ago", priority: "Low" },
  { id: "WO-2837", customer: "Orion Retail", engineer: "Marcus Lee", type: "Plumbing Repair", status: "On Hold", updated: "2 hr ago", priority: "Medium" },
  { id: "WO-2836", customer: "Crown Facilities", engineer: "Anna Brooks", type: "PPM Service", status: "Completed", updated: "3 hr ago", priority: "Low" },
  { id: "WO-2835", customer: "Nexus Property", engineer: "James Kirk", type: "Gas Safety Check", status: "Scheduled", updated: "4 hr ago", priority: "Medium" },
];

const statusConfig: Record<StatusType, { bg: string; text: string; dot: string }> = {
  "In Progress": { bg: "#EEF3F9", text: brand.primary, dot: brand.primary },
  "Scheduled":   { bg: "#E0F4FE", text: "#0369A1", dot: "#0EA5E9" },
  "Completed":   { bg: "#ECFDF5", text: "#065F46", dot: "#10B981" },
  "On Hold":     { bg: "#FFF4EC", text: "#9A3412", dot: brand.accent },
};

const priorityConfig = {
  High:   { color: "#EF4444", bg: "#FEF2F2" },
  Medium: { color: brand.accent, bg: "#FFF7ED" },
  Low:    { color: "#10B981", bg: "#ECFDF5" },
};

const engineerActivity = [
  { name: "James Kirk",   jobs: 6, completion: 83, online: true },
  { name: "Sarah Chen",   jobs: 4, completion: 100, online: true },
  { name: "Tom Walsh",    jobs: 5, completion: 60, online: true },
  { name: "Priya Patel",  jobs: 3, completion: 100, online: false },
  { name: "Marcus Lee",   jobs: 5, completion: 40, online: true },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const hue = (name.charCodeAt(0) * 37 + name.charCodeAt(1) * 13) % 360;
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: `hsl(${hue}, 55%, 52%)`,
        color: "#fff", fontWeight: 600,
        fontSize: size * 0.36,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

function StatusBadge({ status }: { status: StatusType }) {
  const cfg = statusConfig[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 20,
      background: cfg.bg, color: cfg.text,
      fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: "High" | "Medium" | "Low" }) {
  const cfg = priorityConfig[priority];
  return (
    <span style={{
      display: "inline-flex", padding: "2px 8px", borderRadius: 12,
      background: cfg.bg, color: cfg.color,
      fontSize: 11, fontWeight: 600,
    }}>
      {priority}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Servexa() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("Dashboard");

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: brand.bg, fontFamily: "'Inter', system-ui, sans-serif", color: brand.text }}>

      {/* ── Sidebar ── */}
      <>
        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 40 }}
            onClick={() => setMobileOpen(false)}
          />
        )}
        <aside style={{
          width: sidebarOpen ? 240 : 68,
          minWidth: sidebarOpen ? 240 : 68,
          background: brand.primary,
          display: "flex", flexDirection: "column",
          transition: "width 0.2s ease, min-width 0.2s ease",
          position: "sticky", top: 0, height: "100vh", zIndex: 30,
          flexShrink: 0,
        }}
          className="hidden md:flex"
        >
          {/* Logo */}
          <div style={{
            padding: "20px 16px 16px",
            borderBottom: `1px solid rgba(255,255,255,0.08)`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: brand.accent,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <Zap size={18} color="#fff" strokeWidth={2.5} />
            </div>
            {sidebarOpen && (
              <div style={{ overflow: "hidden" }}>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px", lineHeight: 1.2 }}>Servexa</div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 500 }}>Service Operations</div>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
            {navItems.map((item) => {
              const active = activeNav === item.label;
              return (
                <button
                  key={item.label}
                  onClick={() => setActiveNav(item.label)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: sidebarOpen ? "9px 12px" : "9px 0",
                    justifyContent: sidebarOpen ? "flex-start" : "center",
                    borderRadius: 8, marginBottom: 2, border: "none", cursor: "pointer",
                    background: active ? "rgba(255,255,255,0.12)" : "transparent",
                    color: active ? "#fff" : "rgba(255,255,255,0.6)",
                    fontWeight: active ? 600 : 400,
                    fontSize: 13.5, transition: "all 0.15s",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.07)"; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  {active && (
                    <span style={{
                      position: "absolute", left: 0, top: "20%", height: "60%",
                      width: 3, borderRadius: "0 3px 3px 0", background: brand.accent,
                    }} />
                  )}
                  <item.icon size={18} strokeWidth={active ? 2.2 : 1.8} style={{ flexShrink: 0 }} />
                  {sidebarOpen && (
                    <>
                      <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
                      {item.badge && (
                        <span style={{
                          background: active ? brand.accent : "rgba(255,255,255,0.15)",
                          color: "#fff", fontSize: 10, fontWeight: 700,
                          padding: "1px 6px", borderRadius: 20,
                        }}>{item.badge}</span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Settings + collapse */}
          <div style={{ padding: "8px", borderTop: `1px solid rgba(255,255,255,0.08)` }}>
            <button
              onClick={() => setActiveNav("Settings")}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: sidebarOpen ? "9px 12px" : "9px 0",
                justifyContent: sidebarOpen ? "flex-start" : "center",
                borderRadius: 8, border: "none", cursor: "pointer",
                background: "transparent", color: "rgba(255,255,255,0.5)",
                fontSize: 13.5, transition: "all 0.15s", marginBottom: 6,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.07)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <Settings size={18} strokeWidth={1.8} />
              {sidebarOpen && <span>Settings</span>}
            </button>
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: "100%", padding: "8px",
                borderRadius: 8, border: "none", cursor: "pointer",
                background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)",
                transition: "all 0.15s",
              }}
            >
              <ChevronRight
                size={15}
                style={{ transform: sidebarOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
              />
            </button>
          </div>
        </aside>
      </>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

        {/* ── Top Header ── */}
        <header style={{
          background: brand.surface, borderBottom: `1px solid ${brand.border}`,
          padding: "0 24px", height: 60,
          display: "flex", alignItems: "center", gap: 16,
          position: "sticky", top: 0, zIndex: 20,
        }}>
          {/* Mobile burger */}
          <button
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            style={{ background: "none", border: "none", cursor: "pointer", color: brand.muted, padding: 4 }}
          >
            <Menu size={20} />
          </button>

          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: brand.muted }}>
            <span style={{ color: brand.muted }}>Operations</span>
            <ChevronRight size={13} />
            <span style={{ color: brand.text, fontWeight: 600 }}>{activeNav}</span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Search */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: brand.mutedBg, border: `1px solid ${brand.border}`,
            borderRadius: 8, padding: "7px 12px", width: 220,
          }}>
            <Search size={14} color={brand.muted} />
            <input
              placeholder="Search work orders…"
              style={{
                border: "none", background: "transparent", outline: "none",
                fontSize: 13, color: brand.text, width: "100%",
              }}
            />
          </div>

          {/* Notifications */}
          <button style={{
            position: "relative", background: brand.mutedBg,
            border: `1px solid ${brand.border}`, borderRadius: 8,
            width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}>
            <Bell size={16} color={brand.muted} />
            <span style={{
              position: "absolute", top: 6, right: 6, width: 7, height: 7,
              borderRadius: "50%", background: brand.accent,
              border: `2px solid ${brand.surface}`,
            }} />
          </button>

          {/* User */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: brand.mutedBg, border: `1px solid ${brand.border}`,
            borderRadius: 8, padding: "5px 10px 5px 6px", cursor: "pointer",
          }}>
            <Avatar name="Alex Morgan" size={26} />
            <span style={{ fontSize: 13, fontWeight: 500, color: brand.text }}>Alex Morgan</span>
            <ChevronDown size={12} color={brand.muted} />
          </div>
        </header>

        {/* ── Page content ── */}
        <main style={{ flex: 1, padding: "24px", overflowY: "auto" }}>

          {/* Page title + actions */}
          <div style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            flexWrap: "wrap", gap: 12, marginBottom: 24,
          }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: brand.text, margin: 0, letterSpacing: "-0.4px" }}>
                Good morning, Alex 👋
              </h1>
              <p style={{ fontSize: 13, color: brand.muted, margin: "3px 0 0" }}>
                Thursday, 6 March 2026 — here's what's happening today.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 16px", borderRadius: 8, border: `1px solid ${brand.border}`,
                background: brand.surface, color: brand.text,
                fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}>
                <FileText size={14} />
                New Service Report
              </button>
              <button style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 16px", borderRadius: 8, border: "none",
                background: brand.accent, color: "#fff",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                boxShadow: `0 2px 8px rgba(249,115,22,0.35)`,
              }}>
                <Plus size={15} strokeWidth={2.5} />
                New Work Order
              </button>
            </div>
          </div>

          {/* ── KPI cards ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 14, marginBottom: 24,
          }}>
            {kpis.map((kpi) => (
              <div key={kpi.label} style={{
                background: brand.surface, borderRadius: 12,
                border: `1px solid ${brand.border}`,
                padding: "18px 18px 16px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                display: "flex", flexDirection: "column", gap: 12,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: kpi.bg, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <kpi.icon size={18} color={kpi.color} strokeWidth={2} />
                  </div>
                  <span style={{
                    display: "flex", alignItems: "center", gap: 2,
                    fontSize: 11, fontWeight: 600,
                    color: kpi.up ? "#10B981" : "#EF4444",
                  }}>
                    {kpi.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {kpi.delta}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: brand.text, lineHeight: 1, letterSpacing: "-0.5px" }}>
                    {kpi.value}
                  </div>
                  <div style={{ fontSize: 12, color: brand.muted, marginTop: 3, lineHeight: 1.3 }}>{kpi.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Bottom grid ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, alignItems: "start" }}
            className="servexa-grid">

            {/* Recent Activity table */}
            <div style={{
              background: brand.surface, borderRadius: 12,
              border: `1px solid ${brand.border}`,
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              overflow: "hidden",
            }}>
              <div style={{
                padding: "16px 20px",
                borderBottom: `1px solid ${brand.border}`,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: brand.text }}>Recent Activity</h2>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: brand.muted }}>Live updates from the field</p>
                </div>
                <button style={{
                  display: "flex", alignItems: "center", gap: 4,
                  fontSize: 12, color: brand.primary, fontWeight: 600,
                  background: "none", border: "none", cursor: "pointer",
                }}>
                  View all <ChevronRight size={12} />
                </button>
              </div>

              {/* Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: brand.mutedBg }}>
                      {["Job ID", "Customer", "Engineer", "Type", "Priority", "Status", "Updated", ""].map((h) => (
                        <th key={h} style={{
                          padding: "9px 14px", textAlign: "left",
                          fontSize: 11, fontWeight: 600, color: brand.muted,
                          letterSpacing: "0.03em", textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((row, i) => (
                      <tr
                        key={row.id}
                        style={{
                          borderTop: `1px solid ${brand.border}`,
                          transition: "background 0.1s",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = brand.mutedBg)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                          <span style={{
                            fontFamily: "monospace", fontSize: 12, fontWeight: 700,
                            color: brand.primary,
                          }}>{row.id}</span>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: brand.text }}>{row.customer}</span>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <Avatar name={row.engineer} size={24} />
                            <span style={{ fontSize: 12, color: brand.text, whiteSpace: "nowrap" }}>{row.engineer}</span>
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span style={{ fontSize: 12, color: brand.muted, whiteSpace: "nowrap" }}>{row.type}</span>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <PriorityBadge priority={row.priority} />
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <StatusBadge status={row.status} />
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <Clock size={11} color={brand.muted} />
                            <span style={{ fontSize: 11, color: brand.muted, whiteSpace: "nowrap" }}>{row.updated}</span>
                          </div>
                        </td>
                        <td style={{ padding: "12px 10px" }}>
                          <button style={{ background: "none", border: "none", cursor: "pointer", color: brand.muted, padding: 4 }}>
                            <MoreHorizontal size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right panel */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Field team status */}
              <div style={{
                background: brand.surface, borderRadius: 12,
                border: `1px solid ${brand.border}`,
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                overflow: "hidden",
              }}>
                <div style={{
                  padding: "14px 16px",
                  borderBottom: `1px solid ${brand.border}`,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: brand.text }}>Field Team</h2>
                  <span style={{
                    fontSize: 11, color: "#10B981", fontWeight: 600,
                    background: "#ECFDF5", padding: "2px 8px", borderRadius: 20,
                  }}>
                    4 Online
                  </span>
                </div>
                <div style={{ padding: "8px 0" }}>
                  {engineerActivity.map((eng) => (
                    <div key={eng.name} style={{
                      padding: "9px 16px",
                      display: "flex", flexDirection: "column", gap: 5,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ position: "relative" }}>
                          <Avatar name={eng.name} size={28} />
                          <span style={{
                            position: "absolute", bottom: 0, right: 0,
                            width: 8, height: 8, borderRadius: "50%",
                            background: eng.online ? "#10B981" : "#CBD5E1",
                            border: `2px solid ${brand.surface}`,
                          }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 12.5, fontWeight: 500, color: brand.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {eng.name}
                            </span>
                            <span style={{ fontSize: 11, color: brand.muted, flexShrink: 0, marginLeft: 4 }}>
                              {eng.jobs} jobs
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div style={{ height: 4, background: brand.mutedBg, borderRadius: 4, marginTop: 4, overflow: "hidden" }}>
                            <div style={{
                              height: "100%", borderRadius: 4,
                              width: `${eng.completion}%`,
                              background: eng.completion === 100 ? "#10B981" : brand.primary,
                              transition: "width 0.4s ease",
                            }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick actions */}
              <div style={{
                background: brand.surface, borderRadius: 12,
                border: `1px solid ${brand.border}`,
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                padding: "14px 16px",
              }}>
                <h2 style={{ margin: "0 0 10px", fontSize: 13.5, fontWeight: 700, color: brand.text }}>Quick Actions</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    { icon: Plus, label: "New Work Order", accent: true },
                    { icon: FileText, label: "Create Service Report", accent: false },
                    { icon: Users2, label: "Assign Engineer", accent: false },
                    { icon: Activity, label: "View Live Map", accent: false },
                  ].map((action) => (
                    <button key={action.label} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      width: "100%", padding: "9px 12px",
                      borderRadius: 8, border: `1px solid ${action.accent ? brand.accent : brand.border}`,
                      background: action.accent ? brand.accent : "transparent",
                      color: action.accent ? "#fff" : brand.text,
                      fontSize: 12.5, fontWeight: action.accent ? 600 : 400,
                      cursor: "pointer", textAlign: "left",
                      transition: "all 0.15s",
                    }}
                      onMouseEnter={(e) => {
                        if (!action.accent) (e.currentTarget as HTMLButtonElement).style.background = brand.mutedBg;
                      }}
                      onMouseLeave={(e) => {
                        if (!action.accent) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                      }}
                    >
                      <action.icon size={14} strokeWidth={2} />
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Completion rate */}
              <div style={{
                background: `linear-gradient(135deg, ${brand.primary}, ${brand.primaryLight})`,
                borderRadius: 12, padding: "18px 16px",
                boxShadow: `0 4px 16px rgba(30,58,95,0.2)`,
              }}>
                <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                  This Week
                </div>
                <div style={{ color: "#fff", fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px" }}>
                  87%
                </div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 2 }}>
                  Job completion rate
                </div>
                <div style={{ marginTop: 12, height: 6, background: "rgba(255,255,255,0.15)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: "87%", background: brand.accent, borderRadius: 4 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>61 completed</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>9 remaining</span>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Responsive style */}
      <style>{`
        @media (max-width: 900px) {
          .servexa-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
