import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Eye, Download, Printer, Loader2, FileText, FileType, PenLine, FileStack } from "lucide-react";
import BlankTemplatePdfExport, {
  type BlankTemplatePdfExportHandle,
} from "@/components/BlankTemplatePdfExport";
import BlankTemplateWordExport, {
  type BlankTemplateWordExportHandle,
} from "@/components/BlankTemplateWordExport";
import { downloadBlob } from "@/lib/regenerateTemplateExports";
import { blankTemplateFileSlug, buildBlankTemplateDoc } from "@/lib/wordTemplateBuilder";
import { Packer } from "docx";
import { useToast } from "@/hooks/use-toast";

type Props = {
  template: any;
  jobInfo?: any;
};

/**
 * Compact action bar for blank industry templates.
 * Combines Preview, Download (PDF / Word / Handfill PDF) and Print into 3 controls
 * instead of the previous 5+ icon buttons, so cards fit on smaller screens.
 */
export default function BlankTemplateActions({ template, jobInfo = null }: Props) {
  const pdfRef = useRef<BlankTemplatePdfExportHandle>(null);
  const wordRef = useRef<BlankTemplateWordExportHandle>(null);
  const [busy, setBusy] = useState(false);

  const { toast } = useToast();

  const run = async (fn: () => Promise<any> | any) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  /**
   * Regenerate BOTH PDF and Word from the same template object — guarantees
   * both files reflect the identical template version. Word doc is built
   * inline via the headless ref; PDF blob is built via getBlob(). Both
   * generators share the layout helpers proven equivalent by
   * `wordPdfFullParity.test.ts`.
   */
  const downloadBoth = async () => {
    const slug = blankTemplateFileSlug(template.name);
    try {
      const [pdfBlob, wordDoc] = await Promise.all([
        pdfRef.current?.getBlob() ?? Promise.resolve(null),
        buildBlankTemplateDoc(template),
      ]);
      const docxBlob = await Packer.toBlob(wordDoc);
      if (pdfBlob) downloadBlob(pdfBlob, `${slug}-blank.pdf`);
      downloadBlob(docxBlob, `${slug}-blank.docx`);
      toast({
        title: "Regenerated PDF + Word",
        description: `${template.name} — both files exported from the same template version.`,
      });
    } catch (err: any) {
      toast({
        title: "Regeneration failed",
        description: err?.message ?? "Unable to export both formats.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center gap-1">
      {/* Preview (PDF) */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        disabled={busy}
        onClick={() => run(() => pdfRef.current?.preview())}
        title="Preview blank template"
        aria-label={`Preview ${template.name}`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>

      {/* Download — choose format */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={busy}
            title="Download blank template"
            aria-label={`Download ${template.name}`}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel className="text-xs">Download as</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => run(() => pdfRef.current?.download())}>
            <FileType className="h-3.5 w-3.5 mr-2" /> PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => run(() => wordRef.current?.download())}>
            <FileText className="h-3.5 w-3.5 mr-2" /> Word (.docx)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => run(() => pdfRef.current?.download({ handfill: true }))}>
            <PenLine className="h-3.5 w-3.5 mr-2" /> Handfill PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => run(() => pdfRef.current?.preview({ handfill: true }))}>
            <Eye className="h-3.5 w-3.5 mr-2" /> Preview Handfill
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Quick Word download (also available inside Download menu) */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        disabled={busy}
        onClick={() => run(() => wordRef.current?.download())}
        title="Download as Word (.docx)"
        aria-label={`Download ${template.name} as Word document`}
      >
        <FileText className="h-3.5 w-3.5" />
      </Button>

      {/* Print */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        disabled={busy}
        onClick={() => run(() => pdfRef.current?.print())}
        title="Print blank template"
        aria-label={`Print ${template.name}`}
      >
        <Printer className="h-3.5 w-3.5" />
      </Button>

      {/* Headless renderers — provide the actual generation logic via refs */}
      <BlankTemplatePdfExport ref={pdfRef} template={template} jobInfo={jobInfo} headless />
      <BlankTemplateWordExport ref={wordRef} template={template} headless />
    </div>
  );
}
