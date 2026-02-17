import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FolderOpen, Upload, FileText, Image, Loader2, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".webp", ".gif"];

type FolderEntry = {
  customerName: string;
  files: File[];
};

interface FolderImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export default function FolderImportDialog({ open, onOpenChange, onImported }: FolderImportDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFolders([]);
    setProgress(0);
    setProgressText("");
  };

  const processFiles = useCallback((fileList: FileList) => {
    const map = new Map<string, File[]>();

    for (const file of Array.from(fileList)) {
      const path = (file as any).webkitRelativePath || file.name;
      const parts = path.split("/");

      // Skip hidden files/folders
      if (parts.some((p: string) => p.startsWith("."))) continue;

      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) continue;

      // parts[0] is root folder, parts[1] is subfolder (customer)
      if (parts.length >= 3) {
        const customerName = parts[1];
        if (!map.has(customerName)) map.set(customerName, []);
        map.get(customerName)!.push(file);
      } else if (parts.length === 2) {
        // Files directly in root folder go to "Unassigned"
        const key = "__root__";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(file);
      }
    }

    const entries: FolderEntry[] = [];
    for (const [name, files] of map.entries()) {
      entries.push({
        customerName: name === "__root__" ? "Unassigned" : name,
        files: files.sort((a, b) => a.name.localeCompare(b.name)),
      });
    }
    entries.sort((a, b) => {
      if (a.customerName === "Unassigned") return 1;
      if (b.customerName === "Unassigned") return -1;
      return a.customerName.localeCompare(b.customerName);
    });

    setFolders(entries);
  }, []);

  const handleImport = async () => {
    if (!user || folders.length === 0) return;
    setImporting(true);

    const totalFiles = folders.reduce((sum, f) => sum + f.files.length, 0);
    let processed = 0;

    try {
      for (const folder of folders) {
        const customerName = folder.customerName === "Unassigned" ? null : folder.customerName;

        // Create customer if it doesn't exist
        if (customerName) {
          setProgressText(`Creating customer: ${customerName}`);
          const { data: existing } = await supabase
            .from("customers")
            .select("id")
            .eq("name", customerName)
            .maybeSingle();

          if (!existing) {
            await supabase.from("customers").insert({ name: customerName });
          }
        }

        // Create a job for this folder
        const refNumber = `IMP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
        setProgressText(`Creating job for: ${customerName || "Unassigned"}`);

        const { data: job, error: jobError } = await supabase
          .from("jobs")
          .insert({
            name: customerName ? `${customerName} Import` : "Folder Import",
            reference_number: refNumber,
            customer: customerName,
            created_by: user.id,
          } as any)
          .select("id")
          .single();

        if (jobError || !job) {
          toast({ title: "Error", description: `Failed to create job for ${customerName || "folder"}.`, variant: "destructive" });
          continue;
        }

        // Upload files as submissions
        for (const file of folder.files) {
          setProgressText(`Uploading: ${file.name}`);
          const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

          if (file.size > 20 * 1024 * 1024) {
            toast({ title: "Skipped", description: `${file.name} exceeds 20MB limit.`, variant: "destructive" });
            processed++;
            setProgress(Math.round((processed / totalFiles) * 100));
            continue;
          }

          const filePath = `${job.id}/${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage.from("submissions").upload(filePath, file);

          if (uploadError) {
            toast({ title: "Upload failed", description: `Failed to upload ${file.name}.`, variant: "destructive" });
            processed++;
            setProgress(Math.round((processed / totalFiles) * 100));
            continue;
          }

          const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(filePath);
          const isImage = IMAGE_EXTENSIONS.includes(ext);

          await supabase.from("submissions").insert({
            job_id: job.id,
            engineer_id: user.id,
            type: isImage ? "photo" : "document",
            file_url: urlData.publicUrl,
            file_name: file.name,
          });

          processed++;
          setProgress(Math.round((processed / totalFiles) * 100));
        }
      }

      toast({ title: "Import complete", description: `${folders.length} customer folder(s) with ${totalFiles} file(s) imported.` });
      reset();
      onOpenChange(false);
      onImported();
    } catch (err: any) {
      toast({ title: "Import error", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const totalFiles = folders.reduce((sum, f) => sum + f.files.length, 0);

  const getFileIcon = (name: string) => {
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext)
      ? <Image className="h-3.5 w-3.5 text-muted-foreground" />
      : <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Folder Structure</DialogTitle>
        </DialogHeader>

        {importing ? (
          <div className="flex flex-col items-center justify-center gap-4 p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="w-full max-w-sm space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">{progressText}</p>
              <p className="text-xs text-muted-foreground text-center">{progress}%</p>
            </div>
          </div>
        ) : folders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-muted-foreground/30 p-12 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Select a folder to import</p>
              <p className="text-sm text-muted-foreground mt-1">
                Each subfolder becomes a customer, files inside become job submissions
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supported: PDF, Word, Excel, JPG, PNG, WEBP, GIF
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              // @ts-ignore - webkitdirectory is a non-standard attribute
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  processFiles(e.target.files);
                }
              }}
            />
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Choose Folder
            </Button>
          </div>
        ) : (
          <ScrollArea className="flex-1 max-h-[50vh]">
            <div className="space-y-3 pr-4">
              {folders.map((folder, i) => (
                <div key={i} className="rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FolderOpen className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm">{folder.customerName}</span>
                    <Badge variant="secondary" className="text-xs">{folder.files.length} file(s)</Badge>
                  </div>
                  <div className="space-y-1 ml-6">
                    {folder.files.map((file, j) => (
                      <div key={j} className="flex items-center gap-2 text-xs text-muted-foreground">
                        {getFileIcon(file.name)}
                        <span className="truncate">{file.name}</span>
                        <span className="text-muted-foreground/60 ml-auto shrink-0">
                          {(file.size / 1024).toFixed(0)} KB
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {folders.length > 0 && !importing && (
          <DialogFooter className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {folders.length} customer(s) • {totalFiles} file(s)
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>Clear</Button>
              <Button onClick={handleImport}>
                <Upload className="mr-2 h-4 w-4" /> Import All
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
