/**
 * useReconnectRefresh — run a refresh callback when the device regains a
 * genuinely usable connection.
 *
 * Field engineers frequently load a screen with no signal: signed image URLs
 * fail to mint and the component has no reason to try again. This hook fires
 * the callback on the false → true transition of the reachability-backed
 * connectivity state (not just `navigator.onLine`, which lies).
 */
import { useEffect, useRef } from "react";
import { getConnectivity, subscribeConnectivity } from "@/lib/connectivity";

export function useReconnectRefresh(onReconnect: () => void, enabled = true) {
  const cb = useRef(onReconnect);
  cb.current = onReconnect;

  useEffect(() => {
    if (!enabled) return;
    let wasOnline = getConnectivity().isOnline;
    const unsubscribe = subscribeConnectivity((s) => {
      if (s.isOnline && !wasOnline) {
        wasOnline = true;
        try { cb.current(); } catch { /* ignore */ }
      } else if (!s.isOnline) {
        wasOnline = false;
      }
    });
    return unsubscribe;
  }, [enabled]);
}
