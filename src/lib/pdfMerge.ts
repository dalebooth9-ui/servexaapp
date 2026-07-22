import { PDFDocument } from "pdf-lib";

async function fetchPdfBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch PDF (${res.status})`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

export async function pdfUrlToBlobUrl(url: string): Promise<string> {
  const bytes = await fetchPdfBytes(url);
  const blob = new Blob([bytesToArrayBuffer(bytes)], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

export async function mergePdfUrlsToBytes(urls: string[]): Promise<Uint8Array> {
  if (urls.length === 0) throw new Error("No PDFs to merge");
  if (urls.length === 1) return fetchPdfBytes(urls[0]);

  const merged = await PDFDocument.create();
  for (const url of urls) {
    const bytes = await fetchPdfBytes(url);
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return await merged.save();
}

export async function mergePdfUrlsToBlobUrl(urls: string[]): Promise<string> {
  const bytes = await mergePdfUrlsToBytes(urls);
  const blob = new Blob([bytesToArrayBuffer(bytes)], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

export async function mergePdfUrlsToBase64(urls: string[]): Promise<string> {
  const bytes = await mergePdfUrlsToBytes(urls);
  return bytesToBase64(bytes);
}