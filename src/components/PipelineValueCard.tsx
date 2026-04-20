import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { PoundSterling, TrendingUp, FileText, AlertCircle, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

type DocRow = {
  id: string;
  job_id: string | null;
  invoice_number: string;
  customer_name: string | null;
  status: string;
  document_type: "invoice" | "quote";
  total: number | null;
  jobs?: { id: string; name: string; reference_number: string; category: string | null; status: string } | null;
};

type Bucket = {
  key: "active" | "accepted" | "pending" | "unpaid";
  label: string;
  description: string;
  total: number;
  items: DocRow[];
  tone: string;
  icon: typeof PoundSterling;
};

const fmt = (n: number) =>
  `£${n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function PipelineValueCard() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("invoices")
        .select(
          "id, job_id, invoice_number, customer_name, status, document_type, total, jobs(id, name, reference_number, category, status)",
        )
        .in("status", ["sent", "accepted", "overdue", "draft"]);
      setDocs((data as any) || []);
      setLoading(false);
    };
    load();
  }, []);

  const buckets = useMemo<Bucket[]>(() => {
    const isInstallJob = (d: DocRow) => {
      const cat = (d.jobs?.category || "").toLowerCase();
      return cat.includes("install");
    };
    const isJobActive = (d: DocRow) =>
      d.jobs && !["completed", "archived"].includes(d.jobs.status);

    const active = docs.filter(
      (d) =>
        d.document_type === "quote" &&
        d.status === "accepted" &&
        isInstallJob(d) &&
        isJobActive(d),
    );
    const accepted = docs.filter(
      (d) =>
        d.document_type === "quote" &&
        d.status === "accepted" &&
        (!isInstallJob(d) || !isJobActive(d)),
    );
    const pending = docs.filter(
      (d) => d.document_type === "quote" && d.status === "sent",
    );
    const unpaid = docs.filter(
      (d) =>
        d.document_type === "invoice" &&
        (d.status === "sent" || d.status === "overdue"),
    );

    const sum = (rows: DocRow[]) => rows.reduce((s, r) => s + Number(r.total || 0), 0);

    return [
      {
        key: "active",
        label: "Active Install Jobs",
        description: "Accepted quotes linked to install jobs in progress",
        total: sum(active),
        items: active,
        tone: "text-primary",
        icon: TrendingUp,
      },
      {
        key: "accepted",
        label: "Accepted (Other)",
        description: "Accepted quotes not yet invoiced or completed",
        total: sum(accepted),
        items: accepted,
        tone: "text-emerald-500",
        icon: ClipboardList,
      },
      {
        key: "pending",
        label: "Pending Quotes",
        description: "Quotes sent and awaiting customer decision",
        total: sum(pending),
        items: pending,
        tone: "text-amber-500",
        icon: FileText,
      },
      {
        key: "unpaid",
        label: "Unpaid Invoices",
        description: "Sent or overdue invoices awaiting payment",
        total: sum(unpaid),
        items: unpaid,
        tone: "text-destructive",
        icon: AlertCircle,
      },
    ];
  }, [docs]);

  const grandTotal = buckets.reduce((s, b) => s + b.total, 0);

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <PoundSterling className="h-5 w-5 text-primary" />
          Pipeline Value
          <Badge variant="secondary" className="ml-auto text-base font-bold">
            {loading ? "…" : fmt(grandTotal)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {buckets.map((b) => (
            <div
              key={b.key}
              className="rounded-lg border p-3 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-center gap-2">
                <div className={cn("rounded bg-muted p-1.5", b.tone)}>
                  <b.icon className="h-4 w-4" />
                </div>
                <p className="text-xs font-medium text-muted-foreground">{b.label}</p>
              </div>
              <p className="mt-2 text-xl font-bold">{fmt(b.total)}</p>
              <p className="text-xs text-muted-foreground">
                {b.items.length} {b.items.length === 1 ? "item" : "items"}
              </p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="active">
          <TabsList className="grid w-full grid-cols-4">
            {buckets.map((b) => (
              <TabsTrigger key={b.key} value={b.key} className="text-xs">
                {b.label.split(" ")[0]}
              </TabsTrigger>
            ))}
          </TabsList>
          {buckets.map((b) => (
            <TabsContent key={b.key} value={b.key} className="mt-3">
              <p className="mb-2 text-xs text-muted-foreground">{b.description}</p>
              {b.items.length === 0 ? (
                <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                  Nothing here right now.
                </p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {b.items.slice(0, 8).map((item) => (
                    <Link
                      key={item.id}
                      to={item.job_id ? `/jobs/${item.job_id}` : `/invoices/${item.id}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {item.jobs?.name || item.customer_name || item.invoice_number}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.jobs?.reference_number || item.invoice_number}
                          {item.customer_name ? ` • ${item.customer_name}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold">
                        {fmt(Number(item.total || 0))}
                      </span>
                    </Link>
                  ))}
                  {b.items.length > 8 && (
                    <div className="px-3 py-2 text-center text-xs text-muted-foreground">
                      + {b.items.length - 8} more
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
