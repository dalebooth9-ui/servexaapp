import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Image, FileText, MapPin, MessageSquare } from "lucide-react";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const [jobRes, subsRes] = await Promise.all([
        supabase.from("jobs").select("*").eq("id", id!).single(),
        supabase.from("submissions").select("*, profiles!submissions_engineer_id_fkey(full_name)").eq("job_id", id!).order("created_at", { ascending: false }),
      ]);
      setJob(jobRes.data);
      setSubmissions(subsRes.data || []);
      setLoading(false);
    };
    if (id) fetch();
  }, [id]);

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;
  if (!job) return <div className="flex h-64 items-center justify-center text-muted-foreground">Job not found.</div>;

  const photos = submissions.filter((s) => s.type === "photo");
  const notes = submissions.filter((s) => s.type === "note");
  const documents = submissions.filter((s) => s.type === "document");
  const locations = submissions.filter((s) => s.type === "location");

  return (
    <div>
      <Link to="/jobs" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Jobs
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{job.name}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{job.reference_number}</span>
            {job.client && <> • {job.client}</>}
            {job.address && <> • {job.address}</>}
          </p>
        </div>
        <Badge variant="secondary" className={job.status === "active" ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}>
          {job.status}
        </Badge>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({submissions.length})</TabsTrigger>
          <TabsTrigger value="photos">Photos ({photos.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="locations">Locations ({locations.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <SubmissionList items={submissions} />
        </TabsContent>
        <TabsContent value="photos">
          <SubmissionList items={photos} />
        </TabsContent>
        <TabsContent value="notes">
          <SubmissionList items={notes} />
        </TabsContent>
        <TabsContent value="documents">
          <SubmissionList items={documents} />
        </TabsContent>
        <TabsContent value="locations">
          <SubmissionList items={locations} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SubmissionList({ items }: { items: any[] }) {
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const generateSignedUrls = async () => {
      const filesWithUrls = items.filter((s) => s.file_url);
      if (filesWithUrls.length === 0) return;

      const urls: Record<string, string> = {};
      await Promise.all(
        filesWithUrls.map(async (sub) => {
          // Extract the storage path from the file_url
          const path = extractStoragePath(sub.file_url);
          if (!path) return;
          const { data } = await supabase.storage
            .from("submissions")
            .createSignedUrl(path, 3600); // 1 hour expiry
          if (data?.signedUrl) {
            urls[sub.id] = data.signedUrl;
          }
        })
      );
      setSignedUrls(urls);
    };
    generateSignedUrls();
  }, [items]);

  if (items.length === 0) {
    return <p className="py-12 text-center text-muted-foreground">No submissions yet.</p>;
  }

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((sub) => {
        const resolvedUrl = signedUrls[sub.id] || undefined;
        return (
          <Card key={sub.id}>
            <CardContent className="p-4">
              {sub.type === "photo" && resolvedUrl && (
                <img src={resolvedUrl} alt={sub.file_name || "Photo"} className="mb-3 h-48 w-full rounded-md object-cover" />
              )}
              {sub.type === "document" && (
                <div className="mb-3 flex h-32 items-center justify-center rounded-md bg-muted">
                  <FileText className="h-10 w-10 text-muted-foreground" />
                </div>
              )}
              {sub.type === "location" && (
                <div className="mb-3 flex h-32 items-center justify-center rounded-md bg-muted">
                  <MapPin className="h-10 w-10 text-destructive" />
                  <span className="ml-2 text-xs text-muted-foreground">
                    {sub.latitude?.toFixed(4)}, {sub.longitude?.toFixed(4)}
                  </span>
                </div>
              )}
              {sub.type === "note" && (
                <div className="mb-3 rounded-md bg-muted p-3">
                  <MessageSquare className="mb-1 h-4 w-4 text-primary" />
                  <p className="text-sm">{sub.content}</p>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{new Date(sub.created_at).toLocaleString()}</span>
                {resolvedUrl && (
                  <a href={resolvedUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                    Download
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Extract the storage object path from a full public/signed URL or raw path */
function extractStoragePath(fileUrl: string): string | null {
  if (!fileUrl) return null;
  // Match /object/public/submissions/ or /object/sign/submissions/ patterns
  const match = fileUrl.match(/\/object\/(?:public|sign)\/submissions\/(.+?)(?:\?|$)/);
  if (match) return match[1];
  // If it's already just a path (no URL prefix), use it directly
  if (!fileUrl.startsWith("http")) return fileUrl;
  return null;
}
