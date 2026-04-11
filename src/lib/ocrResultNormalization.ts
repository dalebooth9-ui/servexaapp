export interface OcrResultNormalizationField {
  id: string;
  label: string;
  section?: string;
}

const normalizeComparableValue = (value: unknown) => {
  if (value === true) return "yes";
  if (value === false) return "no";
  if (value === null || value === undefined) return "";

  return String(value).trim().toLowerCase();
};

const normalizeSection = (section?: string) => section?.trim().toLowerCase() || "";

const isNaValue = (value: unknown) => {
  const normalized = normalizeComparableValue(value);
  return normalized === "n/a" || normalized === "na";
};

const hasExposedOutlets = (value: unknown) => /exposed\s*outlets?/i.test(normalizeComparableValue(value));

const isCabinetField = (field: OcrResultNormalizationField) => /cabinet/i.test(field.label || "");

const isOutletCabinetField = (field: OcrResultNormalizationField) => {
  const label = field.label || "";
  return /outlet/i.test(label) && /cabinet/i.test(label);
};

export function applyExposedOutletOverrides(
  extracted: Record<string, any> = {},
  fields: OcrResultNormalizationField[] = [],
) {
  if (fields.length === 0) return { ...extracted };

  const next = { ...extracted };
  const exposedOutletSections = new Set<string>();
  let detectedExposedOutlets = false;

  for (const field of fields) {
    if (!hasExposedOutlets(next[field.id])) continue;

    detectedExposedOutlets = true;
    const sectionKey = normalizeSection(field.section);
    if (sectionKey) exposedOutletSections.add(sectionKey);
  }

  for (let index = 0; index < fields.length - 1; index++) {
    const currentField = fields[index];
    const followingField = fields[index + 1];

    if (!hasExposedOutlets(next[currentField.id])) continue;

    const currentSection = normalizeSection(currentField.section);
    const followingSection = normalizeSection(followingField.section);
    const sameSection = !!currentSection && currentSection === followingSection;
    const looksLikeOutletFollowUp = isCabinetField(followingField) || /outlet/i.test(followingField.label || "");

    if ((sameSection || looksLikeOutletFollowUp) && !isNaValue(next[followingField.id])) {
      next[followingField.id] = "n/a";
    }
  }

  for (const field of fields) {
    const sectionKey = normalizeSection(field.section);
    const shouldForceNa =
      (sectionKey !== "" && exposedOutletSections.has(sectionKey) && isCabinetField(field)) ||
      (detectedExposedOutlets && isOutletCabinetField(field));

    if (shouldForceNa && !isNaValue(next[field.id])) {
      next[field.id] = "n/a";
    }
  }

  return next;
}