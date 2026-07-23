import { useEffect, useState } from "react";
import {
  type ConnectivityState,
  getConnectivity,
  subscribeConnectivity,
  startConnectivityMonitor,
} from "@/lib/connectivity";

/**
 * React hook that exposes the shared connectivity state (navigator.onLine
 * plus a lightweight reachability probe and Network Information API data).
 */
export function useConnectivity(): ConnectivityState {
  const [s, setS] = useState<ConnectivityState>(() => getConnectivity());
  useEffect(() => {
    startConnectivityMonitor();
    return subscribeConnectivity(setS);
  }, []);
  return s;
}
