import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileStack, Search, CheckCircle2, SkipForward, AlertTriangle, RefreshCw, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface JobResult {
  id: string;
  name: string;
  reference_number: string | null;
  category: string | null;
  customer: string | null;
}

interface ReattachResult {
  attached: string[];
  skipped: string[];
  category: string;
}

export default function JobDocumentReattachSettings() {
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [jobs, setJobs] = useState<JobResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ReattachResult>>({});

  const searchJobs = useCallback(async () => {
    if (!search.trim()) return;
    setSearching(true);
    setHasSearched(false);
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, name, reference_number, category, customer")
        .or(
          `name.ilike.%${search.trim()}%,reference_number.ilike.%${search.trim()}%,customer.ilike.%${search.trim()}%`
        )
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      setJobs((data as JobResult[]) ?? []);
      setHasSearched(true);
    } catch (err: any) {
      toast.error(`Search failed: ${err.message}`);
    } finally {
      setSearching(false);
    }
  }, [search]);

  const reattach = async (jobId: string) => {
    setProcessing(jobId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/reattach-job-documents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ job_id: jobId }),
        }
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      setResults((prev) => ({ ...prev, [jobId]: json }));

      if (json.attached.length > 0) {
        toast.success(`Attached ${json.attached.length} document(s) to ${json.job_name}`);
      } else {
        toast.info(`No new documents to attach — all already present`);
      }
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setProcessing(null);
    }
  };

  const categoryLabel = (slug: string | null) => {
    if (!slug) return "—";
    return slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileStack className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Re-attach Job Documents</CardTitle>
        </div>
        <CardDescription>
          Search for a job that was mis-categorised on import and re-trigger automatic document
          attachment once you've corrected its category. Only missing documents are added — existing
          ones are left untouched.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by job name, reference (TM-…) or customer…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchJobs()}
            />
          </div>
          <Button onClick={searchJobs} disabled={searching || !search.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-1.5 hidden sm:inline">Search</span>
          </Button>
        </div>

        {/* Results */}
        {hasSearched && jobs.length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No jobs found matching "{search}"
          </div>
        )}

        {jobs.length > 0 && (
          <div className="rounded-lg border divide-y overflow-hidden">
            {jobs.map((job) => {
              const result = results[job.id];
              const isProcessing = processing === job.id;

              return (
                <div key={job.id} className="p-3 flex items-start gap-3 bg-background hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{job.name}</span>
                      {job.reference_number && (
                        <Badge variant="outline" className="text-[11px] font-mono shrink-0">
                          {job.reference_number}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {job.customer && <span>{job.customer}</span>}
                      <span className="flex items-center gap-1">
                        <ChevronRight className="h-3 w-3" />
                        {categoryLabel(job.category)}
                      </span>
                    </div>

                    {/* Result summary */}
                    {result && (
                      <div className="mt-2 space-y-1">
                        {result.attached.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {result.attached.map((label) => (
                              <span
                                key={label}
                                className="inline-flex items-center gap-1 text-[11px] bg-success/10 text-success border border-success/20 rounded px-1.5 py-0.5"
                              >
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                {label}
                              </span>
                            ))}
                          </div>
                        )}
                        {result.skipped.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {result.skipped.map((label) => (
                              <span
                                key={label}
                                className="inline-flex items-center gap-1 text-[11px] bg-muted text-muted-foreground border rounded px-1.5 py-0.5"
                              >
                                <SkipForward className="h-2.5 w-2.5" />
                                {label}
                              </span>
                            ))}
                          </div>
                        )}
                        {result.attached.length === 0 && result.skipped.length === 0 && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 text-warning" />
                            No templates found for category "{result.category}" — check category document templates in settings.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant={result ? "outline" : "default"}
                    disabled={isProcessing}
                    onClick={() => reattach(job.id)}
                    className="shrink-0"
                  >
                    {isProcessing ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /></>
                    ) : result ? (
                      <><RefreshCw className="h-3.5 w-3.5 mr-1" />Re-run</>
                    ) : (
                      <><FileStack className="h-3.5 w-3.5 mr-1" />Attach</>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Tip: first update the job's category in the job detail page, then use this tool to attach the correct documents.
        </p>
      </CardContent>
    </Card>
  );
}
