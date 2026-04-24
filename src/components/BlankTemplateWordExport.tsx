import { useState, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Packer } from "docx";
import {
  buildBlankTemplateDoc,
  blankTemplateFileSlug,
  isYesNoOptions,
  type TemplateField,
  type WordTemplateInput,
} from "@/lib/wordTemplateBuilder";

// Re-export so existing imports (e.g. IndustryTemplates) keep working.
export { buildBlankTemplateDoc, blankTemplateFileSlug } from "@/lib/wordTemplateBuilder";

type Props = {
  template: WordTemplateInput;
  /** Visual size override; defaults to icon-only sm button to fit alongside other actions. */
  size?: "sm" | "default";
  /** When true, no UI is rendered; only the imperative ref API is exposed. */
  headless?: boolean;
};

/** Build a value-cell preview string mirroring buildValueCellChildren for on-screen review. */
function previewValueForField(field: TemplateField): string {
  const EMPTY = "☐";
  if (field.type === "pass_fail") return `${EMPTY} P    ${EMPTY} F    ${EMPTY} N/A`;
  if (field.type === "checkbox" || field.type === "yes_no") return `${EMPTY} YES    ${EMPTY} NO`;
  if (field.type === "select" && field.options && field.options.length > 0) {
    return field.options
      .map((o) => `${EMPTY} ${isYesNoOptions(field.options) ? o.toUpperCase() : o}`)
      .join("    ");
  }
  if (field.type === "date") return "_______ / _______ / _______";
  if (field.type === "number") return "____________________";
  if (field.type === "photo") return `${EMPTY} Photo attached`;
  if (field.type === "signature")
    return "Signature: ____________________________________________";
  if (field.type === "textarea" || field.type === "long_text")
    return "____________________________________________________________\n____________________________________________________________\n____________________________________________________________";
  return "____________________________________________________________";
}

type SectionPreview = { name: string; fields: TemplateField[] };

function buildPreviewSections(template: WordTemplateInput): SectionPreview[] {
  const renderable = template.fields.filter((f) => {
    if (f.type === "section") return false;
    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    if (f.section && norm(f.label) === norm(f.section)) return false;
    return true;
  });
  const sectionMap = new Map<string, TemplateField[]>();
  for (const f of renderable) {
    const key = f.section || "Details";
    if (!sectionMap.has(key)) sectionMap.set(key, []);
    sectionMap.get(key)!.push(f);
  }
  return Array.from(sectionMap, ([name, fields]) => ({ name, fields }));
}

export type BlankTemplateWordExportHandle = {
  openPreview: () => void;
  download: () => Promise<void> | void;
};

const BlankTemplateWordExport = forwardRef<BlankTemplateWordExportHandle, Props>(
  function BlankTemplateWordExport({ template, size = "sm", headless = false }, ref) {
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(false);
    const { toast } = useToast();

    const sections = buildPreviewSections(template);

    const download = async () => {
      setBusy(true);
      try {
        const doc = await buildBlankTemplateDoc(template);
        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${blankTemplateFileSlug(template.name)}-blank.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        toast({ title: "Word document downloaded", description: `${template.name} (.docx)` });
        setOpen(false);
      } catch (err: any) {
        toast({ title: "Word export failed", description: err.message, variant: "destructive" });
      } finally {
        setBusy(false);
      }
    };

    useImperativeHandle(ref, () => ({
      openPreview: () => setOpen(true),
      download,
    }));

    return (
      <>
        {!headless && (
          <Button
            variant="outline"
            size={size}
            className="h-7 gap-1.5"
            onClick={() => setOpen(true)}
            title="Preview & download blank template as Word (.docx)"
            aria-label={`Preview and download ${template.name} as Word document`}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
          </Button>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Preview: {template.name}</DialogTitle>
              <DialogDescription>
                Review the blank Word document layout below. Download when ready.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto rounded-md border bg-card p-6 text-sm">
              <h2 className="text-center text-xl font-bold">{template.name}</h2>
              {template.standard && (
                <p className="text-center italic text-muted-foreground mt-1">{template.standard}</p>
              )}
              {template.description && (
                <p className="mt-3 text-muted-foreground">{template.description}</p>
              )}

              {sections.map((s) => (
                <div key={s.name} className="mt-5">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-muted">
                        <th className="border border-border px-2 py-1.5 text-left font-bold uppercase w-[68%]">
                          {s.name}
                        </th>
                        <th className="border border-border px-2 py-1.5 text-left font-bold uppercase">
                          Result
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.fields.map((f) => (
                        <tr key={f.id}>
                          <td className="border border-border px-2 py-1.5 font-medium align-top">
                            {f.label}
                          </td>
                          <td className="border border-border px-2 py-1.5 align-top whitespace-pre-line text-muted-foreground">
                            {previewValueForField(f)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              <div className="mt-6">
                <h3 className="font-bold mb-2">Sign-off</h3>
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    <tr>
                      <td className="border border-border px-2 py-1.5 font-medium w-[68%]">
                        Engineer name
                      </td>
                      <td className="border border-border px-2 py-3"></td>
                    </tr>
                    <tr>
                      <td className="border border-border px-2 py-1.5 font-medium">Signature</td>
                      <td className="border border-border px-2 py-6"></td>
                    </tr>
                    <tr>
                      <td className="border border-border px-2 py-1.5 font-medium">Date</td>
                      <td className="border border-border px-2 py-3"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={download} disabled={busy} className="gap-1.5">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download .docx
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  },
);

export default BlankTemplateWordExport;
