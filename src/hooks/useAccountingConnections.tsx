import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AccountingConnections {
  xero: boolean;
  quickbooks: boolean;
  sage: boolean;
  freeagent: boolean;
  loading: boolean;
}

type AuthFunction = "xero-auth" | "quickbooks-auth" | "sage-auth" | "freeagent-auth";

async function statusFor(fn: AuthFunction): Promise<boolean | null> {
  try {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return null;
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}?action=status`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      },
    );
    if (!res.ok) return null;
    const body = await res.json();
    return !!body?.connected;
  } catch {
    return null;
  }
}

/**
 * Which accounting packages the current org has connected. A null result
 * (network/permission failure) is treated as "connected" for Xero so the
 * long-standing sync button never disappears because of a status hiccup.
 */
export function useAccountingConnections(): AccountingConnections {
  const [state, setState] = useState<AccountingConnections>({
    xero: false,
    quickbooks: false,
    sage: false,
    freeagent: false,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [xero, quickbooks, sage, freeagent] = await Promise.all([
        statusFor("xero-auth"),
        statusFor("quickbooks-auth"),
        statusFor("sage-auth"),
        statusFor("freeagent-auth"),
      ]);
      if (cancelled) return;
      setState({
        xero: xero ?? true,
        quickbooks: quickbooks ?? false,
        sage: sage ?? false,
        freeagent: freeagent ?? false,
        loading: false,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
