import type jsPDF from 'jspdf';
export type EngineerAccessPrint={lines:string[];cabinetKeys:string};
/** Engineer blank paperwork only. Never silently omit hazards or restrictions. */
export function drawEngineerAccessBox(doc:jsPDF,access:EngineerAccessPrint|null|undefined,y:number,x:number,width:number):number{
 if(!access?.lines.length)return y;doc.setFont('helvetica','normal');doc.setFontSize(7);const lines=access.lines.flatMap(line=>doc.splitTextToSize(line,width-4) as string[]);const h=7+lines.length*3;if(h>65)throw new Error('Access info is too long for this engineer sheet. Shorten the site access notes before printing.');doc.setDrawColor(100);doc.setLineWidth(0.2);doc.rect(x,y,width,h);doc.setFont('helvetica','bold');doc.text('ACCESS INFO',x+2,y+3.5);doc.setFont('helvetica','normal');lines.forEach((line,i)=>doc.text(line,x+2,y+7+i*3));return y+h+1;
}