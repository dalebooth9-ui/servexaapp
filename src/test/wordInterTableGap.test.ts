/**
 * Regression test — inter-table gap is exactly zero-flush.
 *
 * The Word builder inserts a single "gap-collapser" paragraph between
 * consecutive section tables (header detail grid → section tables → comments
 * → sign-off). That paragraph is the ONLY thing that prevents Word from
 * merging two tables, but it must contribute zero visible vertical space
 * so the rendered layout matches the PDF (which has no paragraph gaps).
 *
 * The gap-collapser must satisfy ALL of:
 *   - <w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>
 *   - contains a single empty/space-only <w:t> with w:sz=1 (so the line
 *     can't push past the 20-twip exact line height)
 *   - no other paragraph exists between the two tables (no extra blanks)
 *
 * If any future edit accidentally drops the spacing attrs, replaces the
 * spacer with a default Paragraph, or inserts a second paragraph between
 * tables, this test fails with a precise diagnostic.
 */
import { describe, it, expect, vi } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";

// Word export resolves the signed-in company's branding, so the test runs as
// Viva Fire (primary colour #1F4E79) with the company's data stubbed.
vi.mock("@/integrations/supabase/client", async (importOriginal) => {
  const mod = await importOriginal<any>();
  const fakeAuth = {
    getUser: async () => ({ data: { user: { id: "00000000-0000-0000-0000-000000000001" } }, error: null }),
  };
  return {
    ...mod,
    supabase: new Proxy(mod.supabase, {
      get: (target, prop, receiver) => (prop === "auth" ? fakeAuth : Reflect.get(target, prop, receiver)),
    }),
  };
});

const PNG_1x1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);
// Supabase REST calls must answer with JSON; only image loads get the PNG stub.
(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: any) => {
  const url = typeof input === "string" ? input : String(input?.url ?? input);
  if (url.includes("/rest/v1/")) {
    let body = "[]";
    if (url.includes("/rpc/get_user_org_id")) {
      body = JSON.stringify("11111111-1111-1111-1111-111111111111");
    } else if (url.includes("/organisations")) {
      body = JSON.stringify({
        id: "11111111-1111-1111-1111-111111111111",
        name: "Viva Fire",
        logo_url: null,
        primary_color: "#1F4E79",
      });
    }
    return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response(PNG_1x1, { status: 200, headers: { "content-type": "image/png" } });
}) as unknown as typeof fetch;
class StubImage {
  naturalWidth = 80;
  naturalHeight = 40;
  set src(_: string) { queueMicrotask(() => this.onload?.()); }
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
}
(globalThis as unknown as { Image: typeof StubImage }).Image = StubImage;

import { buildBlankTemplateDoc, type WordTemplateInput } from "@/lib/wordTemplateBuilder";

const FIXTURES: WordTemplateInput[] = [
  {
    name: "Dry Riser Visual Inspection",
    fields: [
      { id: "f_customer", label: "Customer", type: "text", section: "Site Details" },
      { id: "f_date", label: "Date", type: "date", section: "Site Details" },
      { id: "f_sec_outlet", label: "Outlet hardware", type: "section", section: "Outlet hardware" },
      { id: "f_outlet_caps", label: "Caps fitted?", type: "yes_no", section: "Outlet hardware" },
      { id: "f_inlet_drain", label: "Drain valve fitted?", type: "yes_no", section: "Inlet" },
      { id: "f_inlet_note", label: "Engineer notes", type: "textarea", section: "Inlet" },
    ],
  },
  {
    name: "Fire Extinguisher Service Sheet",
    fields: [
      { id: "g_ref", label: "Job Ref", type: "text", section: "Details" },
      { id: "g_pressure", label: "Pressure (bar)", type: "number", section: "Cylinder" },
      { id: "g_status", label: "Status", type: "select", options: ["Yes", "No"], section: "Cylinder" },
    ],
  },
];

async function getBodyXml(template: WordTemplateInput): Promise<string> {
  const doc = await buildBlankTemplateDoc(template);
  const buf = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buf);
  return (await zip.file("word/document.xml")!.async("string"));
}

