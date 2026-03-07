import { useEffect, useCallback } from "react";
import { useBlocker } from "react-router-dom";

/**
 * Warns the user when they try to navigate away with unsaved changes.
 * Also intercepts the browser's beforeunload event (tab close / refresh).
 *
 * @param isDirty - whether there are unsaved changes
 * @param message - optional custom message shown in the confirm dialog
 */
export function useUnsavedChanges(
  isDirty: boolean,
  message = "You have unsaved changes. Are you sure you want to leave?"
) {
  // Block react-router navigation
  const blocker = useBlocker(
    useCallback(({ currentLocation, nextLocation }) => {
      return isDirty && currentLocation.pathname !== nextLocation.pathname;
    }, [isDirty])
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      const confirmed = window.confirm(message);
      if (confirmed) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    }
  }, [blocker, message]);

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
}
