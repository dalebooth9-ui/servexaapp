import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { renderPdfHeader } from "@/lib/pdfHeader";
import { getGeneratingOrgFallbackLogoUrl } from "@/lib/generatingOrgBranding";
import { parseHexColor } from "@/lib/documentBrandingProfile";
import { primaryJobReference, primaryJobReferenceLabel } from "@/lib/jobReference";
import { resolveToSignedUrl } from "@/lib/durableStorageRef";
import { orientBlob } from "@/lib/exifOrient";
import { formatDate } from "@/lib/dateFormat";
import type { RgbTriple } from "@/lib/extractLogoColors";

/**
 * Site Visit Report PDF. Uses the shared branded header and the org's own
 * logo/brand colour. Never mutates other report templates.
 */

const TBC = "To be confirmed";
const OUTCOME_LABEL: Record<string, string> = {
  completed: "Completed", partly_completed: "Partly completed", not_completed: "Not completed", investigation_only: "Investigation only",
};
const DEFAULT_BLUE: RgbTriple = [30, 64, 175];

const isRed = ([r, g, b]: RgbTriple) => r > 150 && r > g * 1.6 && r > b * 1.6;

async function loadOrgBranding(orgId: string) {
  const [{ data: org }, { data: eb }] = await Promise.all([
    supabase.from("organisations").select("name, logo_url, primary_color").eq("id", orgId).maybeSingle(),
    supabase.from("email_branding").select("brand_color, company_name, logo_url").eq("org_id", orgId).maybeSingle(),
  ]);
  let accent = parseHexColor((org as any)?.primary_color) || parseHexColor((eb as any)?.brand_color) || DEFAULT_BLUE;
  // Brand rule: Viva Fire Protection is blue, never red.
  if (isRed(accent)) accent = DEFAULT_BLUE;
  const logo = (org as any)?.logo_url || (eb as any)?.logo_url || (await getGeneratingOrgFallbackLogoUrl().catch(() => "")) || "";
  const name = (eb as any)?.company_name || (org as any)?.name || "";
  return { accent, logo, name };
}

async function loadUprightImage(ref: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const url = await resolveToSignedUrl(ref);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const oriented = await orientBlob(blob as File).catch(() => null);
    const src = oriented?.dataUrl || URL.createObjectURL(blob);
    const img = new Image();
    img.src = src;
    await img.decode();
    const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL("image/jpeg", 0.85), w: c.width, h: c.height };
  } catch {
    return null;
  }
}

