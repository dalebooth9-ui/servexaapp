import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { requireCurrentOrgId } from '@/lib/tenantQueries';
import { buildDurableRef, resolveToSignedUrl } from '@/lib/durableStorageRef';
import { companyDetailsErrors, companyLogoFallback, type CompanyDetails } from '@/lib/companyDetails';
import { VIVA_ORG_ID } from '@/lib/generatingOrgBranding';

export default function CompanyBrandColourCard() {
  const [params] = useSearchParams();
  const [orgId, setOrgId] = useState('');
  const [details, setDetails] = useState<CompanyDetails>({ name: '', logo_url: null, primary_color: null });
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const errors = companyDetailsErrors(details);
  useEffect(() => { (async () => {
    const id = await requireCurrentOrgId();
    const { data, error } = await supabase.from('organisations').select('name,logo_url,primary_color').eq('id', id).single();
    if (error) throw error;
    setOrgId(id); setDetails(data);
  })().catch(() => { setLoadError(true); toast.error('Company details could not be loaded. Refresh and try again.'); }).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    let alive = true;
    const ref = companyLogoFallback({ isViva: orgId === VIVA_ORG_ID, logoUrl: details.logo_url });
    (async () => {
      const url = ref.startsWith('/') ? ref : await resolveToSignedUrl(ref);
      if (alive) setPreview(url || '');
    })();
    return () => { alive = false; };
  }, [orgId, details.logo_url]);
  useEffect(() => {
    if (loading || (params.get('setup') !== '1' && params.get('section') !== 'company-details')) return;
    setShowErrors(true);
    const t = setTimeout(() => {
      const key = Object.entries(companyDetailsErrors(details)).find(([, value]) => value)?.[0];
      document.getElementById(key ? `company-${key}` : 'company-details')?.focus();
    }, 250);
    return () => clearTimeout(t);
  }, [loading, params]);
  const upload = async (file?: File) => {
    if (!file || !orgId) return;
    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(file.type)) { toast.error('Choose a PNG, JPG or SVG logo.'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2MB.'); return; }
    setBusy(true);
    try {
      const extension = file.type === 'image/svg+xml' ? 'svg' : file.type === 'image/jpeg' ? 'jpg' : 'png';
      const path = `${orgId}/print-logos/company-${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from('customer-logos').upload(path, file, { contentType: file.type });
      if (error) throw error;
      setDetails(prev => ({ ...prev, logo_url: buildDurableRef('customer-logos', path) }));
    } catch { toast.error('Logo could not be uploaded. Please try again.'); } finally { setBusy(false); }
  };
  const save = async () => {
    setShowErrors(true);
    // Name is required; logo and colour can be saved later, but keep Step 1 open until all three are set.
    if (errors.name || (details.primary_color && errors.primary_color)) {
      document.getElementById(errors.name ? 'company-name' : 'company-primary_color')?.focus(); return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('save_company_details', { p_name: details.name.trim(), p_logo_url: details.logo_url || null, p_primary_color: details.primary_color || null });
    setBusy(false);
    if (error) { toast.error('Company details could not be saved.', { description: error.message }); return; }
    window.dispatchEvent(new Event('company-details-saved'));
    toast.success('Company details saved');
  };
  return <section id="company-details" data-setup="company-details" data-assistant-target="Company details" tabIndex={-1} className="scroll-mt-24 space-y-4 border-b pb-6">
    <h2 className="text-lg font-semibold">Company details</h2>
    {loading ? <p className="text-sm text-muted-foreground">Loading company details…</p> : <>
      <div className="grid gap-5 sm:grid-cols-3">
        <div className="space-y-2"><Label htmlFor="company-name">Company name (required)</Label><Input id="company-name" value={details.name} aria-invalid={showErrors && !!errors.name} className={showErrors && errors.name ? 'border-destructive' : ''} onChange={e => setDetails(prev => ({ ...prev, name: e.target.value }))} />{showErrors && errors.name && <p className="text-xs text-destructive">{errors.name}</p>}</div>
        <div className="space-y-2"><Label htmlFor="company-logo_url">Company logo</Label>{preview && <img src={preview} alt={`${details.name} logo`} className="h-16 w-full object-contain object-left" />}<Input id="company-logo_url" type="file" accept="image/png,image/jpeg,image/svg+xml" disabled={busy || loadError} aria-invalid={showErrors && !!errors.logo_url} className={showErrors && errors.logo_url ? 'border-destructive' : ''} onChange={e => upload(e.target.files?.[0])} /><p className="text-xs text-muted-foreground">PNG, JPG or SVG · up to 2MB</p>{showErrors && errors.logo_url && <p className="text-xs text-destructive">{errors.logo_url}</p>}</div>
        <div className="space-y-2"><Label htmlFor="company-primary_color">Brand colour</Label><div className="flex gap-2"><input type="color" aria-label="Pick brand colour" className="h-10 w-12 rounded border border-input bg-background" value={/^#[0-9a-f]{6}$/i.test(details.primary_color || '') ? details.primary_color || '#808080' : '#808080'} onChange={e => setDetails(prev => ({ ...prev, primary_color: e.target.value }))} /><Input id="company-primary_color" value={details.primary_color || ''} aria-invalid={showErrors && !!errors.primary_color} className={showErrors && errors.primary_color ? 'border-destructive' : ''} onChange={e => setDetails(prev => ({ ...prev, primary_color: e.target.value.trim() || null }))} /></div>{showErrors && errors.primary_color && <p className="text-xs text-destructive">{errors.primary_color}</p>}</div>
      </div><Button onClick={save} disabled={busy || loadError}>{busy ? 'Saving…' : 'Save'}</Button>
    </>}
  </section>;
}