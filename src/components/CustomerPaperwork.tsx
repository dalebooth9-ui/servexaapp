import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { FileText, Image, Upload, Trash2, Download, Loader2, ClipboardList, Pencil, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif"];

export type CustomerPaperworkItem = {
  id: string;
  customer_id: string;
  label: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  auto_attach: boolean;
  uploaded_by: string;
  created_at: string;
};

interface Props {
  customerId: string;
}

export default function CustomerPaperwork({ customerId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<CustomerPaperworkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  // Inline label editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from("customer_paperwork" as any)
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    setItems(((data as unknown) as CustomerPaperworkItem[]) || []);
    setLoading(false);
  }, [customerId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleUpload = async (files: FileList | File[]) => {
    if (!user) return;
    const validFiles = Array.from(files).filter((f) => {
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      return ALLOWED_EXTENSIONS.includes(ext) && f.size <= 20 * 1024 * 1024;
    });
    if (validFiles.length === 0) {
      toast({ title: "Invalid file", description: "Only PDF and image files under 20MB are accepted.", variant: "destructive" });
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    let processed = 0;
    for (const file of validFiles) {
      const path = `${customerId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("customer-paperwork").upload(path, file);
      if (!upErr) {
        await supabase.from("customer_paperwork" as any).insert({
          customer_id: customerId,
          label: file.name.replace(/\.[^.]+$/, ""),
          file_name: file.name,
          file_url: path,
          file_size: file.size,
          auto_attach: true,
          uploaded_by: user.id,
        });
      } else {
        toast({ title: "Upload failed", description: file.name, variant: "destructive" });
      }
      processed++;
      setUploadProgress(Math.round((processed / validFiles.length) * 100));
    }
    setUploading(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await fetchItems();
    toast({ title: "Uploaded", description: `${validFiles.length} file(s) added to customer paperwork.` });
  };

  const handleDelete = async (item: CustomerPaperworkItem) => {
    await supabase.storage.from("customer-paperwork").remove([item.file_url]);
    await supabase.from("customer_paperwork" as any).delete().eq("id", item.id);
    toast({ title: "Deleted", description: `${item.file_name} removed.` });
    await fetchItems();
  };

  const handleDownload = async (item: CustomerPaperworkItem) => {
    const { data } = await supabase.storage.from("customer-paperwork").createSignedUrl(item.file_url, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const toggleAutoAttach = async (item: CustomerPaperworkItem) => {
    await supabase.from("customer_paperwork" as any).update({ auto_attach: !item.auto_attach }).eq("id", item.id);
    await fetchItems();
  };

  const startEdit = (item: CustomerPaperworkItem) => {
    setEditingId(item.id);
    setEditLabel(item.label);
  };

  const saveLabel = async (id: string) => {
    await supabase.from("customer_paperwork" as any).update({ label: editLabel.trim() || items.find(i => i.id === id)?.file_name || "" }).eq("id", id);
    setEditingId(null);
    await fetchItems();
  };

  const getIcon = (name: string) => {
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext)
      ? <Image className="h-4 w-4 text-muted-foreground shrink-0" />
      : <FileText className="h-4 w-4 text-muted-foreground shrink-0" />;
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div
      className="mb-8"
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; setDragging(true); }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current === 0) setDragging(false); }}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation(); dragCounter.current = 0; setDragging(false);
        if (e.dataTransfer.files?.length > 0) handleUpload(e.dataTransfer.files);
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Customer Paperwork</h2>
          {items.length > 0 && (
            <Badge variant="secondary">{items.filter(i => i.auto_attach).length} auto-attach</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) handleUpload(e.target.files); }}
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload Paperwork
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-3">
        Upload this customer's own job sheets or forms (PDF/image). Files marked <strong>auto-attach</strong> will be added automatically to every new job created for this customer.
      </p>

      {uploading && (
        <div className="mb-4">
          <Progress value={uploadProgress} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">{uploadProgress}%</p>
        </div>
      )}

      {dragging && !uploading && (
        <div className="mb-4 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-primary/5 p-8 text-center transition-colors">
          <Upload className="h-6 w-6 text-primary" />
          <p className="font-medium text-primary">Drop paperwork here to upload</p>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground text-sm">
              No customer paperwork uploaded yet. Drag &amp; drop or click <strong>Upload Paperwork</strong> to add their forms.
            </p>
          ) : (
            <div className="divide-y">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  {getIcon(item.file_name)}

                  <div className="flex-1 min-w-0">
                    {editingId === item.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className="h-7 text-sm py-0"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter") saveLabel(item.id); if (e.key === "Escape") setEditingId(null); }}
                        />
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => saveLabel(item.id)}>
                          <Check className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditingId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-medium truncate">{item.label || item.file_name}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100" onClick={() => startEdit(item)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground truncate">
                      {item.file_name}{item.file_size ? ` · ${formatSize(item.file_size)}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex items-center gap-1.5 mr-2">
                      <Switch
                        checked={item.auto_attach}
                        onCheckedChange={() => toggleAutoAttach(item)}
                        id={`auto-${item.id}`}
                      />
                      <Label htmlFor={`auto-${item.id}`} className="text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap">
                        Auto-attach
                      </Label>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(item)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete paperwork?</AlertDialogTitle>
                          <AlertDialogDescription>"{item.label || item.file_name}" will be permanently deleted.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleDelete(item)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
