/**
 * Multi-page Viva printed sheet (sprinkler reports). Same look as the
 * single-page riser/hydrant sheet — centred logo, underlined scope line,
 * Customer/Site | DATE | PO | location boxes, QR + ID, shaded section bands,
 * two-column question rows, signature rows, closing statement, accreditation
 * logos — but it grows to as many A4 pages as needed. The header repeats on
 * every page with "Page x of y"; tables repeat their column headings.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawQr, stickerUrl } from "@/lib/riserStickers";
import { printName } from "@/lib/printText";
import { siteDetailLines } from "@/lib/siteDetailsPrint";
import type { SheetModel } from "@/lib/printedSheetModel";
import type { PaperFormJobInfo, LoadedImage } from "@/workers/paperFormRenderer";

const M = 10;
const HEADER_H = 52;

export function renderPrintedSheetPages(doc: jsPDF, o: {
  model: SheetModel; jobInfo: PaperFormJobInfo | null | undefined; logo: LoadedImage | null;
  accreditationLogos: LoadedImage[]; brandColor?: [number, number, number];
}): void {
  const { model, jobInfo } = o;
  const fill = jobInfo?.filled || null;
  const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight();
  const maxW = W - 2 * M; const top = HEADER_H + 2; const bottom = H - M - 5;
  const startPage = doc.getNumberOfPages();
  const brand = o.brandColor || [30, 64, 175];
  const tint = brand.map((c) => Math.round(230 + c * 0.1)) as [number, number, number];
  const colSplit = M + maxW * 0.62;
  let y = top;
  const newPage = () => { doc.addPage(); y = top; };

  const band = (label: string) => {
    if (y + 5.5 + 7 > bottom) newPage();
    doc.setFillColor(...tint); doc.rect(M, y, maxW, 5.5, "F");
    doc.setDrawColor(...brand); doc.setLineWidth(0.2); doc.rect(M, y, maxW, 5.5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(0);
    doc.text((doc.splitTextToSize(label, maxW - 4) as string[])[0] || "", M + 2, y + 3.9);
    y += 5.5;
  };

  const row = (r: Extract<SheetModel["blocks"][number], { kind: "row" }>) => {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    const lab = doc.splitTextToSize(r.label, colSplit - M - 4) as string[];
    doc.setFont("helvetica", "normal");
    const optsText = r.options ? r.options.join(" / ") : "";
    const ansLines = r.options ? [optsText, ...r.answer.split("\n").slice(1).flatMap((l) => doc.splitTextToSize(l, W - M - colSplit - 4) as string[])]
      : (doc.splitTextToSize(r.answer || "", W - M - colSplit - 4) as string[]);
    const h = Math.max(5.5, Math.max(lab.length, ansLines.length) * 3.6 + 1.6);
    if (y + h > bottom) newPage();
    doc.setDrawColor(120); doc.setLineWidth(0.2);
    doc.rect(M, y, colSplit - M, h); doc.rect(colSplit, y, W - M - colSplit, h);
    doc.setTextColor(0); doc.setFont("helvetica", "bold");
    lab.forEach((l, i) => doc.text(l, M + 2, y + 3.8 + i * 3.6));
    doc.setFont("helvetica", "normal");
    const ax = colSplit + 2;
    ansLines.forEach((l, i) => {
      const ty = y + 3.8 + i * 3.6;
      if (i === 0 && r.options && r.picked) {
        let x = ax;
        r.options.forEach((tok, k) => {
          if (k > 0) { doc.setFont("helvetica", "normal"); doc.text(" / ", x, ty); x += doc.getTextWidth(" / "); }
          const on = tok === r.picked; doc.setFont("helvetica", on ? "bold" : "normal"); doc.text(tok, x, ty);
          const w = doc.getTextWidth(tok);
          if (on) { doc.setDrawColor(0); doc.setLineWidth(0.35); doc.rect(x - 0.8, ty - 3, w + 1.6, 4); doc.setLineWidth(0.2); doc.setDrawColor(120); }
          x += w;
        });
        doc.setFont("helvetica", "normal");
      } else doc.text(l, ax, ty);
    });
    y += h;
  };

  const table = (t: Extract<SheetModel["blocks"][number], { kind: "table" }>) => {
    if (y + 22 > bottom) newPage();
    if (t.title) {
      doc.setDrawColor(120); doc.setLineWidth(0.2); doc.rect(M, y, maxW, 5.5);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(0);
      doc.text((doc.splitTextToSize(t.title, maxW - 4) as string[])[0] || "", M + 2, y + 3.8);
      y += 5.5;
    }
    autoTable(doc, {
      startY: y, margin: { top, left: M, right: M, bottom: H - bottom },
      head: [t.columns], body: t.rows, theme: "grid", showHead: "everyPage", rowPageBreak: "avoid",
      styles: { font: "helvetica", fontSize: t.columns.length > 7 ? 6.8 : 7.8, cellPadding: 1, textColor: 0, lineColor: 120, lineWidth: 0.2, overflow: "linebreak", valign: "middle" },
      headStyles: { fillColor: tint, textColor: 0, fontStyle: "bold", lineColor: brand as any },
    });
    y = (doc as any).lastAutoTable.finalY + 1;
  };

  for (const b of model.blocks) {
    if (b.kind === "section") band(b.label);
    else if (b.kind === "row") row(b);
    else table(b);
  }

  // ─── Sign-off stack on the last page (issues, signatures, closing, logos) ───
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  const issueLines = model.issues ? (doc.splitTextToSize(model.issues, maxW * 0.76 - 4) as string[]) : [];
  const issuesH = issueLines.length ? Math.max(10, issueLines.length * 3.6 + 3) : 0;
  const logoH = o.accreditationLogos.length ? 10 : 0;
  const stackH = (issuesH ? issuesH + 2 : 0) + 20 + 9 + (logoH ? logoH + 2 : 0);
  if (y + 2 + stackH > bottom) newPage();
  let sy = bottom - stackH;
  if (issuesH) {
    doc.setDrawColor(0); doc.setLineWidth(0.3); doc.rect(M, sy, maxW, issuesH); doc.line(M + maxW * 0.24, sy, M + maxW * 0.24, sy + issuesH);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("ISSUES FOUND:", M + 2, sy + 4);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); issueLines.forEach((l, i) => doc.text(l, M + maxW * 0.24 + 2, sy + 4 + i * 3.6));
    sy += issuesH + 2;
  }
  const sig = (yy: number, who: "Technician Name" | "Customer Name") => {
    const hh = 10; const dW = maxW * 0.2; const nW = maxW * 0.35;
    doc.setDrawColor(0); doc.setLineWidth(0.3); doc.rect(M, yy, maxW, hh);
    doc.line(M + dW, yy, M + dW, yy + hh); doc.line(M + dW + nW, yy, M + dW + nW, yy + hh);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(0);
    doc.text("Date:", M + 2, yy + 3.5); doc.text(`${who}:`, M + dW + 2, yy + 3.5); doc.text("Signature:", M + dW + nW + 2, yy + 3.5);
    const tech = who === "Technician Name";
    const date = tech ? fill?.techDate : fill?.custDate; const name = tech ? fill?.techName : fill?.custName; const img = tech ? fill?.techSig : fill?.custSig;
    doc.setFont("helvetica", "normal");
    if (date) doc.text(String(date), M + 2, yy + 8);
    if (name) doc.text((doc.splitTextToSize(String(name), nW - 4) as string[])[0] || "", M + dW + 2, yy + 8);
    if (img) {
      const sx = M + dW + nW + 20; const mw = maxW - dW - nW - 22; const mh = hh - 1;
      let w = mh * (img.width / img.height), h = mh; if (w > mw) { w = mw; h = w / (img.width / img.height); }
      try { doc.addImage(img.dataUrl, img.format, sx, yy + (hh - h) / 2, w, h); } catch { /* unreadable signature: leave the box */ }
    }
  };
  sig(sy, "Technician Name"); sig(sy + 10, "Customer Name"); sy += 20;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0);
  (doc.splitTextToSize(model.compliance, maxW) as string[]).slice(0, 2).forEach((l, i) => doc.text(l, W / 2, sy + 5 + i * 4, { align: "center" }));
  sy += 9;
  if (logoH) {
    const dims = o.accreditationLogos.map((img) => ({ img, w: (img.width / img.height) * logoH }));
    let x = (W - dims.reduce((s, d) => s + d.w, 0) - 5 * (dims.length - 1)) / 2;
    for (const { img, w } of dims) { try { doc.addImage(img.dataUrl, img.format, x, sy + 2, w, logoH); } catch { /* skip */ } x += w + 5; }
  }

  // ─── Header + page numbers on every page ───
  const total = doc.getNumberOfPages() - startPage + 1;
  for (let p = 0; p < total; p++) { doc.setPage(startPage + p); drawHeader(doc, o, model, p + 1, total); }
  doc.setPage(doc.getNumberOfPages());
}

