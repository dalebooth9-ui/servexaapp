import { buildVisitTemplateDoc } from '@/lib/wordTemplateBuilder';
import { Packer } from 'docx';

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
