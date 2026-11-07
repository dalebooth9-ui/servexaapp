import {describe,it,expect} from 'vitest';
import {SITES_PAGE_SIZE,SITES_SEARCH_DELAY,visiblePage,mergeSiteRows} from '@/lib/sitesPaging';
describe('Sites bounded loading',()=>{
 it('shows exactly the first 50 and detects a further page',()=>{ const p=visiblePage(Array.from({length:51},(_,id)=>({id})));expect(p.rows.length).toBe(50);expect(p.hasMore).toBe(true);expect(SITES_PAGE_SIZE).toBe(50); });
 it('waits half a second before searching',()=>{expect(SITES_SEARCH_DELAY).toBe(500);});
 it('ends paging on a short page',()=>{expect(visiblePage([1,2]).hasMore).toBe(false);});
 it('keeps stable distinct rows when context overlaps',()=>{expect(mergeSiteRows([{id:'a',name:'old'}],[{id:'a',name:'new'},{id:'b',name:'second'}])).toEqual([{id:'a',name:'new'},{id:'b',name:'second'}]);});
});