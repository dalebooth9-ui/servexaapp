import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Image, FileText, MapPin, MessageSquare, Download, Eye, X, FileSpreadsheet, File, Trash2, ArrowUpDown, SortAsc, RefreshCw, Pencil, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PhotoLightbox from "@/components/PhotoLightbox";
import SubmissionComments from "@/components/SubmissionComments";
import {
  getFileExtension,
  extractStoragePath,
  canPreviewInBrowser,
  getOfficeViewerUrl,
  ALLOWED_EXTENSIONS,
  IMAGE_EXTENSIONS,
  isImageFile,
} from "@/lib/fileUtils";

function getDocIcon(fileName: string) {
  const ext = getFileExtension(fileName);
  if (ext === ".pdf") return <FileText className="h-10 w-10 text-red-500" />;
  if ([".xls", ".xlsx"].includes(ext)) return <FileSpreadsheet className="h-10 w-10 text-green-600" />;
  if ([".doc", ".docx"].includes(ext)) return <File className="h-10 w-10 text-blue-600" />;
  return <FileText className="h-10 w-10 text-muted-foreground" />;
}

interface SubmissionListProps {
  items: any[];
  isAdmin: boolean;
  onDelete: (sub: any) => Promise<void>;
  currentUserId?: string;
  onUpdate?: () => void;
  engineers?: { id: string; name: string }[];
}

