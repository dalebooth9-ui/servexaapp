/**
 * One-off "you're on mobile data" advisory shown when a large upload starts
 * on a cellular connection. Never blocks the upload — the toast has a
 * "Don't show again on this device" action that persists the opt-out in
 * localStorage.
 */
import { toast } from "sonner";
import { getConnectivity } from "@/lib/connectivity";

const OPT_OUT_KEY = "servexa_mobile_data_notice_off";
const SESSION_SHOWN_KEY = "servexa_mobile_data_notice_shown_session";

function optedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

function setOptedOut() {
  try {
    localStorage.setItem(OPT_OUT_KEY, "1");
  } catch {
    /* ignore */
  }
}

function shownThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_SHOWN_KEY) === "1";
  } catch {
    return false;
  }
}

function markShownThisSession() {
  try {
    sessionStorage.setItem(SESSION_SHOWN_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Fire the advisory if:
 *  - the device reports it's on cellular
 *  - the user hasn't permanently opted out
 *  - we haven't already shown it this session (avoid stacking on bulk actions)
 */
export function maybeShowMobileDataAdvisory(context?: string) {
  if (typeof window === "undefined") return;
  if (optedOut() || shownThisSession()) return;
  const c = getConnectivity();
  if (!c.isCellular) return;

  markShownThisSession();
  toast.info(
    context
      ? `You're on mobile data — ${context} will use your data allowance.`
      : "You're on mobile data — this upload will use your data allowance.",
    {
      duration: 8000,
      action: {
        label: "Don't show again",
        onClick: () => setOptedOut(),
      },
    },
  );
}
