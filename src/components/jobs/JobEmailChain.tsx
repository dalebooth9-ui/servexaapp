import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Mail, Paperclip } from "lucide-react";
import { format } from "date-fns";

interface JobEmail {
  id: string;
  direction: string;
  from_email: string | null;
  to_emails: string[] | null;
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
  body_html: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  eml_path: string | null;
  attachment_count: number;
  received_at: string;
}

interface Props {
  jobId: string;
  isAdmin?: boolean;
}

export default function JobEmailChain({ jobId, isAdmin }: Props) {
  const [emails, setEmails] = useState<JobEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("job_emails")
        .select("*")
        .eq("job_id", jobId)
        .order("received_at", { ascending: true });
      if (!active) return;
      setEmails(data || []);
      setLoading(false);
      // Clear unread flag on view (admin only — engineers just observe)
      if (isAdmin) {
        await (supabase as any)
          .from("jobs")
          .update({ has_unread_email: false, email_review_flag: false })
          .eq("id", jobId);
      }
    })();
    return () => {
      active = false;
    };
  }, [jobId, isAdmin]);

  if (loading) {
    return <div className="h-16 animate-pulse rounded bg-muted/40" aria-hidden />;
  }

  if (emails.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <Mail className="mx-auto mb-2 h-6 w-6 opacity-50" />
          No emails on this job yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4" /> Emails ({emails.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {emails.map((e) => {
          const open = !!expanded[e.id];
          return (
            <div key={e.id} className="rounded-lg border">
              <button
                type="button"
                onClick={() =>
                  setExpanded((s) => ({ ...s, [e.id]: !s[e.id] }))
                }
                className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-muted/40"
              >
                {open ? (
                  <ChevronDown className="mt-1 h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium truncate">
                      {e.from_email || "Unknown sender"}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {e.direction}
                    </Badge>
                    {e.attachment_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Paperclip className="h-3 w-3" /> {e.attachment_count}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(e.received_at), "d MMM yyyy HH:mm")}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-sm">
                    {e.subject || "(no subject)"}
                  </div>
                  {!open && e.snippet && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {e.snippet}
                    </div>
                  )}
                </div>
              </button>
              {open && (
                <div className="border-t bg-muted/20 px-3 py-3 text-sm">
                  {e.to_emails && e.to_emails.length > 0 && (
                    <div className="mb-2 text-xs text-muted-foreground">
                      To: {e.to_emails.join(", ")}
                    </div>
                  )}
                  {e.body_html ? (
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: e.body_html }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm">
                      {e.body_text || "(empty body)"}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
