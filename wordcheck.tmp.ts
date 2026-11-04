import { supabase } from '@/integrations/supabase/client';

const minted = JSON.parse(await Bun.file('/root/.cache/lovable-auth/session.json').text());
const sess = minted.session ?? minted;
await supabase.auth.setSession({ access_token: sess.access_token, refresh_token: sess.refresh_token });
const { data } = await supabase.auth.getUser();
console.log('signed in:', data?.user?.email ?? 'no user');

const { buildVisitTemplateDoc } = await import('@/lib/wordTemplateBuilder');
const { Packer } = await import('docx');

const rows = [
  {
    name: 'Dry Riser — Pressure Test',
    fields: [],
    riserVisit: {
      customer: 'Acme Facilities Ltd',
      site_name: 'Marsh Mills Retail Park',
      address: 'MARSH MILLS RETAIL PARK, PHASE 1 LONGBRIDGE, PLYMOUTH, PL6 8LX',
      job_reference: 'VFP-00001',
      planned_date: null,
      riser_location: 'North stair',
    },
  },
];

try {
  const doc = await buildVisitTemplateDoc(rows as any);
  const buf = await Packer.toBuffer(doc);
  await Bun.write('/tmp/browser/sheetcheck/visit.docx', Buffer.from(buf));
  console.log('docx written');
} catch (e) {
  console.log('docx build failed:', (e as Error).message);
}
