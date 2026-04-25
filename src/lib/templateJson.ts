// Helpers for exporting and importing job sheet template definitions as JSON.
// The on-disk format is a small, versioned envelope so we can evolve it later
// without breaking older files.

export const TEMPLATE_JSON_VERSION = 1;

export type ExportableTemplateField = {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  section?: string;
  options?: string[];
  placeholder?: string;
  allow_notes?: boolean;
  [key: string]: any;
};

export type ExportableTemplate = {
  id?: string;
  name: string;
  description?: string | null;
  category?: string | null;
  job_category?: string | null;
  status?: "draft" | "published" | string | null;
  locked?: boolean;
  branding?: Record<string, any> | null;
  fields: ExportableTemplateField[];
};

export type TemplateJsonFile = {
  format: "servexa.job-sheet-template";
  version: number;
  exported_at: string;
  template: ExportableTemplate;
};

export function buildTemplateJson(tpl: ExportableTemplate): TemplateJsonFile {
  return {
    format: "servexa.job-sheet-template",
    version: TEMPLATE_JSON_VERSION,
    exported_at: new Date().toISOString(),
    template: {
      id: tpl.id,
      name: tpl.name,
      description: tpl.description ?? null,
      category: (tpl as any).category ?? null,
      job_category: (tpl as any).job_category ?? null,
      status: tpl.status ?? "published",
      locked: !!tpl.locked,
      branding: tpl.branding ?? null,
      fields: Array.isArray(tpl.fields) ? tpl.fields : [],
    },
  };
}

export function templateFileSlug(name: string): string {
  return (name || "template")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "template";
}

export function downloadTemplateJson(tpl: ExportableTemplate) {
  const payload = buildTemplateJson(tpl);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${templateFileSlug(tpl.name)}.template.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export type ParsedTemplateImport = {
  template: ExportableTemplate;
  source: TemplateJsonFile;
};

/**
 * Accepts either the full envelope ({format, version, template}) or a bare
 * template object so users can hand-edit minimal JSON if they want to.
 */
export function parseTemplateJson(raw: string): ParsedTemplateImport {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e: any) {
    throw new Error("File is not valid JSON");
  }

  let envelope: TemplateJsonFile;
  if (parsed && parsed.format === "servexa.job-sheet-template" && parsed.template) {
    envelope = parsed as TemplateJsonFile;
  } else if (parsed && Array.isArray(parsed.fields) && typeof parsed.name === "string") {
    envelope = {
      format: "servexa.job-sheet-template",
      version: TEMPLATE_JSON_VERSION,
      exported_at: new Date().toISOString(),
      template: parsed as ExportableTemplate,
    };
  } else {
    throw new Error(
      "Unrecognised template file. Expected a Servexa template export or an object with `name` and `fields`."
    );
  }

  const tpl = envelope.template;
  if (!tpl.name || typeof tpl.name !== "string") {
    throw new Error("Template `name` is required");
  }
  if (!Array.isArray(tpl.fields) || tpl.fields.length === 0) {
    throw new Error("Template must contain at least one field");
  }
  for (const f of tpl.fields) {
    if (!f || typeof f.id !== "string" || typeof f.label !== "string" || typeof f.type !== "string") {
      throw new Error("Every field needs `id`, `label`, and `type`");
    }
  }

  return { template: tpl, source: envelope };
}
