import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderOpen, Upload, FileText, Image, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".webp", ".gif"];

type FolderEntry = {
  customerName: string;
  files: File[];
};

interface CustomerFolderDropProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export default function CustomerFolderDrop({ open, onOpenChange, onImported }: CustomerFolderDropProps) {
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
    const customerMap = new Map<string, File[]>();

    for (const file of Array.from(fileList)) {
      const path = (file as any).webkitRelativePath || file.name;
      const parts = path.split("/");

      if (parts.some((p: string) => p.startsWith("."))) continue;

      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) continue;
      if (file.size > 20 * 1024 * 1024) continue;

      // parts[0] is the root folder selected, parts[1] would be a customer subfolder
      // If structure is root/customer/files or root/customer/subfolder/files
      // Each top-level subfolder = a customer, all files underneath are flat
      if (parts.length >= 3) {
        const customerName = parts[1];
        if (!customerMap.has(customerName)) customerMap.set(customerName, []);
        customerMap.get(customerName)!.push(file);
      } else if (parts.length === 2) {
        // Files directly in root folder — use root folder name
        const rootName = parts[0];
        if (!customerMap.has(rootName)) customerMap.set(rootName, []);
        customerMap.get(rootName)!.push(file);
      }
    }

    const entries: FolderEntry[] = [];
    for (const [name, files] of customerMap.entries()) {
      entries.push({
        customerName: name,
        files: files.sort((a, b) => a.name.localeCompare(b.name)),
      });
    }
    entries.sort((a, b) => a.customerName.localeCompare(b.customerName));
    setFolders(entries);
  }, []);

  const handleImport = async () => {
    if (!user || folders.length === 0) return;
    setImporting(true);

    const totalFiles = folders.reduce((sum, f) => sum + f.files.length, 0);
    let processed = 0;

    try {
      for (const folder of folders) {
        setProgressText(`Creating customer: ${folder.customerName}`);

        // Ensure customer exists and get its id
        const { data: existing } = await supabase
          .from("customers")
          .select("id")
          .eq("name", folder.customerName)
          .maybeSingle();

        let customerId: string;
        if (existing) {
          customerId = existing.id;
        } else {
          const { data: newCust, error: custErr } = await supabase
            .from("customers")
            .insert({ name: folder.customerName })
            .select("id")
            .single();
          if (custErr || !newCust) {
            toast({ title: "Error", description: `Failed to create customer ${folder.customerName}.`, variant: "destructive" });
            processed += folder.files.length;
            setProgress(Math.round((processed / totalFiles) * 100));
            continue;
          }
          customerId = newCust.id;
        }

        // Upload files as customer documents
        for (const file of folder.files) {
          setProgressText(`Uploading: ${file.name}`);
          const filePath = `customer-docs/${customerId}/${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage.from("submissions").upload(filePath, file);

          if (uploadError) {
            toast({ title: "Upload failed", description: `Failed to upload ${file.name}.`, variant: "destructive" });
          } else {
            const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(filePath);
            await supabase.from("customer_documents").insert({
              customer_id: customerId,
              file_name: file.name,
              file_url: urlData.publicUrl,
              file_size: file.size,
              uploaded_by: user.id,
            } as any);
          }
          processed++;
          setProgress(Math.round((processed / totalFiles) * 100));
        }
      }

      toast({ title: "Import complete", description: `${folders.length} customer(s) with ${totalFiles} file(s) imported.` });
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
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Customers from Folder</DialogTitle>
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
                Each subfolder becomes a customer, files inside become customer documents
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supported: PDF, Word, Excel, JPG, PNG, WEBP, GIF • Max 20MB per file
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              // @ts-ignore
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) processFiles(e.target.files);
              }}
            />
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Choose Folder
            </Button>
          </div>
        ) : (
          <ScrollArea className="flex-1 max-h-[40vh]">
            <div className="space-y-3 pr-4">
              {folders.map((folder, i) => (
                <div key={i} className="rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FolderOpen className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm">{folder.customerName}</span>
                    <Badge variant="secondary" className="text-xs">
                      {folder.files.length} file(s)
                    </Badge>
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
