import { format, isValid, parseISO } from 'date-fns';

export const PRINT_BODY = { font: 'helvetica', size: 9, colour: [0, 0, 0] as [number, number, number] };
const ABBREVIATIONS = new Set(['UK', 'BS', 'EN', 'ISO', 'QR', 'ID', 'PO', 'VFP', 'Ltd'.toUpperCase(), 'PLC', 'LLP', 'HVAC', 'PVC', 'PT', 'VI', 'N/A', 'BAFE', 'PPM', 'BSP', 'UPVC', 'SS', 'MS', 'M&E']);

/** Print-only name/address formatting; never apply to answers, codes or saved records. */
export function printName(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/[^\s,;()]+/g, token => {
    // Preserve postcodes, numbered references and mixed-case proper names.
    if (/\d|@|:\/\//.test(token) || ABBREVIATIONS.has(token.toUpperCase())) return token;
    if (token !== token.toUpperCase() || !/[A-Z]/.test(token)) return token;
    return token.toLowerCase().replace(/(^|[-'’/&])[a-z]/g, letter => letter.toUpperCase());
  });
}

export function printInspectionType(value?: string | null): string {
  if (!value) return 'Type not recorded';
  if (/pressure/i.test(value)) return 'Pressure test';
  if (/visual/i.test(value)) return 'Visual inspection';
  return value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}
export function printInspectionDate(value?: string | null): string {
  if (!value) return 'Not recorded';
  const parsed = parseISO(value);
  return isValid(parsed) ? format(parsed, 'dd/MM/yyyy') : value;
}
export function printInspectionResult(value?: string | null): string {
  if (!value) return 'Not recorded';
  if (/^pass$/i.test(value)) return 'Pass';
  if (/^fail$/i.test(value)) return 'Fail';
  return value;
}