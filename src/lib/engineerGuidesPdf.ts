import jsPDF from "jspdf";
import type { Guide } from "@/pages/HelpGuides";

/**
 * Printable crib-sheet bundle of the engineer-facing guides.
 * Plain black-on-white so it photocopies and reads in a van.
 */
export async function exportEngineerGuidesPdf(guides: Guide[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;
  const maxW = pageW - margin * 2;
  let y = margin;

  const need = (h: number) => {
    if (y + h > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const write = (text: string, size: number, style: "normal" | "bold", indent = 0) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxW - indent);
    need(lines.length * (size * 0.45) + 2);
    doc.text(lines, margin + indent, y);
    y += lines.length * (size * 0.45) + 2;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Engineer guide pack", margin, y + 6);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `Step-by-step crib sheet for the field. Printed ${new Date().toLocaleDateString("en-GB")}.`,
    margin,
    y,
  );
  y += 10;

  guides.forEach((g, gi) => {
    need(24);
    if (gi > 0) y += 4;
    write(g.title, 14, "bold");
    if (g.purpose) write(g.purpose, 10, "normal");
    y += 1;
    (g.steps || []).forEach((s, i) => {
      if (s.heading) write(`${i + 1}. ${s.heading}`, 11, "bold");
      (s.items || []).forEach((item) => write(`\u2022 ${item}`, 10, "normal", 6));
    });
    if (g.common_problems?.length) {
      write("Common problems", 11, "bold");
      g.common_problems.forEach((p) => {
        write(`${p.problem}`, 10, "bold", 6);
        write(`${p.solution}`, 10, "normal", 6);
      });
    }
    need(6);
    doc.setDrawColor(200);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
  });

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Engineer guide pack — page ${p} of ${total}`, margin, pageH - 8);
    doc.setTextColor(0);
  }

  doc.save("engineer-guide-pack.pdf");
}
