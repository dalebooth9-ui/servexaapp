import { paperCompletionIso } from "@/lib/paperReportDate";

export function paperReportFilename(customer: string | null | undefined, site: string | null | undefined, date: string | null | undefined, reportType: string | null | undefined): string {
  const clean = (value: string) => value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim();
  const iso = date?.includes("T") ? date.slice(0, 10) : date;
  const [year, month, day] = paperCompletionIso(iso).slice(0, 10).split("-");
  return [customer || "Unmatched customer", site || "No site", `${day}-${month}-${year}`, reportType || "Electronic report"].map(clean).join(" - ") + ".pdf";
}

export function uniquePaperFilename(filename: string, used: Set<string>): string {
  let name = filename;
  let number = 2;
  while (used.has(name)) name = filename.replace(/\.pdf$/i, ` (${number++}).pdf`);
  used.add(name);
  return name;
}

export async function savePaperBlob(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; }
    catch (error) { if ((error as DOMException).name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}