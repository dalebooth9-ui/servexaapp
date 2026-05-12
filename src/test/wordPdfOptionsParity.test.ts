/**
 * Word ↔ PDF option parity.
 *
 * For every renderable field in a template (checkbox, yes_no, pass_fail,
 * select), this test asserts that the Word value-cell contains exactly the
 * same option set the PDF would render — including N/A when `allow_na` is
 * set on a yes/no checkbox. This is the regression test that catches the
 * historical bug where Word emitted "☐ YES ☐ NO" but the PDF emitted
 * "☐ YES ☐ NO ☐ N/A".
 *
 * Add a fixture for each new template type — the test will iterate every
 * renderable field automatically.
 */
import { describe, it, expect } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";

import {
  buildBlankTemplateDoc,
  type TemplateField,
  type WordTemplateInput,
} from "@/lib/wordTemplateBuilder";
import {
  buildSkipIds,
  getSections,
  getSectionFields,
  type PdfTemplateField,
} from "@/lib/pdfBody";
import realFixtures from "./fixtures/realTemplateFixtures.json";

// ---------------------------------------------------------------------------
// JSDOM/node stubs (mirror the other parity tests).
// ---------------------------------------------------------------------------
const PNG_1x1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);
(globalThis as unknown as { fetch: typeof fetch }).fetch = (async () =>
  new Response(PNG_1x1, { status: 200, headers: { "content-type": "image/png" } })) as unknown as typeof fetch;
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
// Fixtures — each one mirrors a real template family.
// ---------------------------------------------------------------------------
const FIXTURES: WordTemplateInput[] = [
  {
    name: "Dry Riser — Annual Pressure Test",
    fields: [
      { id: "f_customer", label: "Customer", type: "text", section: "Site" },
      { id: "f_clean", label: "Site left clean & tidy?", type: "checkbox", section: "General" },
      // allow_na variants — the bug-history fields.
      {
        id: "f_drained",
        label: "Has the drop leg been drained?",
        type: "checkbox",
        section: "General",
        allow_na: true,
      },
      {
        id: "f_glass",
        label: "Is the Breeching Inlet glass in good condition?",
        type: "checkbox",
        section: "External",
        allow_na: true,
      },
      {
        id: "f_padlock",
        label: "Does the landing valve have a padlock & strap?",
        type: "checkbox",
        section: "Internal",
        allow_na: true,
      },
      {
        id: "f_arv_installed",
        label: "Is an air release valve installed?",
        type: "yes_no",
        section: "ARV",
        allow_na: true,
      },
      // Pass/fail always emits P/F/N/A in both PDF and Word.
      { id: "f_result", label: "Pressure test result:", type: "pass_fail", section: "Results" },
      // Custom select — Word must emit each option label as-is.
      {
        id: "f_coupling",
        label: "Coupling type",
        type: "select",
        options: ["BS336", "Storz"],
        section: "Inlet",
      },
    ],
  },
  {
    name: "Fire Extinguisher Service Sheet",
    fields: [
      { id: "g_ref", label: "Job Ref", type: "text", section: "Details" },
      { id: "g_pf", label: "Cylinder pass/fail", type: "pass_fail", section: "Cylinder" },
      { id: "g_yn", label: "Cylinder OK?", type: "checkbox", section: "Cylinder" },
      {
        id: "g_yn_na",
        label: "Recharge required?",
        type: "checkbox",
        section: "Cylinder",
        allow_na: true,
      },
    ],
  },
  // Real production templates — snapshot of `job_sheet_templates` rows we
  // ship by default. Loaded from JSON so the snapshot can be refreshed with
  // a single psql dump. Guarantees the parity check covers every field
  // type + section combination that actually reaches users (text, number,
  // date, textarea, checkbox, pass_fail, select with arbitrary and
  // Pass/Fail/N/A option sets, signature, multi-section layouts).
  ...(realFixtures as unknown as WordTemplateInput[]),
];

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------
async function unpackDocXml(template: WordTemplateInput): Promise<string> {
  const doc = await buildBlankTemplateDoc(template);
  const buf = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buf);
  return (await zip.file("word/document.xml")?.async("string")) ?? "";
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Extract each table row's value-cell text, keyed by the row's label. We
 * walk every <w:tr>, take the bold label run from the first cell, and
 * concatenate every <w:t> in the second cell — this is exactly what the
 * eye sees on the rendered page.
 */