function longDate(d?: string | null) {
  if (!d) return TBC;
  const dt = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export async function buildSiteVisitReportPdf(reportId: string): Promise<{ blob: Blob; fileName: string; report: any }> {
  const { data: report, error } = await supabase.from("site_visit_reports").select("*").eq("id", reportId).single();
  if (error || !report) throw new Error(error?.message || "Report not found");
  const r: any = report;
  const [{ data: job }, { data: photos }, brand] = await Promise.all([
    supabase.from("jobs").select("id, customer_po, reference_number, site_id, sites(what3words)").eq("id", r.job_id).maybeSingle(),
    supabase.from("site_visit_report_photos").select("storage_ref, caption, display_order").eq("report_id", reportId).order("display_order"),
    loadOrgBranding(r.org_id),
  ]);
  // Customer sign-off on the visit's job sheet (only if actually signed).
  let sheetSig: any = null;
  {
    const { data } = await supabase.from("job_signatures").select("signer_name, signer_position, created_at")
      .eq("job_id", r.job_id).eq("signer_role", "customer").order("created_at", { ascending: false }).limit(1);
    if (data?.[0]?.signer_name) sheetSig = data[0];
  }
  const w3w: string | null = ((job as any)?.sites?.what3words || "").trim() || null;
  const ref = primaryJobReference(job as any) || (r as any).po_reference || "";
  const refLabel = primaryJobReferenceLabel(job as any).replace(":", "");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  const CW = W - M * 2;
  const BOTTOM = H - 18;
  const ink: RgbTriple = [30, 30, 30];
  let y = 0;

  const newPage = () => { doc.addPage(); y = 18; };
  const ensure = (h: number) => { if (y + h > BOTTOM) newPage(); };
  const lineH = (size: number) => size * 0.42;
  const wrap = (t: string, size: number, width = CW) => { doc.setFontSize(size); return doc.splitTextToSize(t, width) as string[]; };

  /** Paragraph that may break across pages line by line. */
  const para = (text: string, size = 10, opts: { bold?: boolean; indent?: number } = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setTextColor(...ink);
    const lines = wrap(text || TBC, size, CW - (opts.indent || 0));
    for (const ln of lines) {
      ensure(lineH(size) + 1);
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.text(ln, M + (opts.indent || 0), y + lineH(size));
      y += lineH(size) + 0.9;
    }
    y += 2;
  };
  /** Heading kept with at least the first lines of its paragraph. */
  const heading = (text: string, firstBlockH = 12) => {
    ensure(9 + firstBlockH);
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...brand.accent);
    doc.text(text, M, y + 4.5);
    doc.setDrawColor(...brand.accent);
    doc.setLineWidth(0.3);
    doc.line(M, y + 6.5, M + CW, y + 6.5);
    y += 9.5;
  };
  const firstH = (text: string, size = 10) => Math.min(3, wrap(text || TBC, size).length) * (lineH(size) + 0.9);
  const section = (title: string, text: string | null | undefined) => {
    const t = (text || "").trim() || TBC;
    heading(title, firstH(t));
    para(t);
  };

  /** Table with rows never split across pages; header repeats on new pages. */
  const table = (cols: { label: string; w: number }[], rows: string[][]) => {
    const size = 9;
    const pad = 1.8;
    const drawHead = () => {
      doc.setFillColor(...brand.accent);
      doc.rect(M, y, CW, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(size);
      doc.setTextColor(255, 255, 255);
      let x = M;
      cols.forEach((c) => { doc.text(c.label, x + pad, y + 4.8); x += c.w * CW; });
      y += 7;
    };
    ensure(7 + 8);
    drawHead();
    rows.forEach((row, ri) => {
      const cells = row.map((v, i) => wrap(v || "", size, cols[i].w * CW - pad * 2));
      const h = Math.max(...cells.map((c) => c.length)) * (lineH(size) + 0.8) + pad * 2;
      if (y + h > BOTTOM) { newPage(); drawHead(); }
      if (ri % 2 === 1) { doc.setFillColor(245, 247, 250); doc.rect(M, y, CW, h, "F"); }
      doc.setDrawColor(220, 224, 230);
      doc.setLineWidth(0.2);
      doc.rect(M, y, CW, h);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...ink);
      let x = M;
      cells.forEach((lines, i) => {
        lines.forEach((ln, li) => doc.text(ln, x + pad, y + pad + lineH(size) + li * (lineH(size) + 0.8)));
        x += cols[i].w * CW;
      });
      y += h;
    });
    y += 4;
  };

  // 1. Header (shared helper) + title + date
  y = await renderPdfHeader(
    doc, "Site Visit Report",
    { company_name: brand.name, logo_url: brand.logo },
    { customerName: "", siteName: "", siteAddress: "", refNumber: "", dateVal: "", riserLocation: "" },
    null, brand.accent,
    { marginX: M, style: { title: { uppercase: false, fontSize: 18 }, subtitleLine: { text: r.title || "", fontSize: 12, fontStyle: "bold", color: ink }, detailGrid: false } },
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Date of visit: ${longDate(r.visit_date)}`, W / 2, y + 4, { align: "center" });
  y += 9;

  // 2. Summary box
  {
    const t = (r.summary || "").trim() || TBC;
    const lines = wrap(t, 10.5, CW - 10);
    const h = lines.length * (lineH(10.5) + 1) + 12;
    ensure(h);
    doc.setFillColor(Math.round(brand.accent[0] * 0.1 + 229.5), Math.round(brand.accent[1] * 0.1 + 229.5), Math.round(brand.accent[2] * 0.1 + 229.5));
    doc.setDrawColor(...brand.accent);
    doc.setLineWidth(0.4);
    doc.roundedRect(M, y, CW, h, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...brand.accent);
    doc.text("Summary", M + 5, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...ink);
    lines.forEach((ln, i) => doc.text(ln, M + 5, y + 11.5 + i * (lineH(10.5) + 1)));
    y += h + 6;
  }

  // 3. Job details (PO-first)
  heading("Job details", 30);
  const v = (x: any) => (String(x ?? "").trim() || TBC);
  table([{ label: "Detail", w: 0.3 }, { label: "", w: 0.7 }], [
    [ref && refLabel === "PO" ? "PO number" : "Reference", v(ref)],
    ["Client", v(r.client_name)],
    ["Site name", v(r.site_name)],
    ["Site address", v(r.site_address)],
    ["Date of visit", longDate(r.visit_date)],
    ["Attended by", v(r.attended_by)],
    ["Site contact", r.site_contact_name ? [r.site_contact_name, r.site_contact_title].filter(Boolean).join(", ") : TBC],
  ]);

  // 3a. Work instructed + outcome
  {
    const outcome = OUTCOME_LABEL[r.outcome] || TBC;
    const lines: [string, string][] = [["Work instructed: ", v(r.work_instructed)], ["Outcome: ", outcome + (r.outcome && r.outcome !== "completed" && r.outcome_reason ? ` – ${r.outcome_reason}` : "")]];
    if (r.return_visit_required) lines.push(["Return visit required – parts needed: ", (r.parts_required || "").trim() || "none listed"]);
    for (const [label, text] of lines) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      const lw = doc.getTextWidth(label);
      const body = wrap(text, 10, CW - lw);
      ensure(body.length * (lineH(10) + 0.9) + 2);
      doc.setTextColor(...ink);
      doc.text(label, M, y + lineH(10));
      doc.setFont("helvetica", "normal");
      body.forEach((ln, i) => doc.text(ln, M + lw, y + lineH(10) + i * (lineH(10) + 0.9)));
      y += body.length * (lineH(10) + 0.9) + 2;
    }
    y += 2;
  }

  // 4–5
  section("System description", r.system_description);
  section("Reason for visit", r.reason_for_visit);

  // 6. Findings
  const events: any[] = Array.isArray(r.event_log) ? r.event_log.filter((e: any) => e && (e.what_was_recorded || e.date || e.time)) : [];
  const findings: any[] = Array.isArray(r.findings) ? r.findings : [];
  heading("Findings", events.length ? 16 : firstH(findings[0]?.heading || ""));
  if (events.length) {
    table(
      [{ label: "Date", w: 0.18 }, { label: "Time", w: 0.1 }, { label: "Recorded by", w: 0.22 }, { label: "What was recorded", w: 0.5 }],
      events.map((e) => [e.date ? formatDate(e.date) : "", e.time || "", e.source || "", [e.what_was_recorded, e.note].filter(Boolean).join(" – ")]),
    );
  }
  if (!findings.length) para(TBC);
  for (const f of findings) {
    const t = (f.text || "").trim() || TBC;
    ensure(6 + firstH(t));
    para(f.heading || "Finding", 10.5, { bold: true });
    y -= 1.5;
    para(t);
  }

  // 7. Conclusion + causes
  section("Conclusion", r.conclusion);
  const causes: string[] = (Array.isArray(r.possible_causes) ? r.possible_causes : []).filter((c: string) => c && c.trim());
  if (causes.length) {
    ensure(6 + firstH(causes[0]));
    para("Possible causes, most likely first:", 10, { bold: true });
    y -= 1.5;
    causes.forEach((c, i) => {
      const lines = wrap(c, 10, CW - 8);
      ensure(lines.length * (lineH(10) + 0.9));
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...ink);
      doc.text(`${i + 1}.`, M + 2, y + lineH(10));
      lines.forEach((ln, li) => doc.text(ln, M + 8, y + lineH(10) + li * (lineH(10) + 0.9)));
      y += lines.length * (lineH(10) + 0.9) + 1;
    });
    y += 2;
  }

  // 8. Recommendations
  const recs: any[] = (Array.isArray(r.recommendations) ? r.recommendations : []).filter((x: any) => x?.action?.trim());
  heading("Recommendations and next steps", 16);
  if (recs.length) {
    const who = (x: any) => x.owner_type === "us" ? (brand.name || "Us") : x.owner_type === "client" ? "Client" : ((x.owner_name || "").trim() || "Third party");
    table([{ label: "Action", w: 0.7 }, { label: "Who", w: 0.3 }], recs.map((x) => [x.action, who(x)]));
  } else para("No further action recommended.");

  // 9. Closing note
  if ((r.closing_note || "").trim()) section("Closing note", r.closing_note);

  // 10. Sign-off (no signature box ever)
  {
    const blockH = 26 + (w3w ? 5 : 0) + (sheetSig ? 6 : 0);
    ensure(blockH);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...ink);
    doc.text("With thanks,", M, y + 4); y += 10;
    doc.setFont("helvetica", "bold");
    doc.text(v(r.attended_by), M, y + 4); y += 5;
    doc.setFont("helvetica", "normal");
    if (brand.name) { doc.text(brand.name, M, y + 4); y += 5; }
    if (w3w) {
      doc.setTextColor(100, 100, 100);
      doc.text(`Site location: ///${w3w.replace(/^\/+/, "")}`, M, y + 4); y += 5;
    }
    if (sheetSig) {
      doc.setTextColor(...ink);
      doc.setFontSize(9.5);
      const who = [sheetSig.signer_name, sheetSig.signer_position].filter(Boolean).join(", ");
      doc.text(`Job sheet signed on site by: ${who} on ${formatDate(sheetSig.created_at)}`, M, y + 5); y += 6;
    }
    y += 4;
  }

  // 11. Photos — two per row, captions, never split
  const ph = (photos as any[]) || [];
  if (ph.length) {
    const imgs = await Promise.all(ph.map((p) => loadUprightImage(p.storage_ref)));
    const items = ph.map((p, i) => ({ caption: (p.caption || "").trim(), img: imgs[i] })).filter((x) => x.img);
    if (items.length) {
      heading("Photos", 70);
      const gap = 6;
      const cellW = (CW - gap) / 2;
      const maxImgH = 70;
      for (let i = 0; i < items.length; i += 2) {
        const pair = items.slice(i, i + 2);
        const dims = pair.map(({ img }) => {
          const s = Math.min(cellW / img!.w, maxImgH / img!.h);
          return { w: img!.w * s, h: img!.h * s };
        });
        const capLines = pair.map((p) => wrap(p.caption, 8.5, cellW));
        const rowH = Math.max(...dims.map((d) => d.h)) + Math.max(...capLines.map((c) => c.length)) * (lineH(8.5) + 0.8) + 6;
        ensure(rowH);
        pair.forEach((p, j) => {
          const x = M + j * (cellW + gap);
          const d = dims[j];
          doc.addImage(p.img!.data, "JPEG", x + (cellW - d.w) / 2, y, d.w, d.h);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(70, 70, 70);
          capLines[j].forEach((ln, li) => doc.text(ln, x, y + Math.max(...dims.map((dd) => dd.h)) + 4 + li * (lineH(8.5) + 0.8)));
        });
        y += rowH;
      }
    }
  }

  // 12. Footer + DRAFT watermark on every page
  const total = doc.getNumberOfPages();
  const draft = r.status !== "approved";
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    if (draft) {
      const GState = (doc as any).GState;
      if (GState) doc.setGState(new GState({ opacity: 0.08 }));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(110);
      doc.setTextColor(120, 120, 120);
      doc.text("DRAFT", W / 2, H / 2 + 20, { align: "center", angle: 45 });
      if (GState) doc.setGState(new GState({ opacity: 1 }));
    }
    doc.setDrawColor(220, 224, 230);
    doc.setLineWidth(0.2);
    doc.line(M, H - 12, W - M, H - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text((r.title || "Site Visit Report").slice(0, 80), M, H - 7);
    doc.text(`Version ${r.version || 1}`, W / 2, H - 7, { align: "center" });
    doc.text(`Page ${p} of ${total}`, W - M, H - 7, { align: "right" });
  }

  const safe = (s: string) => s.replace(/[^\w-]+/g, "_").replace(/_+/g, "_").slice(0, 60);
  const fileName = `${safe(ref || "Site_Visit_Report")}-${safe(r.title || "Site_Visit_Report")}-v${r.version || 1}.pdf`;
  return { blob: doc.output("blob"), fileName, report: r };
}

