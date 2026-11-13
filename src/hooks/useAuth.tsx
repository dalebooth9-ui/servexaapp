import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { primeOrgIdCache } from "@/lib/orgStoragePath";
import {resetGeneratingOrgBrandingCache} from '@/lib/generatingOrgBranding';
import { rememberLoginCompanyBranding } from '@/lib/loginCompanyBranding';
import { countUnsentWork, wipeDeviceData, DEVICE_USER_KEY } from '@/lib/deviceWipe';
import { flushAllDrafts } from '@/lib/draftFlush';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

type Role = "admin" | "engineer" | null;

type AuthContextType = {
  session: Session | null;
  user: User | null;
  /** Effective role — reflects "Preview as engineer" when active. */
  userRole: Role;
  /** Real role from user_roles table, unaffected by preview. */
  realUserRole: Role;
  profile: { full_name: string; whatsapp_number: string | null } | null;
  orgId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  // Engineer preview (client-side role-view only; no impersonation)
  previewEngineerId: string | null;
  previewEngineerName: string | null;
  isPreviewingAsEngineer: boolean;
  /** For engineer-scoped client queries: previewed engineer id when active, else real user id. */
  effectiveUserId: string | null;
  enterEngineerPreview: (engineerId: string | null, engineerName?: string | null) => void;
  exitEngineerPreview: () => void;
};

