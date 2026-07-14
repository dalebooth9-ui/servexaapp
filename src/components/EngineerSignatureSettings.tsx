// Admin-only library of stored engineer signatures.
// One row per technician name string (e.g. "Dale Booth"). Whenever a job
// sheet is filed with that name in the technician_name field, the Customer
// Report PDF pulls the stored signature into the technician slot.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PenLine, Upload, Trash2, Plus, Loader2 } from "lucide-react";

type Row = {
  id: string;
  name: string;
  file_path: string;
  user_id: string | null;
  updated_at?: string;
};

const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function EngineerSignatureSettings() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | null>(null);
  const [showNew, setShowNew] = useState(false);

  const isAdmin = userRole === "admin";

  const fetchRows = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("engineer_signatures" as any)
      .select("id, name, file_path, user_id, updated_at")
      .order("name");
    const list = ((data as any) || []) as Row[];
    setRows(list);
    const u: Record<string, string> = {};
    await Promise.all(
      list.map(async (r) => {
        if (!r.file_path) return;
        const { data: signed } = await supabase.storage
          .from("signatures")
          .createSignedUrl(r.file_path, 3600);
        if (signed?.signedUrl) u[r.id] = signed.signedUrl;
      }),
    );
    setUrls(u);
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const handleDelete = async (row: Row) => {
    if (!confirm(`Remove stored signature for "${row.name}"?`)) return;
    if (row.file_path) {
      await supabase.storage.from("signatures").remove([row.file_path]);
    }
    await supabase.from("engineer_signatures" as any).delete().eq("id", row.id);
    toast({ title: "Removed" });
    fetchRows();
  };

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Engineer signatures</CardTitle>
            <CardDescription>
              One stored signature per technician name. Used automatically in
              the Customer Report PDF whenever that name is selected as the
              technician on a job sheet — no more re-drawing every time.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add signature
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-2">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No signatures yet. Add one for each engineer whose name appears in
            the technician dropdown (e.g. "Dale Booth").
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <div
                key={r.id}
                className="rounded-md border p-3 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">{r.name}</div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(r)}
                    >
                      <PenLine className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleDelete(r)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {urls[r.id] ? (
                  <img
                    src={urls[r.id]}
                    alt={`${r.name} signature`}
                    className="h-16 w-full object-contain bg-muted rounded"
                  />
                ) : (
                  <div className="h-16 w-full bg-muted rounded" />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {(showNew || editing) && (
        <SignatureEditorDialog
          existing={editing}
          onClose={() => {
            setShowNew(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowNew(false);
            setEditing(null);
            fetchRows();
          }}
        />
      )}
    </Card>
  );
}

// ── Editor dialog ──

function SignatureEditorDialog({
  existing,
  onClose,
  onSaved,
}: {
  existing: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(existing?.name || "");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [drawnBlob, setDrawnBlob] = useState<Blob | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasStroke, setHasStroke] = useState(false);

  const clearCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx?.clearRect(0, 0, c.width, c.height);
    setHasStroke(false);
    setDrawnBlob(null);
  };

  const pt = (e: React.PointerEvent) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawing.current = true;
    last.current = pt(e);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    const p = pt(e);
    if (!ctx || !last.current) return;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    last.current = p;
    setHasStroke(true);
  };
  const onUp = async () => {
    drawing.current = false;
    last.current = null;
    const c = canvasRef.current;
    if (!c) return;
    const blob = await new Promise<Blob | null>((res) =>
      c.toBlob((b) => res(b), "image/png"),
    );
    setDrawnBlob(blob);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) {
      toast({ title: "Enter the engineer name", variant: "destructive" });
      return;
    }
    let blob: Blob | null = null;
    let contentType = "image/png";
    let ext = "png";
    if (mode === "draw") {
      blob = drawnBlob;
    } else if (uploadFile) {
      blob = uploadFile;
      contentType = uploadFile.type || "image/png";
      ext = (uploadFile.name.split(".").pop() || "png").toLowerCase();
    }
    if (!blob && !existing) {
      toast({
        title: "Draw or upload a signature",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      let file_path = existing?.file_path || "";
      if (blob) {
        const path = `engineer-library/${user.id}/${slug(name)}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("signatures")
          .upload(path, blob, { contentType, upsert: true });
        if (upErr) throw upErr;
        if (existing?.file_path && existing.file_path !== path) {
          await supabase.storage.from("signatures").remove([existing.file_path]);
        }
        file_path = path;
      }
      if (existing) {
        const { error } = await supabase
          .from("engineer_signatures" as any)
          .update({ name: name.trim(), file_path })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("engineer_signatures" as any)
          .insert({
            name: name.trim(),
            file_path,
            created_by: user.id,
          });
        if (error) throw error;
      }
      toast({ title: "Signature saved" });
      onSaved();
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {existing ? `Edit signature — ${existing.name}` : "Add engineer signature"}
          </DialogTitle>
          <DialogDescription>
            The name must match the string used in the "Technician" dropdown
            on the paper job sheet (e.g. "Dale Booth", "C. Whittaker").
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Engineer name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dale Booth"
              disabled={!!existing}
            />
          </div>
          <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="draw">Draw</TabsTrigger>
              <TabsTrigger value="upload">Upload image</TabsTrigger>
            </TabsList>
            <TabsContent value="draw" className="space-y-2 mt-3">
              <canvas
                ref={canvasRef}
                width={500}
                height={160}
                className="w-full h-40 border rounded bg-white touch-none"
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              />
              <div className="flex justify-between">
                <Button size="sm" variant="ghost" onClick={clearCanvas}>
                  Clear
                </Button>
                {hasStroke && (
                  <span className="text-xs text-muted-foreground self-center">
                    Ready to save
                  </span>
                )}
              </div>
            </TabsContent>
            <TabsContent value="upload" className="space-y-2 mt-3">
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
              {uploadFile && (
                <img
                  src={URL.createObjectURL(uploadFile)}
                  alt="preview"
                  className="h-24 w-full object-contain bg-muted rounded"
                />
              )}
              <p className="text-xs text-muted-foreground">
                PNG with a transparent background gives the cleanest result.
              </p>
            </TabsContent>
          </Tabs>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
