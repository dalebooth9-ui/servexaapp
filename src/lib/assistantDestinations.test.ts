import { describe, expect, it } from 'vitest';
import { ASSISTANT_DESTINATIONS, destinationUrl, findDestination, messageDestinations, resolveAssistantUrl, safeAssistantUrl } from './assistantDestinations';
import { resolveHelpSlug } from './helpArticles';
describe('exact assistant destinations',()=>{
  it.each(['Reassign customers','Reattach job documents'])('reveals Advanced integrations for %s',label=>{
    const url=new URL(resolveAssistantUrl(`Go to ${label}`,'/settings','/')||'', 'https://servexaapp.com');
    expect(url.pathname).toBe('/settings');expect(url.searchParams.get('tab')).toBe('integrations');expect(url.searchParams.get('section')).toBe('advanced-integrations');expect(url.searchParams.get('focus')).toBe(findDestination(label)?.label);
  });
  it('targets customer clean-up on By Customer',()=>{const d=findDestination('Customer clean-up');expect(d).toBeDefined();if(!d)return;const url=new URL(destinationUrl(d,'/'),'https://servexaapp.com');expect(url.pathname).toBe('/sites');expect(url.searchParams.get('tab')).toBe('by-customer');expect(url.searchParams.get('focus')).toBe('Customer clean-up');});
  it('uses the same exact target for inline and Go to links',()=>{const inline=messageDestinations('Open Reassign customers',[{label:'Go to Reassign customers',url:'/settings'}],'/');expect(inline[0].url).toBe(resolveAssistantUrl('Go to Reassign customers','/settings','/'));});
  it.each(['Print reports','Print sticker pack'])('keeps %s on the actual job, with no print command',label=>{const url=resolveAssistantUrl(label,'/jobs','/jobs/real-job');expect(url).toContain('/jobs/real-job?tab=documents');expect(url).not.toContain('action=');});
  it('asks for a job rather than inventing an ID',()=>{expect(resolveAssistantUrl('Print reports','/jobs','/')).toBe('/jobs?focus=Jobs');});
  it('preserves explicit record links and filters',()=>{expect(resolveAssistantUrl('Jobs','/jobs/123?filter=open#reports','/')).toBe('/jobs/123?filter=open&focus=Jobs#reports');expect(resolveAssistantUrl('Go to Reassign customers','/settings?filter=own','/')).toContain('filter=own');});
  it('ignores empty labels without creating zero-length link candidates',()=>{expect(messageDestinations('hello',[{label:'',url:'/sites'}],'/')).toEqual([]);});
  it.each(['https://evil.example','//evil.example','/\\evil.example','javascript:alert(1)'])('rejects unsafe navigation %s',url=>{expect(safeAssistantUrl(url)).toBe(false);expect(resolveAssistantUrl('Sites',url,'/')).toBeNull();});
  it('has safe company-independent registered routes',()=>{for(const d of ASSISTANT_DESTINATIONS){expect(safeAssistantUrl(d.path)).toBe(true);expect(d.path).not.toMatch(/org_id|company_id|viva/i);}});
  it('resolves Help for query-targeted pages',()=>{expect(resolveHelpSlug('/settings?tab=integrations&focus=Xero')).toBe('settings');expect(resolveHelpSlug('/sites?tab=by-customer')).toBe('sites');});
});