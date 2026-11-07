export const SITES_PAGE_SIZE = 50;
export const SITES_SEARCH_DELAY = 500;
export function visiblePage<T>(rows: T[]) { return {rows:rows.slice(0,SITES_PAGE_SIZE),hasMore:rows.length>SITES_PAGE_SIZE}; }
export function mergeSiteRows<T extends {id:string}>(existing:T[],incoming:T[]) { return [...new Map([...existing,...incoming].map(row=>[row.id,row])).values()]; }