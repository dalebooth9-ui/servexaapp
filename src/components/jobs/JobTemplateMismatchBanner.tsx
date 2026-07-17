import { useState } from "react";
import { AlertTriangle, Sparkles, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

interface Props {
  jobId: string;
  reason: string;
  detectedWorkTypes?: string[] | null;
  onDrafted?: () => void;
}

// Human-friendly labels for detected work-type slugs — kept in sync with
// supabase/functions/_shared/inferJobScope.ts.
const WORK_TYPE_LABELS: Record<string, string> = {
  gas_suppression: "Gas suppression (RIT / IG-55 / FM-200 / Novec)",
  fire_alarm: "Fire alarm",
  em_lighting: "Emergency lighting",
  extinguishers: "Fire extinguishers",
  hose_reels: "Hose reels",
  wet_riser: "Wet riser",
  dry_riser: "Dry riser",
  water_mist: "Water mist",
  smoke_vents: "Smoke vents / AOV",
  fire_doors: "Fire doors",
  kitchen_suppression: "Kitchen suppression (Ansul)",
  sprinkler: "Sprinkler",
  hydrant: "Hydrant",
};

export default function JobTemplateMismatchBanner({
  jobId,
  reason,
  detectedWorkTypes,
  onDrafted,
}: Props) {
  const { toast } = useToast();
  const [drafting, setDrafting] = useState<string | null>(null);

  const draftableTypes = (detectedWorkTypes || []).filter((s) => WORK_TYPE_LABELS[s]);

  const draftTemplate = async (slug: string) => {
    setDrafting(slug);
    try {
      const { data, error } = await supabase.functions.invoke("draft-job-sheet-template", {
        body: { work_type_slug: slug, work_type_label: WORK_TYPE_LABELS[slug] || slug, source_job_id: jobId },
      });
      if (error) throw error;
      toast({
        title: "Draft template created",
        description: `"${(data as any)?.name || slug}" is saved as an unpublished draft. Review and publish it in Templates.`,
      });
      onDrafted?.();
    } catch (e: any) {
      toast({ title: "Could not draft template", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setDrafting(null);
    }
  };

  return (
    <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">Work-type / paperwork mismatch</p>
          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap break-words">{reason}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-7">
        <Button asChild variant="outline" size="sm">
          <Link to="/industry-templates">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Open Template Builder
          </Link>
        </Button>
        {draftableTypes.map((slug) => (
          <Button
            key={slug}
            variant="secondary"
            size="sm"
            disabled={drafting !== null}
            onClick={() => draftTemplate(slug)}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            {drafting === slug ? "Drafting…" : `AI-draft "${WORK_TYPE_LABELS[slug]}" template`}
          </Button>
        ))}
      </div>
    </div>
  );
}
