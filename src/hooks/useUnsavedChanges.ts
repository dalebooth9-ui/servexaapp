import { useEffect } from "react";

/**
 * Warns the user when they try to navigate away with unsaved changes.
 * Uses beforeunload (tab close/refresh) and history popstate (back button).
 * Works with BrowserRouter (no data router required).
 */
export function useUnsavedChanges(
  isDirty: boolean,
  message = "You have unsaved changes. Are you sure you want to leave?"
) {
  // Block browser tab close / refresh
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, message]);

  // Block browser back/forward button
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: PopStateEvent) => {
      const confirmed = window.confirm(message);
      if (!confirmed) {
        // Push the current state back to cancel navigation
        window.history.pushState(null, "", window.location.href);
      }
    };
    // Push a dummy state so we can intercept the back action
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [isDirty, message]);
}
