import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export type ShortcutDef = {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  description: string;
  group: string;
};

export const APP_SHORTCUTS: ShortcutDef[] = [
  { key: "g d", description: "Go to Dashboard", group: "Navigation" },
  { key: "g j", description: "Go to Jobs", group: "Navigation" },
  { key: "g p", description: "Go to Planner", group: "Navigation" },
  { key: "g c", description: "Go to Customers", group: "Navigation" },
  { key: "g e", description: "Go to Engineers", group: "Navigation" },
  { key: "g i", description: "Go to Invoices", group: "Navigation" },
  { key: "g r", description: "Go to Reports", group: "Navigation" },
  { key: "g s", description: "Go to Settings", group: "Navigation" },
  { key: "n j", description: "New Job (opens Jobs page)", group: "Create" },
  { key: "?", shift: true, description: "Show keyboard shortcuts", group: "Help" },
  { key: "k", meta: true, description: "Open command palette", group: "Help" },
];

// Two-key sequence state
let pendingKey: string | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

const GOTO_MAP: Record<string, string> = {
  d: "/",
  j: "/jobs",
  p: "/planner",
  c: "/customers",
  e: "/engineers",
  i: "/invoices",
  r: "/reports",
  s: "/settings",
};

export function useKeyboardShortcuts(onShowHelp: () => void) {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      // Don't fire inside inputs / textareas / contenteditable
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (e.target as HTMLElement)?.isContentEditable
      )
        return;

      // Shift+? → show help
      if (e.key === "?" && e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onShowHelp();
        return;
      }

      // Two-key sequences: g+x or n+x
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const k = e.key.toLowerCase();

        if (pendingKey === "g" && GOTO_MAP[k]) {
          e.preventDefault();
          if (pendingTimer) clearTimeout(pendingTimer);
          pendingKey = null;
          navigate(GOTO_MAP[k]);
          return;
        }

        if (pendingKey === "n" && k === "j") {
          e.preventDefault();
          if (pendingTimer) clearTimeout(pendingTimer);
          pendingKey = null;
          navigate("/jobs");
          // Dispatch a custom event so Jobs page can auto-open the new job dialog
          window.dispatchEvent(new CustomEvent("shortcut:new-job"));
          return;
        }

        if ((k === "g" || k === "n") && !e.shiftKey) {
          pendingKey = k;
          if (pendingTimer) clearTimeout(pendingTimer);
          pendingTimer = setTimeout(() => { pendingKey = null; }, 1200);
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      if (pendingTimer) clearTimeout(pendingTimer);
    };
  }, [navigate, onShowHelp]);
}
