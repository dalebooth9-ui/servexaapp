export type AssistantDestination = { label: string; path: string; tab?: string; section?: string; aliases?: string[]; job?: boolean };
const settings = (label:string,tab:string,section?:string,aliases?:string[]):AssistantDestination => ({label,path:'/settings',tab,section,aliases});
export const ASSISTANT_DESTINATIONS: AssistantDestination[] = [
  settings('Team','team'),settings('Email','email'),settings('Documents','documents'),settings('Integrations','integrations'),settings('Import history','import-history'),settings('Advanced','advanced'),
  settings('Digital Twin (IoT sensors)','advanced',undefined,['Digital Twin','IoT sensors']),
  settings('Advanced integrations','integrations','advanced-integrations'),settings('Advanced document settings','documents','advanced-document-settings'),
  settings('Xero Accounting','integrations','advanced-integrations',['Xero']),settings('QuickBooks Online','integrations','advanced-integrations',['QuickBooks']),settings('Sage Business Cloud Accounting','integrations','advanced-integrations',['Sage']),settings('FreeAgent','integrations','advanced-integrations'),settings('The Mellor Integration','integrations','advanced-integrations',['Quote Hound','QuoteHound','The Mellor']),
  settings('Customer merge suggestions','integrations','advanced-integrations'),settings('Customer Reassignment Wizard','integrations','advanced-integrations',['Reassign customers','Reassign customer']),settings('Re-attach Job Documents','integrations','advanced-integrations',['Reattach job documents','Reattach documents']),
  settings('WhatsApp Integration (Twilio)','integrations',undefined,['WhatsApp','Twilio']),
  settings('Job Categories','documents',undefined,['Job types','Print template']),settings('Asset Categories','documents'),settings('Photo Tags','documents'),settings('Job Templates','documents'),settings('Category Document Templates','documents'),settings('Engineer signatures','documents'),settings('Company details — brand colour','documents',undefined,['Company details','Brand colour']),
  settings('RAMS Template','documents',undefined,['RAMS templates']),settings('Renewals & customer reminders','documents',undefined,['Renewal reminders']),settings('Due visit reminders','documents'),settings('Job locations','documents'),
  settings('Filename format','documents','advanced-document-settings'),settings('Word Export — Logo','documents','advanced-document-settings',['Word export']),settings('PDF Watermark','documents','advanced-document-settings',['Watermark']),settings('Engineer paperwork','documents','advanced-document-settings',['Print access codes']),settings('AI report summaries','documents','advanced-document-settings'),settings('Vehicle Check List','documents','advanced-document-settings',['Vehicle checks']),
  settings('Office contact','email'),settings('Email your POs here','email',undefined,['PO intake email']),settings('Email signature & branding','email'),settings('Sender Addresses (FROM)','email'),settings('Send via Microsoft 365','email',undefined,['Microsoft 365']),settings('Follow-Up Reminder Emails','email',undefined,['Follow-up reminders']),settings('Compliance Expiry Reminders','email',undefined,['Compliance reminders']),settings('Email Automation','email'),settings('Email delivery & domain status','email',undefined,['Email health']),settings('Scan paper reports here','documents',undefined,['Scan intake email']),
  settings('User Roles','team'),settings('Vans','team',undefined,['Van QR stickers','Van QR']),settings('Timesheet rules','team',undefined,['Break rule','Missing finish time']),{label:'Timesheets',path:'/timesheets',aliases:['Approve week','Export timesheets']},{label:'My timesheet',path:'/my-timesheet',aliases:['Request a correction']},settings('Engineer App Install','team'),settings('Billing','team'),settings('Data export','advanced'),settings('Help articles','advanced'),settings('Weekly Management Report','advanced'),settings('API Key Security','advanced'),settings('Report history','import-history'),settings('Remedial works','import-history'),
  {label:'Customer clean-up',path:'/sites',tab:'by-customer'}, {label:'Merge customers',path:'/sites',tab:'by-customer'}, {label:'Merge duplicate sites',path:'/sites'}, {label:'By Customer',path:'/sites',tab:'by-customer'}, {label:'Hierarchy',path:'/sites',tab:'hierarchy'},
  {label:'Print reports',path:'/jobs',job:true,tab:'documents'}, {label:'Print sticker pack',path:'/jobs',job:true,tab:'documents'},
  {label:'Print QR labels',path:'/assets',aliases:['Reprint QR labels']},
  {label:'Possible duplicates',path:'/assets/duplicates',aliases:['Merge duplicate assets','Asset duplicates']},
  {label:'Paper Scans',path:'/paper-scans',tab:'upload',aliases:['Paper scans & archive']}, {label:'Review queue',path:'/paper-scans',tab:'review'}, {label:'History & archive',path:'/paper-scans',tab:'history'},
  ...[['Dashboard','/'],['Jobs','/jobs'],['Customers','/customers'],['Sites','/sites'],['Assets','/assets'],['Planner','/planner'],['Due visits','/due-visits'],['Renewals','/renewals'],['Quotes','/quotes'],['Invoices','/invoices'],['Settings','/settings'],['Engineers','/engineers'],['Reports','/reports'],['Defects','/defects'],['Audits','/audits'],['Compliance','/compliance'],['Contracts','/contracts'],['Agreements','/agreements'],['Help & guides','/help'],['Import Data','/settings/import'],['Import historic reports','/settings/import-historic-reports'],['RAMS Library','/settings/rams-library'],['Price Book','/settings/price-book'],['Extinguisher servicing rates','/settings/extinguisher-rates'],['Parts library','/parts-library'],['Templates','/industry-templates'],['Site surveys','/site-surveys'],['Reports to check','/reports-to-check'],['Fleet vehicles','/fleet'],['Leave','/leave'],['Sync status','/sync-status']].map(([label,path])=>({label,path})),
];
export const normaliseDestination = (s:string) => s.replace(/^go to\s+/i,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
export function findDestination(label:string) { const key=normaliseDestination(label); return ASSISTANT_DESTINATIONS.find(d=>[d.label,...(d.aliases||[])].some(name=>normaliseDestination(name)===key)); }
export function destinationUrl(d:AssistantDestination,currentPath:string,suppliedPath?:string) {
  const jobPath = [suppliedPath,currentPath].find(p=>p&&/^\/jobs\/[^/?#]+(?:[?#]|$)/.test(p));
  const path=d.job?(jobPath?.split(/[?#]/)[0]||'/jobs'):d.path;
  const params=new URLSearchParams();
  if(d.tab&&(!d.job||path!=='/jobs'))params.set('tab',d.tab);
  if(d.section)params.set('section',d.section);
  params.set('focus',d.job&&path==='/jobs'?'Jobs':d.label);
  return `${path}?${params}`;
}
export function safeAssistantUrl(url:string) { return url.startsWith('/')&&!url.startsWith('//')&&!/[\\\u0000-\u001f]/.test(url); }
export function resolveAssistantUrl(label:string,url:string,currentPath:string) {
  if(url==='#raise-support')return url;
  if(!safeAssistantUrl(url))return null;
  const parsed=new URL(url,'https://servexaapp.com');
  const d=findDestination(label);
  // Enrich generic page shortcuts, never replace a specific record or existing filter.
  if(d && (parsed.pathname===d.path || (d.job&&/^\/jobs\/[^/]+$/.test(parsed.pathname)))) {
    const enriched=new URL(destinationUrl(d,currentPath,url),'https://servexaapp.com');
    for(const [key,value] of parsed.searchParams){if(!['tab','section','focus'].includes(key))enriched.searchParams.set(key,value);}
    enriched.hash=parsed.hash;
    return enriched.pathname+enriched.search+enriched.hash;
  }
  if(!parsed.searchParams.has('focus')&&!parsed.pathname.startsWith('/help'))parsed.searchParams.set('focus',label.replace(/^go to\s+/i,''));
  return parsed.pathname+parsed.search+parsed.hash;
}
export function messageDestinations(text:string,actions:{label:string;url:string}[],currentPath:string) {
  const candidates=ASSISTANT_DESTINATIONS.flatMap(d=>[d.label,...(d.aliases||[])].map(label=>({label,url:destinationUrl(d,currentPath,actions.find(a=>findDestination(a.label)===d)?.url)})));
  for(const action of actions){const label=action.label.replace(/^go to\s+/i,'').trim();if(!label)continue;const url=resolveAssistantUrl(action.label,action.url,currentPath);if(url&&safeAssistantUrl(url))candidates.push({label,url});}
  return candidates.filter(c=>text.toLowerCase().includes(c.label.toLowerCase())).sort((a,b)=>b.label.length-a.label.length);
}