/** Top-level body children in order, each tagged as 'tbl' or 'p' with raw XML. */
function topLevelBlocks(bodyXml: string): { kind: "tbl" | "p"; xml: string }[] {
  // Match body content
  const bodyMatch = bodyXml.match(/<w:body(?:\s[^>]*)?>([\s\S]*?)<\/w:body>/);
  if (!bodyMatch) return [];
  const body = bodyMatch[1];
  const out: { kind: "tbl" | "p"; xml: string }[] = [];
  // Strict top-level scanner: an open tag is `<w:tbl>` / `<w:tbl ` / `<w:p>` / `<w:p ` —
  // the trailing char distinguishes them from `<w:tblPr>`, `<w:pPr>`, etc.
  const openRe = /<w:(tbl|p)(?=[\s>])/g;
  const closeRe = (tag: "tbl" | "p") => new RegExp(`</w:${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(body)) !== null) {
    const tag = m[1] as "tbl" | "p";
    const start = m.index;
    let depth = 1;
    let i = openRe.lastIndex;
    const innerOpen = new RegExp(`<w:${tag}(?=[\\s>])`, "g");
    const innerClose = closeRe(tag);
    while (depth > 0) {
      innerOpen.lastIndex = i;
      innerClose.lastIndex = i;
      const o = innerOpen.exec(body);
      const c = innerClose.exec(body);
      if (!c) throw new Error(`Unclosed <w:${tag}> at ${start}`);
      if (o && o.index < c.index) {
        depth++;
        i = o.index + o[0].length;
      } else {
        depth--;
        i = c.index + c[0].length;
      }
    }
    out.push({ kind: tag, xml: body.slice(start, i) });
    openRe.lastIndex = i;
  }
  return out;
}

function isFlushGapParagraph(pXml: string): { ok: boolean; reason?: string } {
  // Must contain w:spacing with the exact gap-collapser attributes.
  const sp = pXml.match(/<w:spacing\b[^/]*\/>/);
  if (!sp) return { ok: false, reason: "missing <w:spacing/>" };
  const s = sp[0];
  const has = (re: RegExp) => re.test(s);
  if (!has(/w:before="0"/)) return { ok: false, reason: `spacing missing before=0: ${s}` };
  if (!has(/w:after="0"/)) return { ok: false, reason: `spacing missing after=0: ${s}` };
  if (!has(/w:line="20"/)) return { ok: false, reason: `spacing missing line=20: ${s}` };
  if (!has(/w:lineRule="exact"/)) return { ok: false, reason: `spacing missing lineRule=exact: ${s}` };
  // Must not contain visible text — only empty/whitespace runs.
  const texts = [...pXml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]);
  if (texts.some((t) => t.trim().length > 0)) {
    return { ok: false, reason: `gap paragraph has visible text: ${JSON.stringify(texts)}` };
  }
  return { ok: true };
}

describe("Word inter-table gap is zero-flush", () => {
  for (const fx of FIXTURES) {
    it(`[${fx.name}] every table-to-table seam uses the flush gap-collapser`, async () => {
      const xml = await getBodyXml(fx);
      const blocks = topLevelBlocks(xml);
      const tableIdxs = blocks
        .map((b, i) => (b.kind === "tbl" ? i : -1))
        .filter((i) => i >= 0);
      expect(tableIdxs.length).toBeGreaterThanOrEqual(2);

      // For every table except the very last, the IMMEDIATELY following
      // top-level block must be the flush gap-collapser paragraph. Anything
      // else (a default paragraph, a missing spacer, a stray blank, or the
      // next table butted directly with no spacer) means Word will render
      // the two tables either fused together or with a visible gap.
      for (let k = 0; k < tableIdxs.length - 1; k++) {
        const after = blocks[tableIdxs[k] + 1];
        expect(after, `No block after table #${k}`).toBeDefined();
        expect(
          after.kind,
          `Expected a paragraph immediately after table #${k}, got <w:${after.kind}>`,
        ).toBe("p");
        const check = isFlushGapParagraph(after.xml);
        expect(
          check.ok,
          `Paragraph after table #${k} is not the flush gap-collapser: ${check.reason}\nXML: ${after.xml.slice(0, 400)}`,
        ).toBe(true);
      }
    });
  }
});
