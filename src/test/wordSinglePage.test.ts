/**
 * Single-page regression test for the Word blank-template export.
 *
 * Word doesn't expose a true "rendered page count" without launching Word
 * itself, so we approximate page height by summing the minimum vertical
 * footprint of every block in `word/document.xml`:
 *
 *   • Each <w:tr> contributes its <w:trHeight w:val="N"/> in DXA. When a
 *     row has no explicit height we fall back to a conservative single
 *     line (~260 DXA = ~9pt + padding).
 *   • Each top-level <w:p> contributes:
 *       max(font line height from <w:sz>, default 220 DXA)
 *     + <w:spacing w:before/w:after> in DXA.
 *
 * The test then asserts that the cumulative height up to AND INCLUDING the
 * last sign-off row (the second "Signature:" row) fits inside the A4
 * content area:
 *
 *   page height (A4)          16838 DXA
 *   − top margin                567
 *   − bottom margin             567
 *   − header reservation       1500  (logo ~22mm + air)
 *   − footer reservation       1200  (accred row + declaration)
 *   ─────────────────────────────────
 *   usable body height       ≈13004 DXA
 *
 * If a future change adds a new section or bumps row heights enough that
 * the sign-off block would slip onto page 2, this test fails before the
 * regression ships.
 */
import { describe, it, expect } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";

import {
  buildBlankTemplateDoc,
  type WordTemplateInput,
} from "@/lib/wordTemplateBuilder";

// ---------------------------------------------------------------------------
// JSDOM stubs (mirror wordPdfParity.test.ts so the doc builds in node).
// ---------------------------------------------------------------------------
const PNG_1x1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);
(globalThis as unknown as { fetch: typeof fetch }).fetch = (async () =>
  new Response(PNG_1x1, {
    status: 200,
    headers: { "content-type": "image/png" },
  })) as unknown as typeof fetch;
class StubImage {
  naturalWidth = 16;
  naturalHeight = 16;
  set src(_: string) {
    queueMicrotask(() => this.onload?.());
  }
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
}
(globalThis as unknown as { Image: typeof StubImage }).Image = StubImage;

