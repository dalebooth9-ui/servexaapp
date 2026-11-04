import type jsPDF from 'jspdf';
/** lines = every engineer access line, most important first (see accessPriorityLines). */
export type EngineerAccessPrint={lines:string[];cabinetKeys:string};
export const ACCESS_MIN_PT=7;
export const ACCESS_MAX_PT=9;
export const SEE_SITE_RECORD='(see site record)';

/**
 * Fit access lines into a fixed box. Never throws: shrinks text down to 7pt,
 * then drops the least important (last) lines and ends with "(see site record)".
 */
export function fitAccessLines(doc:jsPDF,lines:string[],width:number,maxH:number,maxPt=ACCESS_MAX_PT){
 const lh=(pt:number)=>pt*0.3528*1.2;
 const wrapAll=(src:string[])=>src.flatMap(l=>doc.splitTextToSize(l,width) as string[]);
 doc.setFont('helvetica','normal');
 for(let pt=maxPt;pt>=ACCESS_MIN_PT;pt-=0.5){doc.setFontSize(pt);const w=wrapAll(lines);if(w.length*lh(pt)<=maxH)return {pt,lines:w,lineH:lh(pt),truncated:false};}
 const pt=ACCESS_MIN_PT;doc.setFontSize(pt);const cap=Math.max(1,Math.floor(maxH/lh(pt)));
 const marker=wrapAll([SEE_SITE_RECORD]);
 const out:string[]=[];
 for(const l of lines){const w=wrapAll([l]);if(out.length+w.length+marker.length>cap)break;out.push(...w);}
 return {pt,lines:[...out,...marker].slice(0,cap),lineH:lh(pt),truncated:true};
}

/** Engineer blank paperwork only. Always draws (never refuses to print). */
export function drawEngineerAccessBox(doc:jsPDF,access:EngineerAccessPrint|null|undefined,y:number,x:number,width:number,maxH=30):number{
 if(!access?.lines.length)return y;doc.setTextColor(0,0,0);
 const fit=fitAccessLines(doc,access.lines,width-4,maxH-6);const h=6+fit.lines.length*fit.lineH;
 doc.setDrawColor(100);doc.setLineWidth(0.2);doc.rect(x,y,width,h);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('ACCESS INFO',x+2,y+3.5);
 doc.setFont('helvetica','normal');doc.setFontSize(fit.pt);fit.lines.forEach((line,i)=>doc.text(line,x+2,y+6+fit.lineH*0.8+i*fit.lineH));doc.setFontSize(9);return y+h+1;
}
