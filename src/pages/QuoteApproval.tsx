import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, FileText } from "lucide-react";

export default function QuoteApproval() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quoteInfo, setQuoteInfo] = useState<any>(null);
  const [alreadyResponded, setAlreadyResponded] = useState(false);
  const [responseStatus, setResponseStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const baseUrl = `https://${projectId}.supabase.co/functions/v1/quote-approval`;

  useEffect(() => {
    if (!token) { setError("No approval token provided."); setLoading(false); return; }
    fetch(`${baseUrl}?token=${token}`)
      .then(async res => {
        const data = await res.json();
        if (res.status === 409) { setAlreadyResponded(true); setResponseStatus(data.status || "responded"); }
        else if (!res.ok) { setError(data.error || "Invalid link"); }
        else { setQuoteInfo(data.quote); }
        setLoading(false);
      })
      .catch(() => { setError("Failed to load quote details."); setLoading(false); });
  }, [token]);

  const handleRespond = async (decision: "accepted" | "declined") => {
    setSubmitting(true);
    try {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, decision, notes: notes.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit");
      setSuccess(true);
      setResponseStatus(decision);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground max-w-sm text-center">{error}</p>
      </div>
    );
  }

  if (alreadyResponded || success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6">
        {responseStatus === "accepted" ? (
          <CheckCircle2 className="h-12 w-12 text-green-500" />
        ) : (
          <XCircle className="h-12 w-12 text-red-400" />
        )}
        <h1 className="text-xl font-semibold capitalize">Quote {responseStatus}</h1>
        <p className="text-muted-foreground max-w-sm text-center">
          {responseStatus === "accepted"
            ? "Thank you for accepting. We'll be in touch to schedule the work."
            : "The quote has been declined. Please contact us if you change your mind."}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-primary" />
          <CardTitle>Quote Approval</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Please review and respond to the following quote.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Reference</span>
              <span className="text-sm font-mono font-medium">{quoteInfo?.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Customer</span>
              <span className="text-sm font-medium">{quoteInfo?.customer_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-sm font-bold">£{Number(quoteInfo?.total || 0).toFixed(2)}</span>
            </div>
            {quoteInfo?.notes && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">{quoteInfo.notes}</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Comments (optional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any comments or questions..." rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => handleRespond("declined")} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
              Decline
            </Button>
            <Button onClick={() => handleRespond("accepted")} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Accept Quote
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
