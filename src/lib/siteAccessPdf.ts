import type jsPDF from 'jspdf';
export type EngineerAccessPrint={lines:string[];cabinetKeys:string};
/** Engineer blank paperwork only; large records continue in the staff site file. */
export function drawEngineerAccessBox(doc:jsPDF,access:EngineerAccessPrint|null|undefined,y:number,x:number,width:number):number{
 if(!access?.lines.length)return y;doc.setFont('helvetica','normal');doc.setFontSize(7);const all=access.lines.flatMap(line=>doc.splitTextToSize(line,width-4) as string[]);const lines=all.length>5?[...all.slice(0,4),'More access info: see site file']:all;const h=6+lines.length*3;doc.setDrawColor(100);doc.setLineWidth(0.2);doc.rect(x,y,width,h);doc.setFont('helvetica','bold');doc.text('ACCESS INFO',x+2,y+3.5);doc.setFont('helvetica','normal');lines.forEach((line,i)=>doc.text(line,x+2,y+7+i*3));return y+h+1;
}