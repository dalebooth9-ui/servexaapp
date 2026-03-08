/**
 * Shared ExcelJS utilities for reading and writing Excel files.
 * This replaces the legacy `xlsx` (SheetJS) package.
 */
import ExcelJS from "exceljs";

/**
 * Parse an Excel (.xlsx / .xls) file into a 2-D string array (rows × cols).
 * Returns the first worksheet only.
 */
export async function readExcelFile(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.worksheets[0];
  if (!ws) return [];

  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      if (v === null || v === undefined) {
        cells.push("");
      } else if (typeof v === "object" && "richText" in v) {
        cells.push(v.richText.map((rt: any) => rt.text).join(""));
      } else if (typeof v === "object" && "result" in v) {
        cells.push(String((v as ExcelJS.CellFormulaValue).result ?? ""));
      } else if (v instanceof Date) {
        cells.push(v.toISOString().split("T")[0]);
      } else {
        cells.push(String(v));
      }
    });
    rows.push(cells.map((c) => c.trim()));
  });

  return rows;
}

/**
 * Write a 2-D array of data to an .xlsx file and trigger browser download.
 * @param data     Rows × columns. Row 0 is treated as the header.
 * @param fileName Target filename (should end in .xlsx).
 * @param sheetName Optional worksheet name.
 * @param merges   Optional cell merges [{s:{r,c}, e:{r,c}}].
 * @param colWidths Optional column widths [{wch: number}].
 */
export async function writeExcelFile(
  data: (string | number)[][],
  fileName: string,
  sheetName = "Sheet1",
  merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [],
  colWidths: { wch: number }[] = []
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);

  data.forEach((row) => {
    ws.addRow(row);
  });

  // Apply column widths
  if (colWidths.length) {
    ws.columns = colWidths.map((cw) => ({ width: cw.wch }));
  }

  // Apply merges
  merges.forEach(({ s, e }) => {
    ws.mergeCells(s.r + 1, s.c + 1, e.r + 1, e.c + 1);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