export default function SubmissionList({ items, isAdmin, onDelete, currentUserId, onUpdate, engineers = [] }: SubmissionListProps) {
  const getEngineerName = (engineerId: string) => {
    const eng = engineers.find((e) => e.id === engineerId);
    return eng?.name || "Unknown";
  };
  const { toast } = useToast();
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [previewSub, setPreviewSub] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "name">("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [replacingSub, setReplacingSub] = useState<any>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const generateSignedUrls = async () => {
      const filesWithUrls = items.filter((s) => s.file_url);
      if (filesWithUrls.length === 0) return;
      const urls: Record<string, string> = {};
      await Promise.all(
        filesWithUrls.map(async (sub) => {
          const path = extractStoragePath(sub.file_url);
          if (!path) return;
          const { data } = await supabase.storage.from("submissions").createSignedUrl(path, 3600);
          if (data?.signedUrl) urls[sub.id] = data.signedUrl;
        })
      );
      setSignedUrls(urls);
    };
    generateSignedUrls();
  }, [items]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [items]);

  if (items.length === 0) {
    return <p className="py-12 text-center text-muted-foreground">No submissions match the current filters.</p>;
  }

  const sortedItems = [...items].sort((a, b) => {
    if (sortBy === "name") {
      const nameA = (a.file_name || a.content || "").toLowerCase();
      const nameB = (b.file_name || b.content || "").toLowerCase();
      return sortAsc ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    }
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return sortAsc ? dateA - dateB : dateB - dateA;
  });

  const selectableItems = items.filter((s) => s.file_url);
  const allSelected = selectableItems.length > 0 && selectableItems.every((s) => selectedIds.has(s.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(selectableItems.map((s) => s.id)));
  };

  const handleBulkSelectedDownload = async () => {
    const selected = items.filter((s) => selectedIds.has(s.id) && s.file_url);
    if (selected.length === 0) return;
    setBulkDownloading(true);
    for (const sub of selected) {
      const url = signedUrls[sub.id];
      if (url) {
        const link = document.createElement("a");
        link.href = url;
        link.download = sub.file_name || "download";
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    setBulkDownloading(false);
    toast({ title: "Downloads started", description: `${selected.length} file(s) downloading.` });
  };

  const handleReplaceSubmission = async (file: File) => {
    if (!replacingSub) return;
    const ext = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext) || file.size > 20 * 1024 * 1024) {
      toast({ title: "Invalid file", description: "Only supported file types under 20MB are accepted.", variant: "destructive" });
      setReplacingSub(null);
      return;
    }

    if (replacingSub.file_url) {
      const oldPath = extractStoragePath(replacingSub.file_url);
      if (oldPath) await supabase.storage.from("submissions").remove([oldPath]);
    }

    const jobId = replacingSub.job_id;
    const newPath = `${jobId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("submissions").upload(newPath, file);
    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setReplacingSub(null);
      return;
    }

    const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(newPath);

    await supabase.from("submissions").update({
      file_url: urlData.publicUrl,
      file_name: file.name,
      type: isImageFile(file.name) ? "photo" : "document",
    }).eq("id", replacingSub.id);

    toast({ title: "File replaced", description: `${replacingSub.file_name} → ${file.name}` });
    setReplacingSub(null);
    if (replaceInputRef.current) replaceInputRef.current.value = "";
    const { data } = await supabase.storage.from("submissions").createSignedUrl(newPath, 3600);
    if (data?.signedUrl) {
      setSignedUrls((prev) => ({ ...prev, [replacingSub.id]: data.signedUrl }));
    }
  };

  const previewUrl = previewSub ? signedUrls[previewSub.id] : null;
  const previewFileName = previewSub?.file_name || "";

  const photoItems = items.filter((s) => s.type === "photo" && signedUrls[s.id]);
  const lightboxPhotos = photoItems.map((s) => ({
    id: s.id,
    url: signedUrls[s.id],
    fileName: s.file_name,
    date: s.created_at,
  }));

  const openLightbox = (subId: string) => {
    const idx = photoItems.findIndex((s) => s.id === subId);
    if (idx >= 0) {
      setLightboxIndex(idx);
      setLightboxOpen(true);
    }
  };

  const handleSort = (field: "date" | "name") => {
    if (sortBy === field) setSortAsc(!sortAsc);
    else { setSortBy(field); setSortAsc(field === "name"); }
  };

  const getTypeIcon = (sub: any) => {
    if (sub.type === "photo") return <Image className="h-4 w-4 text-muted-foreground" />;
    if (sub.type === "document" && sub.file_name) {
      const ext = getFileExtension(sub.file_name);
      if (ext === ".pdf") return <FileText className="h-4 w-4 text-destructive" />;
      if ([".xls", ".xlsx"].includes(ext)) return <FileSpreadsheet className="h-4 w-4 text-accent" />;
      if ([".doc", ".docx"].includes(ext)) return <File className="h-4 w-4 text-primary" />;
    }
    if (sub.type === "location") return <MapPin className="h-4 w-4 text-destructive" />;
    if (sub.type === "note") return <MessageSquare className="h-4 w-4 text-primary" />;
    return <FileText className="h-4 w-4 text-muted-foreground" />;
  };

  const getDisplayName = (sub: any) => {
    if (sub.file_name) return sub.file_name;
    if (sub.type === "location") return `Location (${sub.latitude?.toFixed(4)}, ${sub.longitude?.toFixed(4)})`;
    if (sub.type === "note" && sub.content) return sub.content.length > 60 ? sub.content.slice(0, 60) + "…" : sub.content;
    return sub.type;
  };

  return (
    <>
      <input
        ref={replaceInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.gif"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) handleReplaceSubmission(e.target.files[0]);
        }}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {selectableItems.length > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} id="select-all" />
            <label htmlFor="select-all" className="text-sm text-muted-foreground cursor-pointer">Select all</label>
          </div>
        )}
        {selectedIds.size > 0 && (
          <Button variant="outline" size="sm" onClick={handleBulkSelectedDownload} disabled={bulkDownloading}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {bulkDownloading ? "Downloading..." : `Download ${selectedIds.size} selected`}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant={sortBy === "date" ? "secondary" : "ghost"} size="sm" onClick={() => handleSort("date")} className="text-xs">
            <ArrowUpDown className="mr-1 h-3 w-3" />
            Date {sortBy === "date" ? (sortAsc ? "↑" : "↓") : ""}
          </Button>
          <Button variant={sortBy === "name" ? "secondary" : "ghost"} size="sm" onClick={() => handleSort("name")} className="text-xs">
            <SortAsc className="mr-1 h-3 w-3" />
            Name {sortBy === "name" ? (sortAsc ? "A→Z" : "Z→A") : ""}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 px-2"></TableHead>
                <TableHead>File</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="hidden md:table-cell">Engineer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.map((sub) => {
                const resolvedUrl = signedUrls[sub.id] || undefined;
                const isDocument = sub.type === "document" && sub.file_name;
                const hasFile = !!sub.file_url;
                return (
                  <TableRow key={sub.id} className={`${selectedIds.has(sub.id) ? "bg-primary/5" : ""} ${hasFile ? "cursor-pointer" : ""}`} onDoubleClick={() => {
                    if (sub.type === "photo" && resolvedUrl) openLightbox(sub.id);
                    else if (isDocument && resolvedUrl) setPreviewSub(sub);
                    else if (resolvedUrl) window.open(resolvedUrl, "_blank");
                  }}>
                    <TableCell className="w-10 px-2">
                      {hasFile && (
                        <Checkbox checked={selectedIds.has(sub.id)} onCheckedChange={() => toggleSelect(sub.id)} />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        {sub.type === "photo" && resolvedUrl ? (
                          <img src={resolvedUrl} alt={sub.file_name || "Photo"} className="h-10 w-10 rounded object-cover cursor-pointer flex-shrink-0 border border-border" onClick={() => openLightbox(sub.id)} />
                        ) : sub.type === "document" && sub.file_name && isImageFile(sub.file_name) && resolvedUrl ? (
                          <img src={resolvedUrl} alt={sub.file_name} className="h-10 w-10 rounded object-cover cursor-pointer flex-shrink-0 border border-border" onClick={() => window.open(resolvedUrl, "_blank")} />
                        ) : (
                          getTypeIcon(sub)
                        )}
                        {sub.type === "note" && editingNoteId === sub.id ? (
                          <div className="flex items-center gap-1 flex-1">
                            <input
                              value={editNoteText}
                              onChange={(e) => setEditNoteText(e.target.value)}
                              onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                  await supabase.from("submissions").update({ content: editNoteText }).eq("id", sub.id);
                                  setEditingNoteId(null);
                                  onUpdate?.();
                                  toast({ title: "Note updated" });
                                } else if (e.key === "Escape") {
                                  setEditingNoteId(null);
                                }
                              }}
                              className="flex-1 h-7 rounded border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              autoFocus
                            />
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={async () => {
                              await supabase.from("submissions").update({ content: editNoteText }).eq("id", sub.id);
                              setEditingNoteId(null);
                              onUpdate?.();
                              toast({ title: "Note updated" });
                            }}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingNoteId(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-sm font-medium truncate max-w-[300px]">{getDisplayName(sub)}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className="text-[10px] uppercase">{sub.type}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground truncate max-w-[150px]">
                      {getEngineerName(sub.engineer_id)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(sub.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {sub.type === "note" && (isAdmin || sub.engineer_id === currentUserId) && editingNoteId !== sub.id && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit note" onClick={() => {
                            setEditingNoteId(sub.id);
                            setEditNoteText(sub.content || "");
                          }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {isDocument && resolvedUrl && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewSub(sub)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        {resolvedUrl && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                            <a href={resolvedUrl} target="_blank" rel="noreferrer">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        {hasFile && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Replace with edited version" onClick={() => {
                            setReplacingSub(sub);
                            setTimeout(() => replaceInputRef.current?.click(), 50);
                          }}>
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        {(isAdmin || sub.engineer_id === currentUserId) && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={deletingId === sub.id}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete submission?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete {sub.file_name || "this submission"} and its associated file.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={async () => {
                                    setDeletingId(sub.id);
                                    await onDelete(sub);
                                    setDeletingId(null);
                                  }}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!previewSub} onOpenChange={(open) => !open && setPreviewSub(null)}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-base">
              {previewFileName && getDocIcon(previewFileName)}
              <span className="truncate">{previewFileName}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden px-6 pb-6">
            {previewUrl && canPreviewInBrowser(previewFileName) && (
              <iframe src={previewUrl} className="h-full w-full rounded-md border" title="Document preview" />
            )}
            {previewUrl && !canPreviewInBrowser(previewFileName) && getOfficeViewerUrl(previewUrl, previewFileName) && (
              <iframe src={getOfficeViewerUrl(previewUrl, previewFileName)!} className="h-full w-full rounded-md border" title="Document preview" />
            )}
            {previewUrl && !canPreviewInBrowser(previewFileName) && !getOfficeViewerUrl(previewUrl, previewFileName) && (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
                <FileText className="h-16 w-16" />
                <p>Preview not available for this file type.</p>
                <a href={previewUrl} target="_blank" rel="noreferrer">
                  <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Download to view</Button>
                </a>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <PhotoLightbox
        photos={lightboxPhotos}
        currentIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setLightboxIndex}
      />
    </>
  );
}
