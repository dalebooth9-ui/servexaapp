import { useState, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FolderOpen, Upload, FileText, Image, Loader2, Layers, FolderTree } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".webp", ".gif"];

type SubfolderEntry = {
  subfolderName: string;
  files: File[];
};

type FolderEntry = {
  customerName: string;
  files: File[]; // direct files
  subfolders: SubfolderEntry[];
};

type ImportMode = "one-per-customer" | "one-per-subfolder";

export type FolderImportDialogHandle = {
  processFiles: (files: FileList) => void;
};

interface FolderImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

const FolderImportDialog = forwardRef<FolderImportDialogHandle, FolderImportDialogProps>(({ open, onOpenChange, onImported }, ref) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [mode, setMode] = useState<ImportMode>("one-per-customer");
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
    const customerMap = new Map<string, { direct: File[]; subs: Map<string, File[]> }>();

    for (const file of Array.from(fileList)) {
      const path = (file as any).webkitRelativePath || file.name;
      const parts = path.split("/");

      if (parts.some((p: string) => p.startsWith("."))) continue;

      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) continue;

      if (parts.length >= 4) {
        // root / customer / subfolder / file (possibly deeper)
        const customerName = parts[1];
        const subfolderName = parts[2];
        if (!customerMap.has(customerName)) customerMap.set(customerName, { direct: [], subs: new Map() });
        const entry = customerMap.get(customerName)!;
        if (!entry.subs.has(subfolderName)) entry.subs.set(subfolderName, []);
        entry.subs.get(subfolderName)!.push(file);
      } else if (parts.length === 3) {
        // root / customer / file
        const customerName = parts[1];
        if (!customerMap.has(customerName)) customerMap.set(customerName, { direct: [], subs: new Map() });
        customerMap.get(customerName)!.direct.push(file);
      } else if (parts.length === 2) {
        // root / file
        const key = "__root__";
        if (!customerMap.has(key)) customerMap.set(key, { direct: [], subs: new Map() });
        customerMap.get(key)!.direct.push(file);
      }
    }

    const entries: FolderEntry[] = [];
    for (const [name, data] of customerMap.entries()) {
      const subfolders: SubfolderEntry[] = [];
      for (const [subName, files] of data.subs.entries()) {
        subfolders.push({ subfolderName: subName, files: files.sort((a, b) => a.name.localeCompare(b.name)) });
      }
      subfolders.sort((a, b) => a.subfolderName.localeCompare(b.subfolderName));

      entries.push({
        customerName: name === "__root__" ? "Unassigned" : name,
        files: data.direct.sort((a, b) => a.name.localeCompare(b.name)),
        subfolders,
      });
    }
    entries.sort((a, b) => {
      if (a.customerName === "Unassigned") return 1;
      if (b.customerName === "Unassigned") return -1;
      return a.customerName.localeCompare(b.customerName);
    });

    setFolders(entries);
  }, []);

  useImperativeHandle(ref, () => ({ processFiles }), [processFiles]);

  const uploadFiles = async (files: File[], jobId: string, userId: string, onProgress: () => void) => {
    for (const file of files) {
      setProgressText(`Uploading: ${file.name}`);
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

      if (file.size > 20 * 1024 * 1024) {
        toast({ title: "Skipped", description: `${file.name} exceeds 20MB limit.`, variant: "destructive" });
        onProgress();
        continue;
      }

      const filePath = `${jobId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("submissions").upload(filePath, file);

      if (uploadError) {
        toast({ title: "Upload failed", description: `Failed to upload ${file.name}.`, variant: "destructive" });
        onProgress();
        continue;
      }

      const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(filePath);
      const isImage = IMAGE_EXTENSIONS.includes(ext);

      await supabase.from("submissions").insert({
        job_id: jobId,
        engineer_id: userId,
        type: isImage ? "photo" : "document",
        file_url: urlData.publicUrl,
        file_name: file.name,
      });

      onProgress();
    }
  };

  const createJob = async (name: string, customerName: string | null, userId: string) => {
    const refNumber = `IMP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const { data: job, error } = await supabase
      .from("jobs")
      .insert({
        name,
        reference_number: refNumber,
        customer: customerName,
        created_by: userId,
      } as any)
      .select("id")
      .single();
    return { job, error };
  };

  const ensureCustomer = async (customerName: string) => {
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("name", customerName)
      .maybeSingle();
    if (!existing) {
      await supabase.from("customers").insert({ name: customerName });
    }
  };

  const handleImport = async () => {
    if (!user || folders.length === 0) return;
    setImporting(true);

    const totalFiles = folders.reduce((sum, f) => sum + f.files.length + f.subfolders.reduce((s, sf) => s + sf.files.length, 0), 0);
    let processed = 0;
    const onProgress = () => {
      processed++;
      setProgress(Math.round((processed / totalFiles) * 100));
    };

    try {
      for (const folder of folders) {
        const customerName = folder.customerName === "Unassigned" ? null : folder.customerName;

        if (customerName) {
          setProgressText(`Creating customer: ${customerName}`);
          await ensureCustomer(customerName);
        }

        if (mode === "one-per-customer") {
          // All files (direct + subfolders) go into one job
          const jobName = customerName ? `${customerName} Import` : "Folder Import";
          setProgressText(`Creating job: ${jobName}`);
          const { job, error } = await createJob(jobName, customerName, user.id);
          if (error || !job) {
            toast({ title: "Error", description: `Failed to create job for ${customerName || "folder"}.`, variant: "destructive" });
            continue;
          }

          const allFiles = [...folder.files, ...folder.subfolders.flatMap((sf) => sf.files)];
          await uploadFiles(allFiles, job.id, user.id, onProgress);
        } else {
          // One job per subfolder, plus one for direct files if any
          if (folder.files.length > 0) {
            const jobName = customerName ? `${customerName} — General` : "Folder Import";
            setProgressText(`Creating job: ${jobName}`);
            const { job, error } = await createJob(jobName, customerName, user.id);
            if (error || !job) {
              toast({ title: "Error", description: `Failed to create job.`, variant: "destructive" });
            } else {
              await uploadFiles(folder.files, job.id, user.id, onProgress);
            }
          }

          for (const sub of folder.subfolders) {
            const jobName = customerName ? `${customerName} — ${sub.subfolderName}` : sub.subfolderName;
            setProgressText(`Creating job: ${jobName}`);
            const { job, error } = await createJob(jobName, customerName, user.id);
            if (error || !job) {
              toast({ title: "Error", description: `Failed to create job for ${sub.subfolderName}.`, variant: "destructive" });
              sub.files.forEach(() => onProgress());
              continue;
            }
            await uploadFiles(sub.files, job.id, user.id, onProgress);
          }
        }
      }

      const jobCount = mode === "one-per-customer"
        ? folders.length
        : folders.reduce((sum, f) => sum + f.subfolders.length + (f.files.length > 0 ? 1 : 0), 0);

      toast({ title: "Import complete", description: `${jobCount} job(s) with ${totalFiles} file(s) imported.` });
      reset();
      onOpenChange(false);
      onImported();
    } catch (err: any) {
      toast({ title: "Import error", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const totalFiles = folders.reduce((sum, f) => sum + f.files.length + f.subfolders.reduce((s, sf) => s + sf.files.length, 0), 0);
  const hasSubfolders = folders.some((f) => f.subfolders.length > 0);

  const jobCount = mode === "one-per-customer"
    ? folders.length
    : folders.reduce((sum, f) => sum + f.subfolders.length + (f.files.length > 0 ? 1 : 0), 0);

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
          <>
            {hasSubfolders && (
              <div className="rounded-lg border bg-muted/30 p-3 mb-1">
                <p className="text-sm font-medium mb-2">Job grouping</p>
                <RadioGroup value={mode} onValueChange={(v) => setMode(v as ImportMode)} className="gap-3">
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="one-per-customer" id="mode-single" className="mt-0.5" />
                    <Label htmlFor="mode-single" className="cursor-pointer leading-tight">
                      <span className="flex items-center gap-1.5 font-medium text-sm">
                        <Layers className="h-3.5 w-3.5" /> One job per customer
                      </span>
                      <span className="text-xs text-muted-foreground">
                        All files from subfolders are grouped into a single job per customer ({folders.length} job{folders.length !== 1 ? "s" : ""})
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="one-per-subfolder" id="mode-multi" className="mt-0.5" />
                    <Label htmlFor="mode-multi" className="cursor-pointer leading-tight">
                      <span className="flex items-center gap-1.5 font-medium text-sm">
                        <FolderTree className="h-3.5 w-3.5" /> One job per subfolder
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Each subfolder creates a separate job under its customer ({jobCount} job{jobCount !== 1 ? "s" : ""})
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            <ScrollArea className="flex-1 max-h-[40vh]">
              <div className="space-y-3 pr-4">
                {folders.map((folder, i) => (
                  <div key={i} className="rounded-lg border bg-card p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <FolderOpen className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-sm">{folder.customerName}</span>
                      <Badge variant="secondary" className="text-xs">
                        {folder.files.length + folder.subfolders.reduce((s, sf) => s + sf.files.length, 0)} file(s)
                      </Badge>
                      {mode === "one-per-subfolder" && folder.subfolders.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {folder.subfolders.length + (folder.files.length > 0 ? 1 : 0)} job(s)
                        </Badge>
                      )}
                    </div>

                    {/* Direct files */}
                    {folder.files.length > 0 && (
                      <div className="space-y-1 ml-6 mb-2">
                        {mode === "one-per-subfolder" && folder.subfolders.length > 0 && (
                          <p className="text-xs font-medium text-muted-foreground">General files:</p>
                        )}
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
                    )}

                    {/* Subfolders */}
                    {folder.subfolders.map((sub, si) => (
                      <div key={si} className="ml-6 mb-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <FolderOpen className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs font-medium">{sub.subfolderName}</span>
                          <span className="text-xs text-muted-foreground">({sub.files.length})</span>
                        </div>
                        <div className="space-y-1 ml-5">
                          {sub.files.map((file, j) => (
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
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        {folders.length > 0 && !importing && (
          <DialogFooter className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {folders.length} customer(s) • {jobCount} job(s) • {totalFiles} file(s)
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
});

FolderImportDialog.displayName = "FolderImportDialog";

export default FolderImportDialog;
