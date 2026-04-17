import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, AlertTriangle, X as XIcon, Minus, Download, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { CERTIFICATION_TYPES, certTypeLabel, getCertStatus, bestCertOfType, type CertStatus } from "@/lib/certStatus";

type CertDoc = {
  id: string;
  engineer_id: string;
  title: string;
  certification_type: string | null;
  issuing_body: string | null;
  certificate_number: string | null;
  expiry_date: string | null;
  date_obtained: string | null;
};

interface Props {
  engineers: { user_id: string; full_name: string | null }[];
}

const STATUS_BG: Record<CertStatus, string> = {
  valid: "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400",
  expiring_soon: "bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400",
  expired: "bg-destructive/15 hover:bg-destructive/25 text-destructive",
  no_expiry: "bg-muted hover:bg-muted/80 text-muted-foreground",
};

function StatusIcon({ s }: { s: CertStatus | null }) {
  if (!s) return <Minus className="h-4 w-4 opacity-40" />;
  if (s === "valid" || s === "no_expiry") return <Check className="h-4 w-4" />;
  if (s === "expiring_soon") return <AlertTriangle className="h-4 w-4" />;
  return <XIcon className="h-4 w-4" />;
}

export default function SkillMatrixView({ engineers }: Props) {
  const [docs, setDocs] = useState<CertDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("__all");
  const [drill, setDrill] = useState<{ engineerName: string; type: string; cert: CertDoc | null } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("engineer_documents" as any)
        .select("id, engineer_id, title, certification_type, issuing_body, certificate_number, expiry_date, date_obtained")
        .not("certification_type", "is", null);
      setDocs((data as any) || []);
      setLoading(false);
    })();
  }, []);

  const visibleTypes = useMemo(
    () => filter === "__all" ? CERTIFICATION_TYPES : CERTIFICATION_TYPES.filter((t) => t.value === filter),
    [filter],
  );

  const cellFor = (engineerId: string, type: string): { status: CertStatus | null; cert: CertDoc | null } => {
    const engDocs = docs.filter((d) => d.engineer_id === engineerId);
    const best = bestCertOfType(engDocs, type);
    return { status: best ? getCertStatus(best.expiry_date) : null, cert: best };
  };

  const exportCsv = () => {
    const headers = ["Engineer", ...visibleTypes.map((t) => t.label)];
    const rows = engineers.map((e) => {
      const cells = visibleTypes.map((t) => {
        const { status, cert } = cellFor(e.user_id, t.value);
        if (!status) return "";
        const exp = cert?.expiry_date ? ` (exp ${format(new Date(cert.expiry_date), "yyyy-MM-dd")})` : "";
        return `${status}${exp}`;
      });
      return [e.full_name || "Unknown", ...cells];
    });
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skill-matrix-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Filter:</span>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-8 w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All certification types</SelectItem>
                {CERTIFICATION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-emerald-500/40" />Valid</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-amber-500/40" />Expiring</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-destructive/40" />Expired</span>
            <Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1 h-3.5 w-3.5" />CSV</Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left font-medium">Engineer</th>
                {visibleTypes.map((t) => (
                  <th key={t.value} className="whitespace-nowrap px-2 py-2 text-center text-xs font-medium">
                    <span className="inline-block max-w-[120px] truncate" title={t.label}>{t.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {engineers.length === 0 ? (
                <tr><td colSpan={visibleTypes.length + 1} className="py-8 text-center text-muted-foreground">No engineers.</td></tr>
              ) : (
                engineers.map((e) => (
                  <tr key={e.user_id} className="border-t">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-background px-3 py-1.5 font-medium">{e.full_name || "—"}</td>
                    {visibleTypes.map((t) => {
                      const { status, cert } = cellFor(e.user_id, t.value);
                      return (
                        <td key={t.value} className="px-1 py-1 text-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setDrill({ engineerName: e.full_name || "Engineer", type: t.value, cert })}
                                  className={`mx-auto inline-flex h-7 w-7 items-center justify-center rounded transition ${status ? STATUS_BG[status] : "bg-muted/30 hover:bg-muted/60 text-muted-foreground"}`}
                                  aria-label={`${e.full_name} ${t.label} status`}
                                >
                                  <StatusIcon s={status} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p className="font-medium">{t.label}</p>
                                {cert ? (
                                  <p className="text-xs text-muted-foreground">
                                    {cert.title}{cert.expiry_date ? ` · exp ${format(new Date(cert.expiry_date), "dd MMM yyyy")}` : ""}
                                  </p>
                                ) : <p className="text-xs text-muted-foreground">No certification</p>}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Dialog open={!!drill} onOpenChange={(o) => { if (!o) setDrill(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{drill?.engineerName} — {certTypeLabel(drill?.type)}</DialogTitle>
            </DialogHeader>
            {drill?.cert ? (
              <div className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">Title:</span> <span className="font-medium">{drill.cert.title}</span></p>
                {drill.cert.issuing_body && <p><span className="text-muted-foreground">Issuing body:</span> {drill.cert.issuing_body}</p>}
                {drill.cert.certificate_number && <p><span className="text-muted-foreground">Number:</span> {drill.cert.certificate_number}</p>}
                {drill.cert.date_obtained && <p><span className="text-muted-foreground">Obtained:</span> {format(new Date(drill.cert.date_obtained), "dd MMM yyyy")}</p>}
                {drill.cert.expiry_date && <p><span className="text-muted-foreground">Expires:</span> {format(new Date(drill.cert.expiry_date), "dd MMM yyyy")}</p>}
                <Badge variant="outline" className="mt-2 capitalize">{getCertStatus(drill.cert.expiry_date).replace(/_/g, " ")}</Badge>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No certification on file for this skill.</p>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
