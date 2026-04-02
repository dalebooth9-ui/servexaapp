import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ClipboardList, Search, Plus, CheckCircle2, XCircle, Clock, Send, ArrowRight, TrendingUp, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import CreateInvoiceDialog from "@/components/CreateInvoiceDialog";
import { toast } from "sonner";

const PIPELINE_STAGES = [
  { key: "draft", label: "Draft", icon: Clock, color: "text-muted-foreground", bg: "bg-muted/40" },
  { key: "sent", label: "Sent", icon: Send, color: "text-primary", bg: "bg-primary/5" },
  { key: "accepted", label: "Accepted", icon: CheckCircle2, color: "text-accent", bg: "bg-accent/5" },
  { key: "declined", label: "Declined", icon: XCircle, color: "text-destructive", bg: "bg-destructive/5" },
] as const;

export default function Quotes() {
  const { userRole } = useAuth();
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchQuotes = async () => {
    const { data } = await supabase
      .from("invoices")
      .select("*")
      .eq("document_type", "quote")
      .order("created_at", { ascending: false });
    setQuotes(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchQuotes(); }, []);

  const filtered = quotes.filter((q) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return q.invoice_number?.toLowerCase().includes(s) || q.customer_name?.toLowerCase().includes(s);
  });

  const byStage = (stage: string) => filtered.filter((q) => q.status === stage);

  const totalValue = quotes.reduce((s, q) => s + Number(q.total), 0);
  const acceptedValue = quotes.filter((q) => q.status === "accepted").reduce((s, q) => s + Number(q.total), 0);
  const sentCount = quotes.filter((q) => q.status === "sent").length;
  const winRate = quotes.filter((q) => ["accepted", "declined"].includes(q.status)).length > 0
    ? Math.round((quotes.filter((q) => q.status === "accepted").length / quotes.filter((q) => ["accepted", "declined"].includes(q.status)).length) * 100)
    : null;

  const handleStatusChange = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    const { error } = await supabase.from("invoices").update({ status: newStatus } as any).eq("id", id);
    if (error) {
      toast.error("Failed to update status");
    } else {
      setQuotes((prev) => prev.map((q) => q.id === id ? { ...q, status: newStatus } : q));
    }
    setUpdatingId(null);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("invoice_line_items").delete().eq("invoice_id", id);
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) { toast.error("Failed to delete quote"); return; }
    setQuotes((prev) => prev.filter((q) => q.id !== id));
    toast.success("Quote deleted");
  };

  const handleConvertToInvoice = async (quote: any) => {
    setUpdatingId(quote.id);
    try {
      // Fetch line items
      const { data: lineItems } = await supabase
        .from("invoice_line_items")
        .select("*")
        .eq("invoice_id", quote.id)
        .order("sort_order");

      const { data: newInv, error: invErr } = await supabase
        .from("invoices")
        .insert({
          job_id: quote.job_id,
          customer_name: quote.customer_name,
          customer_email: quote.customer_email,
          customer_address: quote.customer_address,
          due_date: quote.due_date,
          notes: quote.notes,
          subtotal: quote.subtotal,
          tax_rate: quote.tax_rate,
          tax_amount: quote.tax_amount,
          total: quote.total,
          created_by: quote.created_by,
          invoice_number: "",
          document_type: "invoice",
        } as any)
        .select()
        .single();

      if (invErr) throw invErr;

      if (lineItems && lineItems.length > 0) {
        await supabase.from("invoice_line_items").insert(
          lineItems.map((it: any, idx: number) => ({
            invoice_id: newInv.id,
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            amount: it.amount,
            sort_order: idx,
          })) as any
        );
      }

      await supabase.from("invoices").update({ status: "accepted" } as any).eq("id", quote.id);
      toast.success(`Converted to invoice ${newInv.invoice_number}`);
      navigate(`/invoices/${newInv.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to convert");
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Sales Quotes
          </h1>
          <p className="text-sm text-muted-foreground">Build quotes, send for approval, convert to invoices</p>
        </div>
        {userRole === "admin" && (
          <CreateInvoiceDialog
            documentType="quote"
            trigger={
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> New Quote
              </Button>
            }
          />
        )}
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Total Pipeline</p>
            <p className="text-xl font-bold">£{totalValue.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
            <p className="text-xs text-muted-foreground">{quotes.length} quote{quotes.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Awaiting Response</p>
            <p className="text-xl font-bold">{sentCount}</p>
            <p className="text-xs text-muted-foreground">sent to customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Won Value</p>
            <p className="text-xl font-bold text-accent">£{acceptedValue.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
            <p className="text-xs text-muted-foreground">{quotes.filter((q) => q.status === "accepted").length} accepted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Win Rate</p>
            <p className="text-xl font-bold flex items-center gap-1">
              {winRate !== null ? `${winRate}%` : "—"}
              {winRate !== null && winRate >= 50 && <TrendingUp className="h-4 w-4 text-accent" />}
            </p>
            <p className="text-xs text-muted-foreground">accepted vs declined</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="mb-5 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search quotes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Pipeline columns */}
      <div className="grid gap-4 md:grid-cols-4">
        {PIPELINE_STAGES.map(({ key, label, icon: Icon, color, bg }) => {
          const stageQuotes = byStage(key);
          const stageTotal = stageQuotes.reduce((s, q) => s + Number(q.total), 0);
          return (
            <div key={key} className="flex flex-col gap-3">
              {/* Column header */}
              <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${bg}`}>
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${color}`} />
                  <span className={`text-sm font-semibold ${color}`}>{label}</span>
                </div>
                <div className="text-right">
                  <Badge variant="secondary" className="text-xs">{stageQuotes.length}</Badge>
                  {stageTotal > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">£{stageTotal.toLocaleString("en-GB", { minimumFractionDigits: 0 })}</p>
                  )}
                </div>
              </div>

              {/* Quote cards */}
              <div className="flex flex-col gap-2">
                {stageQuotes.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    No {label.toLowerCase()} quotes
                  </div>
                ) : (
                  stageQuotes.map((q) => (
                    <Card key={q.id} className="hover:shadow-md transition-shadow cursor-pointer group">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <Link
                            to={`/invoices/${q.id}`}
                            className="font-mono text-xs font-semibold text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {q.invoice_number}
                          </Link>
                          <span className="text-xs font-bold text-foreground">
                            £{Number(q.total).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <p className="text-xs font-medium truncate mb-1">{q.customer_name}</p>
                        <p className="text-[11px] text-muted-foreground mb-2">
                          {format(new Date(q.created_at), "dd MMM yyyy")}
                          {q.due_date && ` · Valid to ${format(new Date(q.due_date), "dd MMM")}`}
                        </p>

                        {/* Action buttons per stage */}
                        {userRole === "admin" && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {key === "draft" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[11px] px-2 gap-1"
                                disabled={updatingId === q.id}
                                onClick={() => navigate(`/invoices/${q.id}`)}
                              >
                                <Send className="h-3 w-3" /> Open & Send
                              </Button>
                            )}
                            {key === "sent" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[11px] px-2 gap-1 text-accent border-accent/30 hover:bg-accent/10"
                                  disabled={updatingId === q.id}
                                  onClick={() => handleStatusChange(q.id, "accepted")}
                                >
                                  <CheckCircle2 className="h-3 w-3" /> Accept
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[11px] px-2 gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                                  disabled={updatingId === q.id}
                                  onClick={() => handleStatusChange(q.id, "declined")}
                                >
                                  <XCircle className="h-3 w-3" /> Decline
                                </Button>
                              </>
                            )}
                            {key === "accepted" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[11px] px-2 gap-1 text-primary border-primary/30 hover:bg-primary/10"
                                disabled={updatingId === q.id}
                                onClick={() => handleConvertToInvoice(q)}
                              >
                                <ArrowRight className="h-3 w-3" /> Convert to Invoice
                              </Button>
                            )}
                            {key === "declined" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[11px] px-2 gap-1"
                                disabled={updatingId === q.id}
                                onClick={() => handleStatusChange(q.id, "draft")}
                              >
                                Reopen
                              </Button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[11px] px-2 gap-1 text-destructive hover:bg-destructive/10 ml-auto"
                                  disabled={updatingId === q.id}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete {q.invoice_number}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete this quote and all its line items. This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => handleDelete(q.id)}
                                  >
                                    Delete Quote
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
