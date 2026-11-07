import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { canChangeDigitalTwin, digitalTwinEnabledForCompany, DIGITAL_TWIN_SETTINGS_KEY } from '@/lib/digitalTwinSettings';

export function useDigitalTwinSettings() {
  const { orgId, user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['digital-twin-settings', orgId, user?.id];
  const query = useQuery({
    queryKey,
    enabled: Boolean(orgId && user),
    queryFn: async () => {
      if (!orgId) return false;
      const { data, error } = await supabase.from('app_settings')
        .select('org_id,value').eq('org_id', orgId).eq('key', DIGITAL_TWIN_SETTINGS_KEY).maybeSingle();
      if (error) throw error;
      return digitalTwinEnabledForCompany(orgId, data);
    },
    refetchInterval: 30_000,
  });
  const save = async (enabled: boolean) => {
    if (!canChangeDigitalTwin(userRole, orgId) || !orgId) throw new Error('Only a company admin can change this setting.');
    // app_settings RLS also validates company ownership and admin role on the server.
    const { error } = await supabase.from('app_settings').upsert({
      org_id: orgId, key: DIGITAL_TWIN_SETTINGS_KEY, value: { enabled }, updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id,key' });
    if (error) throw error;
    queryClient.setQueryData(queryKey, enabled);
    await queryClient.invalidateQueries({ queryKey });
  };
  return {
    enabled: Boolean(orgId && user && !query.isError && query.data === true),
    loaded: Boolean(orgId && user && !query.isPending),
    error: query.error,
    canChange: canChangeDigitalTwin(userRole, orgId),
    save,
  };
}