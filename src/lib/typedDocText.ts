// Reads the typed text straight out of typed PDFs and Word (.docx) reports, so
// already-typed old reports never go through the handwriting reader.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

/** Average characters per page needed to treat a PDF as typed (not a scan). */
export const TYPED_MIN_CHARS_PER_PAGE = 150;

export function looksTyped(text: string, pages: number): boolean {
  const chars = text.replace(/\s+/g, "").length;
  return pages > 0 && chars / pages >= TYPED_MIN_CHARS_PER_PAGE;
}

export const isDocx = (f: File) => /\.docx$/i.test(f.name) || f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function pdfText(file: File): Promise<{ text: string; pages: number }> {
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const pdf = await (pdfjsLib as any).getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    let line = "", lastY: number | null = null;
    const lines: string[] = [];
    for (const it of tc.items as any[]) {
      const y = it.transform?.[5];
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) { lines.push(line.trim()); line = ""; }
      line += (line && !line.endsWith(" ") ? " " : "") + (it.str || "");
      lastY = y ?? lastY;
    }
    if (line.trim()) lines.push(line.trim());
    parts.push(`--- Page ${i} ---\n${lines.filter(Boolean).join("\n")}`);
  }
  return { text: parts.join("\n"), pages: pdf.numPages };
}

/** Plain text of a .docx, keeping paragraph and table-cell breaks. */
export function docxXmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:tc>/g, " | ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function docxText(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file("word/document.xml")?.async("string");
  return xml ? docxXmlToText(xml) : "";
}
