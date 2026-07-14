import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { primeOrgIdCache } from "@/lib/orgStoragePath";

type AuthContextType = {
  session: Session | null;
  user: User | null;
  userRole: "admin" | "engineer" | null;
  profile: { full_name: string; whatsapp_number: string | null } | null;
  orgId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  userRole: null,
  profile: null,
  orgId: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<"admin" | "engineer" | null>(null);
  const [profile, setProfile] = useState<{ full_name: string; whatsapp_number: string | null } | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Fetch role and profile using setTimeout to avoid deadlock
          setTimeout(async () => {
            const [roleRes, profileRes] = await Promise.all([
              supabase.from("user_roles").select("role").eq("user_id", session.user.id),
              supabase.from("profiles").select("full_name, whatsapp_number, org_id").eq("user_id", session.user.id).maybeSingle(),
            ]);
            const roles = (roleRes.data ?? []).map((r) => r.role);
            setUserRole(roles.includes("admin") ? "admin" : roles.includes("engineer") ? "engineer" : null);
            const prof = profileRes.data as any;
            setProfile(prof ? { full_name: prof.full_name, whatsapp_number: prof.whatsapp_number } : null);
            setOrgId(prof?.org_id ?? null);
            primeOrgIdCache(prof?.org_id ?? null);
            setLoading(false);
          }, 0);
        } else {
          setUserRole(null);
          setProfile(null);
          setOrgId(null);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, userRole, profile, orgId, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