/** Open the PDF in a new tab for viewing (no forced download). */
export async function viewSiteVisitReportPdf(reportId: string) {
  const tab = window.open("", "_blank");
  const { blob } = await buildSiteVisitReportPdf(reportId);
  const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
  if (tab) tab.location.href = url; else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
}

/** Upload the approved PDF and file it on the job, shareable in the customer portal. Returns the storage path. */
export async function fileApprovedSiteVisitReport(reportId: string): Promise<string> {
  const { blob, fileName, report } = await buildSiteVisitReportPdf(reportId);
  const path = `${report.org_id}/site-visit-reports/${report.id}/v${report.version || 1}.pdf`;
  const { error } = await supabase.storage.from("submissions").upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) throw error;
  const ref = `storage://submissions/${path}`;
  const label = `Site Visit Report – ${report.title || "Untitled"} (v${report.version || 1})`;
  // Retire earlier versions from the portal, then file this one.
  await supabase.from("job_documents").update({ shareable_with_customer: false } as any)
    .eq("job_id", report.job_id).eq("document_type", "site_visit_report").like("file_url", `%/site-visit-reports/${report.id}/%`);
  await supabase.from("job_documents").insert({
    job_id: report.job_id, org_id: report.org_id, document_type: "site_visit_report", label, file_url: ref,
    file_name: fileName, source: "site_visit_report", shareable_with_customer: true,
  } as any);
  return path;
}
