export type ScanJobChoice={id:string;reference:string;name:string;date:string|null};
export function riserReportUrl(jobId:string,responseId:string,templateId:string){
 return `/jobs/${encodeURIComponent(jobId)}?riserScan=1&response=${encodeURIComponent(responseId)}&template=${encodeURIComponent(templateId)}`;
}
export function isScanPrivateField(field:{id?:string;label?:string}){
 return /\b(po|purchase order|price|cost|quote|rate|amount|subtotal|vat)\b/i.test(`${field.id||''} ${field.label||''}`.replace(/_/g,' '));
}