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
import { describe, it, expect } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";

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
  const bodyMatch = bodyXml.match(/<w:body>([\s\S]*?)<\/w:body>/);
  if (!bodyMatch) return [];
  const body = bodyMatch[1];
  const out: { kind: "tbl" | "p"; xml: string }[] = [];
  // Naive top-level scanner: walk and consume <w:tbl>...</w:tbl> or <w:p>...</w:p>
  const re = /<w:(tbl|p)(?:\s[^>]*)?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const tag = m[1] as "tbl" | "p";
    const open = m.index;
    // find matching close, accounting for nesting (paragraphs can nest in cells)
    const closeTag = `</w:${tag}>`;
    const openTag = `<w:${tag}`;
    let depth = 1;
    let i = re.lastIndex;
    while (depth > 0 && i < body.length) {
      const nextOpen = body.indexOf(openTag, i);
      const nextClose = body.indexOf(closeTag, i);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        i = nextOpen + openTag.length;
      } else {
        depth--;
        i = nextClose + closeTag.length;
      }
    }
    out.push({ kind: tag, xml: body.slice(open, i) });
    re.lastIndex = i;
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

      for (let k = 0; k < tableIdxs.length - 1; k++) {
        const from = tableIdxs[k];
        const to = tableIdxs[k + 1];
        const between = blocks.slice(from + 1, to);

        // Exactly one paragraph between two consecutive tables — no stray blanks.
        expect(
          between.length,
          `Expected exactly 1 paragraph between tables #${k} and #${k + 1}, got ${between.length}`,
        ).toBe(1);
        expect(between[0].kind).toBe("p");

        const check = isFlushGapParagraph(between[0].xml);
        expect(check.ok, `Gap paragraph between tables #${k}/${k + 1} is not flush: ${check.reason}`).toBe(true);
      }
    });
  }
});
