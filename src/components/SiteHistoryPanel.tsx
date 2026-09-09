import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { History, MapPin, AlertTriangle, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { SiteAtAGlance } from "@/components/AtAGlanceStrip";

interface SiteHistoryPanelProps {
  currentJobId: string;
  siteId?: string | null;
  address?: string | null;
}

interface PrevJob {
  id: string;
  name: string | null;
  reference_number: string | null;
  status: string | null;
  due_date: string | null;
  created_at: string;
}

interface OpenDefect {
  id: string;
  title: string;
  severity: string | null;
  job_id: string | null;
  created_at: string;
}

const statusVariant = (status?: string | null) => {
  const s = (status || "").toLowerCase();
  if (s === "completed") return "default";
  if (s === "in_progress" || s === "scheduled") return "secondary";
  if (s === "on_hold" || s === "awaiting_parts") return "outline";
  if (s === "rejected" || s === "archived") return "destructive";
  return "secondary";
};

const formatDate = (d?: string | null) => {
  if (!d) return null;
  try {
    return format(parseISO(d), "d MMM yyyy");
  } catch {
    return null;
  }
};

// Normalise an address for loose comparison
const normAddr = (a?: string | null) =>
  (a || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Generic address words that appear in many unrelated addresses — excluded from token matching
const GENERIC_ADDRESS_WORDS = new Set([
  "road", "street", "lane", "drive", "close", "avenue", "crescent", "way",
  "place", "court", "terrace", "house", "building", "unit", "floor", "level",
  "suite", "block", "the", "and", "estate", "park", "works", "centre", "center",
  "north", "south", "east", "west", "upper", "lower", "ground", "first", "office",
]);

// County / region names — shared by many addresses, not a site signal
const REGION_WORDS = new Set([
  "cumbria", "lancashire", "yorkshire", "london", "england", "wales", "scotland",
  "britain", "uk", "cheshire", "devon", "cornwall", "kent", "essex", "surrey",
  "hampshire", "dorset", "somerset", "gloucestershire", "oxfordshire", "berkshire",
  "buckinghamshire", "hertfordshire", "bedfordshire", "cambridgeshire", "norfolk",
  "suffolk", "northamptonshire", "warwickshire", "leicestershire", "nottinghamshire",
  "derbyshire", "staffordshire", "shropshire", "herefordshire", "worcestershire",
  "merseyside", "durham", "tyne", "wear", "cleveland", "humberside", "lincolnshire",
  "rutland", "northumberland", "westmorland", "cumberland", "avon", "midlands",
]);

const isMeaningfulToken = (t: string) =>
  t.length >= 3 && !GENERIC_ADDRESS_WORDS.has(t) && !REGION_WORDS.has(t);

// Extract postcode (last 1-2 tokens that look like a UK postcode)
const extractPostcode = (normalised: string): string | null => {
  const tokens = normalised.split(" ");
  const tail = tokens.slice(-2).join(" ");
  if (/^[a-z]{1,2}[0-9]{1,2}[a-z]?\s?[0-9][a-z]{2}$/.test(tail)) return tail.replace(/\s+/g, "");
  const last = tokens[tokens.length - 1] || "";
  if (/^[a-z]{1,2}[0-9]{1,2}[a-z]?$/.test(last)) return last; // outward code only
  return null;
};

export default function SiteHistoryPanel({ currentJobId, siteId, address }: SiteHistoryPanelProps) {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<PrevJob[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [defects, setDefects] = useState<OpenDefect[]>([]);

  const normalisedAddress = normAddr(address);
  const hasUsableAddress = normalisedAddress.length >= 5;

  const shouldRender = Boolean(siteId) || hasUsableAddress;

  useEffect(() => {
    if (!shouldRender) return;
    let cancelled = false;


    (async () => {
      setLoading(true);
      try {
        let prev: PrevJob[] = [];

        if (siteId) {
          const { data } = await supabase
            .from("jobs")
            .select("id, name, reference_number, status, due_date, created_at")
            .eq("site_id", siteId)
            .neq("id", currentJobId)
            .order("created_at", { ascending: false })
            .limit(200);
          prev = (data as PrevJob[] | null) || [];
        } else if (hasUsableAddress) {
          // Fuzzy address fallback.
          // Best fix: scope to the current job's customer first (when known),
          // then apply stricter token matching within that customer's jobs only.
          const { data: currentJob } = await supabase
            .from("jobs")
            .select("customer_id")
            .eq("id", currentJobId)
            .maybeSingle();
          const customerId = (currentJob as { customer_id?: string | null } | null)?.customer_id || null;

          let query = supabase
            .from("jobs")
            .select("id, name, reference_number, status, due_date, created_at, address")
            .neq("id", currentJobId)
            .not("address", "is", null)
            .order("created_at", { ascending: false })
            .limit(500);
          if (customerId) query = query.eq("customer_id", customerId);
          const { data } = await query;

          const tokens = normalisedAddress.split(" ").filter(isMeaningfulToken);
          const postcode = extractPostcode(normalisedAddress);
          prev =
            (data as (PrevJob & { address: string | null })[] | null)
              ?.filter((j) => {
                const cand = normAddr(j.address);
                if (!cand) return false;
                if (cand === normalisedAddress) return true;

                // Postcode is a strong signal: exact postcode match + at least 1
                // shared meaningful token (e.g. street number or building name).
                const candPostcode = extractPostcode(cand);
                const postcodeMatch = Boolean(postcode && candPostcode && postcode === candPostcode);
                const hits = tokens.filter((t) => cand.includes(t)).length;

                if (cand.includes(normalisedAddress) || normalisedAddress.includes(cand)) {
                  // Substring match still needs customer scoping (done above) or a postcode match
                  return Boolean(customerId) || postcodeMatch;
                }

                // Require at least 3 shared meaningful tokens; if postcodes don't
                // match, require even stronger overlap (4+).
                if (postcodeMatch) return hits >= 1;
                return hits >= (postcode && candPostcode ? 4 : 3);
              })
              .map(({ address: _a, ...rest }) => rest) || [];
        }

        if (cancelled) return;
        setTotalCount(prev.length);
        setJobs(prev.slice(0, 5));

        // Open defects across all matched previous jobs
        if (prev.length > 0) {
          const ids = prev.map((j) => j.id);
          const { data: defectData } = await supabase
            .from("defects")
            .select("id, title, severity, job_id, created_at")
            .in("job_id", ids)
            .is("resolved_at", null)
            .order("created_at", { ascending: false })
            .limit(10);
          if (!cancelled) setDefects((defectData as OpenDefect[] | null) || []);
        } else {
          setDefects([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentJobId, siteId, normalisedAddress, hasUsableAddress, shouldRender]);

  if (!shouldRender) return null;

  return (

    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            Site history
          </span>
          {!loading && (
            <Badge variant="secondary">
              {totalCount} previous visit{totalCount === 1 ? "" : "s"}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {siteId && <SiteAtAGlance siteId={siteId} />}
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            First recorded visit to this site
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {jobs.map((j) => {
              const dateLabel =
                formatDate(j.due_date) ||
                formatDate(j.created_at) ||
                "";
              return (
                <li key={j.id}>
                  <Link
                    to={`/jobs/${j.id}`}
                    className="group flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {j.name || "Untitled job"}
                        </span>
                        {j.reference_number && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {j.reference_number}
                          </span>
                        )}
                      </div>
                      {dateLabel && (
                        <p className="text-xs text-muted-foreground">{dateLabel}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {j.status && (
                        <Badge variant={statusVariant(j.status) as any} className="capitalize">
                          {j.status.replace(/_/g, " ")}
                        </Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {!loading && defects.length > 0 && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              {defects.length} open defect{defects.length === 1 ? "" : "s"} at this site
            </div>
            <ul className="space-y-1.5">
              {defects.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-2 text-xs">
                  <Link
                    to={d.job_id ? `/jobs/${d.job_id}` : "#"}
                    className="flex-1 truncate text-amber-900 dark:text-amber-100 hover:underline"
                  >
                    {d.title}
                  </Link>
                  {d.severity && (
                    <span className="shrink-0 capitalize text-amber-800 dark:text-amber-300">
                      {d.severity}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