function drawHeader(doc: jsPDF, o: Parameters<typeof renderPrintedSheetPages>[1], model: SheetModel, page: number, total: number) {
  const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight(); const maxW = W - 2 * M;
  const j = o.jobInfo; const tag = j?.riserVisit?.asset_tag;
  let y = 6;
  if (o.logo) {
    const a = o.logo.width / o.logo.height; let lh = 18, lw = lh * a; const lmax = maxW - 60; if (lw > lmax) { lw = lmax; lh = lw / a; }
    try { doc.addImage(o.logo.dataUrl, o.logo.format, (W - lw) / 2, y, lw, lh); } catch { /* skip */ }
    y += lh;
  } else y += 12;
  if (tag) {
    drawQr(doc, stickerUrl(tag), W - M - 20, 5, 18);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(0); doc.text(`ID ${tag}`, W - M - 11, 26, { align: "center" });
  }
  doc.setFont("helvetica", "bold"); doc.setTextColor(0);
  // Shrink the scope line to fit beside the QR rather than cutting it off.
  let pt = 10.5; doc.setFontSize(pt);
  while (pt > 7 && doc.getTextWidth(model.scope) > maxW - 46) { pt -= 0.25; doc.setFontSize(pt); }
  const scope = (doc.splitTextToSize(model.scope, maxW - 46) as string[])[0];
  const sw = doc.getTextWidth(scope); const sx = (W - sw) / 2; const scy = Math.max(y + 4.5, 29);
  doc.text(scope, sx, scy); doc.setDrawColor(0); doc.setLineWidth(0.4); doc.line(sx, scy + 1.2, sx + sw, scy + 1.2);
  const top = scy + 3; const bh = 52 - top; const leftW = maxW * 0.55; const rx = M + leftW; const rw = maxW - leftW; const split = rx + rw * 0.42;
  doc.setLineWidth(0.3); doc.rect(M, top, maxW, bh); doc.line(rx, top, rx, top + bh); doc.line(rx, top + 7, M + maxW, top + 7); doc.line(split, top, split, top + 7);
  doc.setFontSize(9); doc.text("Customer/Site Details:", M + 2, top + 4);
  const showPo = !!j?.customer_po || !!j?.poOnly;
  doc.text("DATE:", rx + 2, top + 3.2); doc.text(showPo ? "PO NUMBER:" : "REF:", split + 2, top + 3.2);
  doc.text(j?.locationLabel || "SYSTEM / LOCATION:", rx + 2, top + 10.2);
  doc.setFont("helvetica", "normal");
  const lines = siteDetailLines({ customer: printName(j?.customers?.name || j?.customer), siteName: printName(j?.site?.name), address: printName(j?.site?.address || j?.address), postcode: j?.site?.postcode || "" })
    .flatMap((t) => doc.splitTextToSize(t, leftW - 4) as string[]);
  lines.slice(0, Math.floor((bh - 6) / 3.8)).forEach((l, i) => doc.text(l, M + 2, top + 8.5 + i * 3.8));
  const iso = j?.due_date; let d = "";
  if (iso) { const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); d = m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso); }
  doc.text(d, rx + 2, top + 6.2);
  doc.text((doc.splitTextToSize(String(showPo ? j?.customer_po || "" : j?.reference_number || ""), rw * 0.58 - 4) as string[])[0] || "", split + 2, top + 6.2);
  (doc.splitTextToSize(printName(j?.site?.riser_location) || "", rw - 4) as string[]).slice(0, Math.floor((bh - 12) / 3.8)).forEach((l, i) => doc.text(l, rx + 2, top + 14 + i * 3.8));
  doc.setFontSize(8); doc.text(`Page ${page} of ${total}`, W / 2, H - M + 2, { align: "center" });
}
