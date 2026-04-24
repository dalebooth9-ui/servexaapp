/**
 * Template QA — flags any templates whose question/result layout doesn't
 * match the Dry Riser Visual reference style before publishing.
 *
 * Reference style rules (derived from "Dry Riser Visual" template):
 *  1. Every YES/NO style field uses type "checkbox" or "yes_no"
 *     (never a free-form `select` with Yes/No options, never `pass_fail`
 *     for a binary inspection).
 *  2. Every YES/NO style field has `allow_notes: true` so the rendered
 *     row includes an inline notes slot next to the tick-boxes.
 *  3. Every inspection field belongs to a named `section` (no orphan
 *     ungrouped result rows).
 *  4. Every field has a non-empty `label` ending in a question mark
 *     for inspection-style entries (checkbox / yes_no), so the
 *     question/result layout reads as "question … YES / NO / notes".
 *  5. `select`-type fields with Yes+No options should be migrated to
 *     `checkbox` to match the reference layout.
 */

export type QaField = {
  id?: string;
  label?: string;
  type?: string;
  options?: string[];
  section?: string;
  allow_notes?: boolean;
  required?: boolean;
};

export type QaIssue = {
  fieldId?: string;
  fieldLabel?: string;
  code:
    | "missing_section"
    | "missing_label"
    | "yesno_select_should_be_checkbox"
    | "binary_pass_fail_should_be_checkbox"
    | "missing_allow_notes"
    | "checkbox_label_not_a_question";
  message: string;
  severity: "error" | "warning";
};

export type QaReport = {
  ok: boolean;
  errors: QaIssue[];
  warnings: QaIssue[];
};

const isYesNoOptions = (opts?: string[]) =>
  Array.isArray(opts) &&
  opts.length > 0 &&
  opts.length <= 3 &&
  opts.some((o) => o.toLowerCase() === "yes") &&
  opts.some((o) => o.toLowerCase() === "no");

const isYesNoField = (f: QaField) =>
  f.type === "checkbox" ||
  f.type === "yes_no" ||
  (f.type === "select" && isYesNoOptions(f.options));

/** Run QA on a single template's fields. */
export function runTemplateQa(fields: QaField[] | undefined | null): QaReport {
  const errors: QaIssue[] = [];
  const warnings: QaIssue[] = [];
  const list = Array.isArray(fields) ? fields : [];

  for (const f of list) {
    const ref = { fieldId: f.id, fieldLabel: f.label };

    // Rule 4 (warning): missing label
    if (!f.label || !String(f.label).trim()) {
      warnings.push({
        ...ref,
        code: "missing_label",
        severity: "warning",
        message: "Field is missing a label.",
      });
    }

    // Rule 3 (warning): missing section grouping
    if (!f.section || !String(f.section).trim()) {
      warnings.push({
        ...ref,
        code: "missing_section",
        severity: "warning",
        message: `Field "${f.label || f.id || "?"}" is not grouped under a named section.`,
      });
    }

    // Rule 5 (error): Yes/No select should be a checkbox
    if (f.type === "select" && isYesNoOptions(f.options)) {
      errors.push({
        ...ref,
        code: "yesno_select_should_be_checkbox",
        severity: "error",
        message: `"${f.label || f.id}" is a Yes/No dropdown — convert to a Checkbox to match the Dry Riser Visual style.`,
      });
    }

    // Rule 5 (warning): binary pass_fail used where checkbox is expected
    if (f.type === "pass_fail") {
      const lower = (f.label || "").toLowerCase();
      if (lower.endsWith("?") || /\b(is|are|does|do|has|have)\b/.test(lower)) {
        warnings.push({
          ...ref,
          code: "binary_pass_fail_should_be_checkbox",
          severity: "warning",
          message: `"${f.label || f.id}" reads as a Yes/No question — consider Checkbox instead of Pass/Fail.`,
        });
      }
    }

    // Rule 2 (error): YES/NO field must allow notes
    if (isYesNoField(f) && !f.allow_notes) {
      errors.push({
        ...ref,
        code: "missing_allow_notes",
        severity: "error",
        message: `"${f.label || f.id}" is a YES/NO row but has no inline notes slot — enable "Allow notes".`,
      });
    }

    // Rule 4 (warning): YES/NO labels should read as questions
    if (isYesNoField(f) && f.label && !String(f.label).trim().endsWith("?")) {
      warnings.push({
        ...ref,
        code: "checkbox_label_not_a_question",
        severity: "warning",
        message: `"${f.label}" — YES/NO labels should be phrased as a question (end with "?") to match the reference style.`,
      });
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Convenience: human-readable summary line. */
export function summariseQa(report: QaReport): string {
  if (report.ok && report.warnings.length === 0) return "Layout matches the Dry Riser Visual style.";
  if (report.ok) return `${report.warnings.length} warning${report.warnings.length === 1 ? "" : "s"} — safe to publish.`;
  return `${report.errors.length} blocking issue${report.errors.length === 1 ? "" : "s"} must be fixed before publishing.`;
}
