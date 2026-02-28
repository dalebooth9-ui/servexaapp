import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Download, ShieldCheck, User } from "lucide-react";
import { extractStoragePath } from "@/lib/fileUtils";
import { format } from "date-fns";

interface CertRow {
  id: string;
  file_url: string;
  file_name: string;
  engineer_id: string;
  created_at: string;
}

interface EngineerCertificatesProps {
  jobId: string;
  engineers?: { id: string; name: string }[];
}

export default function EngineerCertificates({ jobId, engineers = [] }: EngineerCertificatesProps) {
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const getEngineerName = (id: string) => engineers.find((e) => e.id === id)?.name || "Unknown";

  const parseCertTitle = (fileName: string) => {
    // Strip the "[Cert] " prefix and the trailing " — original_filename" part
    const withoutPrefix = fileName.replace(/^\[Cert\]\s*/, "");
    const separatorIdx = withoutPrefix.lastIndexOf(" — ");
    return separatorIdx > -1 ? withoutPrefix.slice(0, separatorIdx) : withoutPrefix;
  };

  useEffect(() => {
    const fetchCerts = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("submissions")
        .select("id, file_url, file_name, engineer_id, created_at")
        .eq("job_id", jobId)
        .eq("type", "document")
        .like("file_name", "[Cert]%")
        .order("created_at", { ascending: false });
      const rows = (data as CertRow[]) || [];
      setCerts(rows);

      if (rows.length > 0) {
        const urls: Record<string, string> = {};
        await Promise.all(
          rows.map(async (c) => {
            const path = extractStoragePath(c.file_url);
            if (!path) return;
            const { data: urlData } = await supabase.storage.from("submissions").createSignedUrl(path, 3600);
            if (urlData?.signedUrl) urls[c.id] = urlData.signedUrl;
          })
        );
        setSignedUrls(urls);
      }
      setLoading(false);
    };
    fetchCerts();
  }, [jobId]);

  if (loading) return <p className="py-6 text-center text-sm text-muted-foreground">Loading certificates…</p>;

  if (certs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
        <ShieldCheck className="h-8 w-8 opacity-30" />
        <p className="text-sm">No engineer certificates attached to this job yet.</p>
        <p className="text-xs">Use the 📎 button on an assigned engineer's badge to attach their documents.</p>
      </div>
    );
  }

  // Group by engineer
  const byEngineer = certs.reduce<Record<string, CertRow[]>>((acc, c) => {
    (acc[c.engineer_id] = acc[c.engineer_id] || []).push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(byEngineer).map(([engineerId, rows]) => (
        <div key={engineerId}>
          <div className="mb-2 flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">{getEngineerName(engineerId)}</span>
            <Badge variant="secondary" className="text-xs">{rows.length} document{rows.length !== 1 ? "s" : ""}</Badge>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Certificate</TableHead>
                    <TableHead className="hidden sm:table-cell">Attached</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((cert) => {
                    const signedUrl = signedUrls[cert.id];
                    return (
                      <TableRow key={cert.id}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <FileText className="h-4 w-4 shrink-0 text-destructive" />
                            <span className="text-sm font-medium">{parseCertTitle(cert.file_name)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                          {format(new Date(cert.created_at), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell>
                          {signedUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs"
                              onClick={() => {
                                const a = document.createElement("a");
                                a.href = signedUrl;
                                a.target = "_blank";
                                a.rel = "noopener noreferrer";
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                              }}
                            >
                              <Download className="h-3.5 w-3.5" /> View
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
