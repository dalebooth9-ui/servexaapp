import { it } from 'vitest';
import jsPDF from 'jspdf';
import { renderPaperFormPage } from '@/workers/paperFormRenderer';
import templates from './fixtures/riserSheetTemplates.json';
it('dump',()=>{const doc=new jsPDF({unit:'mm',format:'a4'});const out:string[]=[];const o=doc.text.bind(doc);(doc as any).text=(t:any,...r:any[])=>{out.push(String(t));return o(t,...r)};
renderPaperFormPage(doc,{template:templates[0] as any,jobInfo:{customer:'Craven House Mgmt',customer_po:'PO1',address:'1 High Street, Leeds, LS1 1AA',site:{name:'Craven House',address:'1 High Street, Leeds, LS1 1AA',postcode:null},riserVisit:{asset_tag:'ABC234',riser_location:'North',site_name:'Craven House',address:'1 High Street, Leeds, LS1 1AA'}} as any,logo:null,accreditationLogos:[],handfill:true});
console.log(out.slice(0,40).join('\n|'));});
