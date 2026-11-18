/** Display-only job heading: job type and site name once, address once underneath. Saved names are never changed. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function jobHeadline(name: string | null | undefined, siteName?: string | null, address?: string | null): { title: string; address: string } {
  const segs = (name || "").split(/\s+[–—-]\s+|\s*,\s*/).map((s) => s.trim()).filter(Boolean);
  const site = (siteName || "").trim();
  const addr = (address || "").trim();
  const known = [site, addr].filter(Boolean).map(norm);
  const type = segs[0] || "";
  const kept: string[] = [];
  for (const seg of segs.slice(1)) {
    const n = norm(seg);
    if (!n || known.some((k) => k.includes(n)) || kept.some((k) => norm(k) === n)) continue;
    kept.push(seg);
  }
  const parts = [type, site && !norm(type).includes(norm(site)) ? site : "", ...(site ? [] : kept)].filter(Boolean);
  const title = parts.join(" — ") || (name || "").trim();
  const showAddr = addr && !norm(title).includes(norm(addr)) ? addr : "";
  return { title, address: showAddr };
}
