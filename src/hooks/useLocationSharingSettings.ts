import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LOCATION_SHARING_KEY, parseLocationSharing, type LocationSharingSettings } from '@/lib/locationSharing';

export function useLocationSharingSettings() {
  const { orgId, user, realUserRole } = useAuth();
  const qc = useQueryClient();
  const queryKey = ['location-sharing-settings', orgId];
  const query = useQuery({
    queryKey,
    enabled: Boolean(orgId && user),
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('value')
        .eq('org_id', orgId!).eq('key', LOCATION_SHARING_KEY).maybeSingle();
      if (error) throw error;
      return parseLocationSharing(data?.value);
    },
    refetchInterval: 5 * 60_000,
  });
  const save = async (next: LocationSharingSettings) => {
    if (realUserRole !== 'admin' || !orgId) throw new Error('Only a company admin can change this setting.');
    const { error } = await supabase.from('app_settings').upsert({
      org_id: orgId, key: LOCATION_SHARING_KEY, value: next as any, updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id,key' });
    if (error) throw error;
    qc.setQueryData(queryKey, next);
  };
  return { settings: query.data ?? null, loaded: !query.isPending, error: query.error, save, canChange: realUserRole === 'admin' };
}
