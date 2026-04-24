import { describe, it, expect, beforeEach } from "vitest";
import jsPDF from "jspdf";

import { renderBlankFieldRow, type PdfTemplateField } from "@/lib/pdfBody";

const buildField = (overrides: Partial<PdfTemplateField> = {}): PdfTemplateField => ({
  id: "f1",
  label: "Is the valve fitted?",
  type: "yes_no",
  required: false,
  section: "General",
  ...overrides,
});

interface RectCall { x: number; y: number; w: number; h: number; }
interface TextCall { text: string; x: number; y: number; }

function instrument(doc: jsPDF) {
  const rects: RectCall[] = [];
  const texts: TextCall[] = [];
  const origRect = doc.rect.bind(doc);
  const origText = doc.text.bind(doc);
  (doc as any).rect = (x: number, y: number, w: number, h: number, ...rest: any[]) => {
    rects.push({ x, y, w, h });
    return origRect(x, y, w, h, ...rest);
  };
  (doc as any).text = (text: any, x: number, y: number, ...rest: any[]) => {
    const str = Array.isArray(text) ? text.join(" ") : String(text);
    texts.push({ text: str, x, y });
    return origText(text, x, y, ...rest);
  };
  return { rects, texts };
}

describe("renderBlankFieldRow YES/NO checkbox rendering", () => {
  let doc: jsPDF;
  let rects: RectCall[];
  let texts: TextCall[];

  beforeEach(() => {
    doc = new jsPDF();
    ({ rects, texts } = instrument(doc));
  });

  it("renders YES and NO tick boxes for a question-style label (text type)", () => {
    const field = buildField({ type: "text", label: "Is the valve in good condition?" });
    renderBlankFieldRow(doc, field, undefined, 50, { rowH: 6 });

    const labels = texts.map((t) => t.text);
    expect(labels).toContain("YES");
    expect(labels).toContain("NO");
    // Two 3x3 checkbox rects in addition to the two row rects
    const checkboxRects = rects.filter((r) => r.w === 3 && r.h === 3);
    expect(checkboxRects).toHaveLength(2);
    // No tick when no autoVal
    expect(labels).not.toContain("✓");
  });

  it("renders YES/NO tick boxes for BS/EN standard reference labels", () => {
    const field = buildField({ type: "yes_no", label: "BS9990:2015 7.4.3.1 Outlet cabinets in good condition" });
    renderBlankFieldRow(doc, field, undefined, 50, { rowH: 6 });

    const labels = texts.map((t) => t.text);
    expect(labels).toContain("YES");
    expect(labels).toContain("NO");
  });

  it("draws a tick in the YES box when autoVal is 'YES'", () => {
    const field = buildField({ type: "yes_no", label: "Is the drain valve fitted?" });
    renderBlankFieldRow(doc, field, "YES", 50, { rowH: 6 });

    const labels = texts.map((t) => t.text);
    expect(labels).toContain("YES");
    expect(labels).toContain("NO");
    expect(labels).toContain("✓");

    // Tick should be positioned over the YES box (first 3x3 rect).
    const checkboxRects = rects.filter((r) => r.w === 3 && r.h === 3);
    expect(checkboxRects.length).toBeGreaterThanOrEqual(1);
    const yesBox = checkboxRects[0];
    const tick = texts.find((t) => t.text === "✓")!;
    expect(tick.x).toBeGreaterThanOrEqual(yesBox.x - 1);
    expect(tick.x).toBeLessThanOrEqual(yesBox.x + yesBox.w);
  });

  it("does not draw a tick when autoVal is undefined", () => {
    const field = buildField({ type: "yes_no", label: "Is the valve fitted?" });
    renderBlankFieldRow(doc, field, undefined, 50, { rowH: 6 });
    expect(texts.map((t) => t.text)).not.toContain("✓");
  });

  it("does not render YES/NO boxes for incompatible types like textarea", () => {
    const field = buildField({ type: "textarea", label: "Notes?" });
    renderBlankFieldRow(doc, field, undefined, 50, { rowH: 6 });
    const labels = texts.map((t) => t.text);
    expect(labels).not.toContain("YES");
    expect(labels).not.toContain("NO");
  });
});