const PREVIEW_KEY = "engineerPreview:v1";

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  userRole: null,
  realUserRole: null,
  profile: null,
  orgId: null,
  loading: true,
  signOut: async () => {},
  previewEngineerId: null,
  previewEngineerName: null,
  isPreviewingAsEngineer: false,
  effectiveUserId: null,
  enterEngineerPreview: () => {},
  exitEngineerPreview: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [realUserRole, setRealUserRole] = useState<Role>(null);
  const [profile, setProfile] = useState<{ full_name: string; whatsapp_number: string | null } | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [previewEngineerId, setPreviewEngineerId] = useState<string | null>(null);
  const [previewEngineerName, setPreviewEngineerName] = useState<string | null>(null);
  const [previewActive, setPreviewActive] = useState(false);

  // Load persisted preview on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PREVIEW_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p?.active) {
          setPreviewActive(true);
          setPreviewEngineerId(p.engineerId ?? null);
          setPreviewEngineerName(p.engineerName ?? null);
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        resetGeneratingOrgBrandingCache();
        primeOrgIdCache(null);
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Fetch role and profile using setTimeout to avoid deadlock
          setTimeout(async () => {
            // A different person signing in on this device: clear the previous user's stored data first.
            try {
              const prev = localStorage.getItem(DEVICE_USER_KEY);
              if (prev && prev !== session.user.id) await wipeDeviceData({ keepAuth: true });
              localStorage.setItem(DEVICE_USER_KEY, session.user.id);
            } catch { /* ignore */ }
            let [roleRes, profileRes] = await Promise.all([
              supabase.from("user_roles").select("role").eq("user_id", session.user.id),
              supabase.from("profiles").select("full_name, whatsapp_number, org_id").eq("user_id", session.user.id).maybeSingle(),
            ]);
            // Auto-provision on first sign-in for invite-code signups
            const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
            if (!(profileRes.data as any)?.org_id && meta.signup_flow === "invite_code") {
              try {
                await supabase.functions.invoke("provision-new-org", { body: {} });
                profileRes = await supabase.from("profiles").select("full_name, whatsapp_number, org_id").eq("user_id", session.user.id).maybeSingle();
                roleRes = await supabase.from("user_roles").select("role").eq("user_id", session.user.id);
              } catch (e) {
                console.error("Auto-provision failed", e);
              }
            }
            const roles = (roleRes.data ?? []).map((r) => r.role);
            setRealUserRole(roles.includes("admin") ? "admin" : roles.includes("engineer") ? "engineer" : null);
            const prof = profileRes.data as any;
            setProfile(prof ? { full_name: prof.full_name, whatsapp_number: prof.whatsapp_number } : null);
            setOrgId(prof?.org_id ?? null);
            primeOrgIdCache(prof?.org_id ?? null);
            setLoading(false);
          }, 0);
        } else {
          setRealUserRole(null);
          setProfile(null);
          setOrgId(null);
          setLoading(false);
          // Clear preview on sign-out
          setPreviewActive(false);
          setPreviewEngineerId(null);
          setPreviewEngineerName(null);
          try { sessionStorage.removeItem(PREVIEW_KEY); } catch { /* ignore */ }
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const [unsentPrompt, setUnsentPrompt] = useState(0);
  const [sending, setSending] = useState(false);

  const doSignOut = async () => {
    try { await supabase.auth.signOut(); } catch { /* still clear the device */ }
    await wipeDeviceData();
    window.location.replace('/auth');
  };

  const signOut = async () => {
    try { await flushAllDrafts(2000); } catch { /* ignore */ }
    const n = await countUnsentWork();
    if (n > 0) { setUnsentPrompt(n); return; }
    await doSignOut();
  };

  const sendFirst = async () => {
    setSending(true);
    try {
      await flushAllDrafts(5000);
      const [{ processQueue }, { processPhotoQueue }, { processReportQueue }] = await Promise.all([
        import('@/lib/syncQueue'), import('@/lib/photoQueue'), import('@/lib/reportSubmissionQueue'),
      ]);
      await Promise.allSettled([processQueue(), processPhotoQueue(), processReportQueue()]);
    } finally {
      setSending(false);
    }
    const left = await countUnsentWork();
    setUnsentPrompt(left);
    if (left === 0) await doSignOut();
  };

  useEffect(() => {
    if (!orgId || !user) return;
    const remember = () => { void rememberLoginCompanyBranding().catch(() => {}); };
    remember();
    window.addEventListener('company-details-saved', remember);
    return () => window.removeEventListener('company-details-saved', remember);
  }, [orgId, user?.id]);

  const enterEngineerPreview = useCallback((engineerId: string | null, engineerName?: string | null) => {
    if (realUserRole !== "admin") return; // Only admins can enter preview
    setPreviewActive(true);
    setPreviewEngineerId(engineerId);
    setPreviewEngineerName(engineerName ?? null);
    try {
      sessionStorage.setItem(
        PREVIEW_KEY,
        JSON.stringify({ active: true, engineerId, engineerName: engineerName ?? null })
      );
    } catch { /* ignore */ }
  }, [realUserRole]);

  const exitEngineerPreview = useCallback(() => {
    setPreviewActive(false);
    setPreviewEngineerId(null);
    setPreviewEngineerName(null);
    try { sessionStorage.removeItem(PREVIEW_KEY); } catch { /* ignore */ }
  }, []);

  const isPreviewingAsEngineer = previewActive && realUserRole === "admin";
  const userRole: Role = isPreviewingAsEngineer ? "engineer" : realUserRole;
  const effectiveUserId = isPreviewingAsEngineer && previewEngineerId
    ? previewEngineerId
    : user?.id ?? null;

  return (
    <AuthContext.Provider value={{
      session,
      user,
      userRole,
      realUserRole,
      profile,
      orgId,
      loading,
      signOut,
      previewEngineerId,
      previewEngineerName,
      isPreviewingAsEngineer,
      effectiveUserId,
      enterEngineerPreview,
      exitEngineerPreview,
    }}>
      {children}
      <AlertDialog open={unsentPrompt > 0} onOpenChange={(o) => { if (!o && !sending) setUnsentPrompt(0); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsent work. Log out anyway?</AlertDialogTitle>
            <AlertDialogDescription>
              {unsentPrompt} item{unsentPrompt === 1 ? '' : 's'} (report answers or photos) are only on this device. Logging out deletes them from this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <Button variant="outline" disabled={sending} onClick={sendFirst}>{sending ? 'Sending…' : 'Send it first'}</Button>
            <AlertDialogAction disabled={sending} onClick={() => { setUnsentPrompt(0); void doSignOut(); }}>Log out anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
