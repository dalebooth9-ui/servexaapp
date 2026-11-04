export type PrintCustomer = {id?:string;name?:string|null;logo_url?:string|null;print_logo_url?:string|null;brand_colour?:string|null;use_print_branding?:boolean|null};
export function printBrandingChoice(customer:PrintCustomer|null|undefined,orgLogo:string){
 const enabled=customer?.use_print_branding===true;
 return {enabled,logoUrl:enabled?(customer?.print_logo_url||customer?.logo_url||orgLogo):orgLogo,colour:enabled?customer?.brand_colour:null};
}
export function isPrintableFinancialField(field:{id?:string;label?:string}){return /\b(price|cost|rate|subtotal|vat|total\s*(?:cost|price)|amount|labour\s*charge)\b/i.test(`${field.id||''} ${field.label||''}`.replace(/_/g,' '));}

/** Customer colour, then the generating company; Viva's fallback is never shared. */
export function printColourChoice(customerColour: string | null | undefined, org: {isViva: boolean; primaryColor?: string | null}): string {
 return customerColour || org.primaryColor || (org.isViva ? '#1F4E79' : '#808080');
}