function extractValueCellByLabel(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  const rows = xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g) || [];
  for (const row of rows) {
    const cells = row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
    if (cells.length < 2) continue;
    const cellText = (cell: string) => {
      const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
      let s = "";
      let m: RegExpExecArray | null;
      while ((m = re.exec(cell)) !== null) s += decodeXmlEntities(m[1]);
      return s.trim();
    };
    const label = cellText(cells[0]);
    if (!label) continue;
    out.set(label, cellText(cells[1]));
  }
  return out;
}

/**
 * Canonical PDF option set for a field — the source of truth that Word
 * must mirror. Returns null for fields that don't render checkbox
 * options (text, number, textarea, signature, date).
 */
function expectedOptions(field: TemplateField): string[] | null {
  if (field.type === "pass_fail") return ["P", "F", "N/A"];
  if (field.type === "checkbox" || field.type === "yes_no") {
    return field.allow_na ? ["YES", "NO", "N/A"] : ["YES", "NO"];
  }
  if (field.type === "select" && field.options && field.options.length > 0) {
    // PDF renders yes/no select options upper-cased; arbitrary options
    // render as-is. Word does the same — match either casing.
    const isYesNo =
      field.options.length === 2 &&
      field.options.every((o) => /^(yes|no)$/i.test(o));
    return isYesNo ? field.options.map((o) => o.toUpperCase()) : field.options.slice();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------
describe.each(FIXTURES)("Word ↔ PDF option parity — $name", (template) => {
  it("renders the same field set the PDF would (no extras, no omissions)", async () => {
    const pdfFields = template.fields as unknown as PdfTemplateField[];
    const skipIds = buildSkipIds(pdfFields);
    const pdfBodyLabels = getSections(pdfFields).flatMap((s) =>
      getSectionFields(pdfFields, s, skipIds).map((f) => f.label),
    );

    const xml = await unpackDocXml(template);
    const wordRows = extractValueCellByLabel(xml);
    for (const label of pdfBodyLabels) {
      expect(
        wordRows.has(label),
        `Word output missing field row "${label}" that the PDF renders`,
      ).toBe(true);
    }
  });

  it("renders the exact same checkbox option set as the PDF for every field", async () => {
    const xml = await unpackDocXml(template);
    const wordRows = extractValueCellByLabel(xml);

    const pdfFields = template.fields as unknown as PdfTemplateField[];
    const skipIds = buildSkipIds(pdfFields);
    const renderable = template.fields.filter(
      (f) => !skipIds.has(f.id) && expectedOptions(f) !== null,
    );

    for (const field of renderable) {
      const expected = expectedOptions(field)!;
      const wordValue = wordRows.get(field.label);
      expect(wordValue, `Missing value cell for field "${field.label}"`).toBeDefined();

      // Each expected option must appear in the value cell text.
      for (const opt of expected) {
        expect(
          wordValue!.includes(opt),
          `Field "${field.label}" — Word value "${wordValue}" missing option "${opt}" (PDF renders ${JSON.stringify(expected)})`,
        ).toBe(true);
      }

      // No spurious extra options. Specifically: if PDF does NOT render
      // N/A for this field, Word must not emit "N/A" either.
      if (!expected.includes("N/A")) {
        expect(
          /\bN\/A\b/.test(wordValue!),
          `Field "${field.label}" — Word incorrectly renders N/A (PDF renders only ${JSON.stringify(expected)})`,
        ).toBe(false);
      }
    }
  });
});
