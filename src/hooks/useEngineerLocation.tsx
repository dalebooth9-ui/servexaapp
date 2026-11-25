import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLocationSharingSettings } from "@/hooks/useLocationSharingSettings";
import { LOCATION_MIN_GAP_MS, LOCATION_UPDATE_MS, shouldShareLocation } from "@/lib/locationSharing";

export type SharingState = "inactive" | "ask" | "declined" | "denied" | "sharing" | "unsupported";

const SELF_KEY = "servexa_share_location_self";
const askedKey = (uid: string) => `servexa_location_asked_${uid}`;

// Personal opt-in for office staff (admins), stored on this device.
const selfListeners = new Set<() => void>();
export function getSelfOptIn() { try { return localStorage.getItem(SELF_KEY) === "1"; } catch { return false; } }
export function setSelfOptIn(on: boolean) {
  try { on ? localStorage.setItem(SELF_KEY, "1") : localStorage.removeItem(SELF_KEY); } catch { /* ignore */ }
  selfListeners.forEach((l) => l());
}
const subscribeSelf = (l: () => void) => { selfListeners.add(l); return () => selfListeners.delete(l); };

// Called on sign-out so the device stops sending immediately.
let stopActive: (() => void) | null = null;
export function stopLocationSharing() { stopActive?.(); stopActive = null; }

/** Shares this device's location while the app is open, when the company setting applies to the user. */
export function useEngineerLocation() {
  const { user, realUserRole, isPreviewingAsEngineer } = useAuth();
  const { settings } = useLocationSharingSettings();
  const selfOptIn = useSyncExternalStore(subscribeSelf, getSelfOptIn, () => false);
  const [state, setState] = useState<SharingState>("inactive");
  const [startToken, setStartToken] = useState(0);
  const lastSent = useRef(0);

  const applies = Boolean(user && settings && !isPreviewingAsEngineer && shouldShareLocation(settings, realUserRole, selfOptIn));

  useEffect(() => {
    if (!applies || !user) { setState("inactive"); return; }
    if (typeof navigator === "undefined" || !navigator.geolocation) { setState("unsupported"); return; }
    let cancelled = false;
    let watchId: number | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const send = async (pos: GeolocationPosition, force = false) => {
      const now = Date.now();
      if (!force && now - lastSent.current < LOCATION_MIN_GAP_MS) return;
      lastSent.current = now;
      const { latitude, longitude, accuracy, heading, speed } = pos.coords;
      await supabase.from("engineer_locations" as any).upsert({
        user_id: user.id, latitude, longitude, accuracy: accuracy ?? null,
        heading: heading ?? null, speed: speed ?? null, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    };
    const onError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED && !cancelled) { stop(); setState("denied"); }
    };
    const stop = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (timer) clearInterval(timer);
      watchId = null; timer = null;
    };
    const begin = () => {
      if (cancelled) return;
      setState("sharing");
      try { localStorage.setItem(askedKey(user.id), "granted"); } catch { /* ignore */ }
      navigator.geolocation.getCurrentPosition((p) => send(p, true), onError, { enableHighAccuracy: true, timeout: 15000 });
      watchId = navigator.geolocation.watchPosition((p) => send(p), onError, { enableHighAccuracy: true, maximumAge: 30_000 });
      timer = setInterval(() => {
        navigator.geolocation.getCurrentPosition((p) => send(p, true), onError, { enableHighAccuracy: false, timeout: 10000, maximumAge: 30_000 });
      }, LOCATION_UPDATE_MS);
      stopActive = stop;
    };

    const asked = (() => { try { return localStorage.getItem(askedKey(user.id)); } catch { return null; } })();
    const decide = (perm: PermissionState | "unknown") => {
      if (cancelled) return;
      if (perm === "granted" || startToken > 0) return begin();
      if (perm === "denied") return setState("denied");
      // prompt / unknown (e.g. older iPhones without the Permissions API)
      if (asked === "granted") return begin();
      setState(asked === "declined" ? "declined" : "ask");
    };
    const perms = (navigator as any).permissions;
    if (perms?.query) {
      perms.query({ name: "geolocation" }).then((s: PermissionStatus) => {
        decide(s.state);
        s.onchange = () => { if (!cancelled && s.state === "granted") { stop(); begin(); } };
      }).catch(() => decide("unknown"));
    } else decide("unknown");

    return () => { cancelled = true; stop(); if (stopActive === stop) stopActive = null; };
  }, [applies, user, startToken]);

  const allow = useCallback(() => setStartToken((n) => n + 1), []);
  const decline = useCallback(() => {
    if (user) { try { localStorage.setItem(askedKey(user.id), "declined"); } catch { /* ignore */ } }
    setState("declined");
  }, [user]);

  return { state, allow, decline };
}