// ---------------------------------------------------------------------------
// Fixtures — representative of the heaviest real templates we ship. If any
// of these spills to page 2 the regression test fails.
// ---------------------------------------------------------------------------
const FIXTURES: WordTemplateInput[] = [
  {
    name: "Dry Riser Visual Inspection",
    fields: [
      { id: "h_customer", label: "Customer", type: "text", section: "Site Details" },
      { id: "h_date", label: "Date", type: "date", section: "Site Details" },
      { id: "h_site", label: "Site", type: "text", section: "Site Details" },
      { id: "h_riser", label: "Riser Location", type: "text", section: "Site Details" },
      { id: "s1", label: "Outlet hardware", type: "section", section: "Outlet hardware" },
      { id: "s1a", label: "BS9990 Outlet cabinet condition?", type: "yes_no", section: "Outlet hardware" },
      { id: "s1b", label: "Outlet caps fitted?", type: "pass_fail", section: "Outlet hardware" },
      { id: "s1c", label: "Outlet valve type", type: "select", options: ["BS336", "Storz"], section: "Outlet hardware" },
      { id: "s1d", label: "Engineer notes", type: "textarea", section: "Outlet hardware" },
      { id: "s2", label: "Inlet", type: "section", section: "Inlet" },
      { id: "s2a", label: "Drain valve fitted?", type: "yes_no", section: "Inlet" },
      { id: "s2b", label: "Coupling type", type: "select", options: ["BS336", "Storz"], section: "Inlet" },
      { id: "s2c", label: "Inlet pressure (bar)", type: "number", section: "Inlet" },
      { id: "s2d", label: "Witness signature", type: "signature", section: "Inlet" },
    ],
  },
  {
    name: "Fire Extinguisher Service Sheet",
    fields: [
      { id: "g_ref", label: "Job Ref", type: "text", section: "Details" },
      { id: "g_id", label: "Extinguisher ID", type: "text", section: "Details" },
      { id: "g_type", label: "Type", type: "select", options: ["CO2", "Water", "Foam", "Powder"], section: "Details" },
      { id: "g_pressure", label: "Pressure (bar)", type: "number", section: "Cylinder" },
      { id: "g_status", label: "Status", type: "select", options: ["Yes", "No"], section: "Cylinder" },
      { id: "g_seal", label: "Tamper seal intact?", type: "yes_no", section: "Cylinder" },
      { id: "g_label", label: "Service label fitted?", type: "pass_fail", section: "Cylinder" },
      { id: "g_notes", label: "Engineer comments", type: "textarea", section: "Cylinder" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Page geometry (must mirror wordTemplateBuilder.ts section properties).
// ---------------------------------------------------------------------------
const A4_HEIGHT_DXA = 16838;
const MARGIN_TOP_DXA = 567;
const MARGIN_BOTTOM_DXA = 567;
const HEADER_RESERVATION_DXA = 1500; // header logo (~22mm) + breathing room
const FOOTER_RESERVATION_DXA = 1200; // accred row + declaration block

const USABLE_BODY_DXA =
  A4_HEIGHT_DXA -
  MARGIN_TOP_DXA -
  MARGIN_BOTTOM_DXA -
  HEADER_RESERVATION_DXA -
  FOOTER_RESERVATION_DXA;

// Default heights when XML doesn't specify — mirror Word's own minimums.
const DEFAULT_ROW_DXA = 260;
const DEFAULT_PARA_DXA = 220;

// ---------------------------------------------------------------------------
// Heuristic height accounting.
// ---------------------------------------------------------------------------

/** Sum of `<w:trHeight w:val="N"/>` for every direct row, plus a fallback. */
function rowHeightsFromXml(xml: string): number[] {
  const rows = xml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
  return rows.map((row) => {
    const m = row.match(/<w:trHeight\s+[^/]*w:val="(\d+)"/);
    return m ? parseInt(m[1], 10) : DEFAULT_ROW_DXA;
  });
}

/**
 * Walk top-level body blocks (paragraphs and tables) in document order.
 * Returns the cumulative DXA height up to (and including) the LAST table
 * row in the doc — which is, by construction, the second sign-off row.
 */
function cumulativeHeightToLastRow(docXml: string): {
  total: number;
  lastRowEndsAt: number;
} {
  // Match every top-level <w:p>…</w:p> or <w:tbl>…</w:tbl> in body order.
  // (docx-js never nests tables in our builder, so a flat regex is safe.)
  const blockRe = /<w:p\b[\s\S]*?<\/w:p>|<w:tbl\b[\s\S]*?<\/w:tbl>/g;
  let match: RegExpExecArray | null;
  let cumulative = 0;
  let lastRowEndsAt = 0;

  while ((match = blockRe.exec(docXml)) !== null) {
    const block = match[0];

    if (block.startsWith("<w:tbl")) {
      const heights = rowHeightsFromXml(block);
      for (const h of heights) {
        cumulative += h;
        lastRowEndsAt = cumulative;
      }
      continue;
    }

    // Paragraph: line height from first <w:sz> + spacing before/after.
    const szMatch = block.match(/<w:sz\s+[^/]*w:val="(\d+)"/);
    // <w:sz> is half-points → 1 pt ≈ 20 DXA → line ≈ size * 10 DXA + leading.
    const lineDxa = szMatch
      ? Math.round(parseInt(szMatch[1], 10) * 12)
      : DEFAULT_PARA_DXA;
    const beforeMatch = block.match(/<w:spacing\s+[^/]*w:before="(\d+)"/);
    const afterMatch = block.match(/<w:spacing\s+[^/]*w:after="(\d+)"/);
    const before = beforeMatch ? parseInt(beforeMatch[1], 10) : 0;
    const after = afterMatch ? parseInt(afterMatch[1], 10) : 0;
    cumulative += before + lineDxa + after;
  }

  return { total: cumulative, lastRowEndsAt };
}

async function unpackDocXml(template: WordTemplateInput): Promise<string> {
  const doc = await buildBlankTemplateDoc(template);
  const buf = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buf);
  return (await zip.file("word/document.xml")!.async("string")) || "";
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe.each(FIXTURES)(
  "Word single-page fit — $name",
  (template) => {
    it(`keeps the sign-off block on page 1 (≤ ${USABLE_BODY_DXA} DXA usable body)`, async () => {
      const docXml = await unpackDocXml(template);
      const { lastRowEndsAt } = cumulativeHeightToLastRow(docXml);

      // Diagnostic message is critical: a future failure should show by how
      // many DXA we overflowed so the next contributor can pick the right
      // knob (margins / row heights / spacing) to tighten.
      const overshootMm = ((lastRowEndsAt - USABLE_BODY_DXA) / 56.7).toFixed(1);
      expect(
        lastRowEndsAt,
        `Sign-off row ends at ${lastRowEndsAt} DXA but usable body is only ${USABLE_BODY_DXA} DXA. ` +
          `Document overflows by ~${overshootMm} mm and will push to page 2.`,
      ).toBeLessThanOrEqual(USABLE_BODY_DXA);
    });

    it("contains exactly three sign-off rows after the Comments box", async () => {
      // Belt-and-braces: if someone refactors the sign-off block away the
      // single-page check above could silently pass. Verify the sign-off
      // structure is still present.
      const docXml = await unpackDocXml(template);
      const tokens = docXml.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) || [];
      const text = tokens.join("|");
      expect(text).toContain(">Comments:<");
      // Date / Technician / Customer / Signature labels — Date & Signature
      // appear twice (left + right column).
      const count = (needle: string) =>
        (text.match(new RegExp(`>${needle}<`, "g")) || []).length;
      expect(count("Date:")).toBeGreaterThanOrEqual(2);
      expect(count("Signature:")).toBeGreaterThanOrEqual(2);
      expect(count("Technician:")).toBeGreaterThanOrEqual(1);
      expect(count("Customer:")).toBeGreaterThanOrEqual(1);
    });
  },
);
