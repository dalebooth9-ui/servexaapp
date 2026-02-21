import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Pencil, Trash2, Building2, ArrowLeft, FolderOpen, Upload, X, FileText, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CustomerFolderDrop, { type CustomerFolderDropHandle } from "@/components/CustomerFolderDrop";

type Customer = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
};

type CustomerForm = {
  name: string;
  address: string;
  phone: string;
  email: string;
};

const emptyForm: CustomerForm = { name: "", address: "", phone: "", email: "" };

export default function Customers() {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [folderImportOpen, setFolderImportOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const folderDropRef = useRef<CustomerFolderDropHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadCustomerId, setUploadCustomerId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("customers")
      .select("*")
      .order("name");
    setCustomers((data as Customer[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q) ||
      (c.address || "").toLowerCase().includes(q)
    );
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      address: c.address || "",
      phone: c.phone || "",
      email: c.email || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
    };

    if (editingId) {
      const { error } = await supabase.from("customers").update(payload).eq("id", editingId);
      if (error) {
        toast({ title: "Failed to update customer", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Customer updated" });
        setDialogOpen(false);
        fetchCustomers();
      }
    } else {
      const { error } = await supabase.from("customers").insert(payload);
      if (error) {
        toast({ title: "Failed to create customer", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Customer created" });
        setDialogOpen(false);
        fetchCustomers();
      }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("customers").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Failed to delete customer", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Customer deleted" });
      fetchCustomers();
    }
    setDeleteId(null);
  };

  const isAdmin = userRole === "admin";

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    const { error } = await supabase.from("customers").delete().in("id", Array.from(selectedIds));
    if (error) {
      toast({ title: "Failed to delete customers", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Deleted ${selectedIds.size} customer(s)` });
      setSelectedIds(new Set());
      fetchCustomers();
    }
    setBulkDeleting(false);
    setBulkDeleteOpen(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadFiles(files);
    setUploadCustomerId("");
    setUploadDialogOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUploadFiles = async () => {
    if (!uploadCustomerId || uploadFiles.length === 0) return;
    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUploading(false); return; }

    let successCount = 0;
    for (const file of uploadFiles) {
      if (file.size > 20 * 1024 * 1024) {
        toast({ title: `${file.name} exceeds 20MB limit`, variant: "destructive" });
        continue;
      }
      const storagePath = `${uploadCustomerId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("submissions")
        .upload(storagePath, file, { contentType: file.type });
      if (uploadErr) {
        toast({ title: `Failed to upload ${file.name}`, description: uploadErr.message, variant: "destructive" });
        continue;
      }
      const { error: dbErr } = await supabase.from("customer_documents").insert({
        customer_id: uploadCustomerId,
        file_name: file.name,
        file_url: storagePath,
        file_size: file.size,
        uploaded_by: user.id,
      });
      if (dbErr) {
        toast({ title: `Failed to save ${file.name}`, description: dbErr.message, variant: "destructive" });
        continue;
      }
      successCount++;
    }

    if (successCount > 0) {
      toast({ title: `Uploaded ${successCount} file(s)` });
    }
    setUploadDialogOpen(false);
    setUploadFiles([]);
    setUploading(false);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    dragCounter.current = 0;
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setFolderImportOpen(true);
      // Small delay to let dialog mount
      setTimeout(() => folderDropRef.current?.processFiles(files), 100);
    }
  };

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button variant="outline" onClick={() => {
              const headers = ["Name", "Email", "Phone", "Address"];
              const rows = customers.map(c => [c.name, c.email || "", c.phone || "", (c.address || "").replace(/\n/g, " ")]);
              const csv = [headers, ...rows].map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Upload Files
            </Button>
            <Button variant="outline" onClick={() => setFolderImportOpen(true)}>
              <FolderOpen className="mr-2 h-4 w-4" /> Import Folder
            </Button>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Add Customer
            </Button>
          </div>
        )}
      </div>

      {isAdmin && selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
          <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
            <Trash2 className="mr-1 h-4 w-4" /> Delete Selected
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Button>
        </div>
      )}

      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search customers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div
        onDragEnter={isAdmin ? handleDragEnter : undefined}
        onDragLeave={isAdmin ? handleDragLeave : undefined}
        onDragOver={isAdmin ? handleDragOver : undefined}
        onDrop={isAdmin ? handleDrop : undefined}
        className="relative"
      >
        {dragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-primary">
              <FolderOpen className="h-10 w-10" />
              <p className="font-medium">Drop folder to import customers</p>
            </div>
          </div>
        )}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <p className="p-8 text-center text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
                <Building2 className="h-10 w-10" />
                <p>{search ? "No customers match your search." : "No customers yet. Add your first customer or drop a folder to get started."}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={filtered.length > 0 && selectedIds.size === filtered.length}
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                    )}
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="hidden md:table-cell">Address</TableHead>
                    {isAdmin && <TableHead className="w-24">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id} data-state={selectedIds.has(c.id) ? "selected" : undefined}>
                      {isAdmin && (
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(c.id)}
                            onCheckedChange={() => toggleSelect(c.id)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">
                        <Link to={`/customers/${c.id}`} className="text-primary hover:underline">{c.name}</Link>
                      </TableCell>
                      <TableCell>{c.email || "—"}</TableCell>
                      <TableCell>{c.phone || "—"}</TableCell>
                      <TableCell className="hidden md:table-cell max-w-[250px] truncate">{c.address || "—"}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteId(c.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Customer" : "Add Customer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cust-name">Name *</Label>
              <Input id="cust-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Company or customer name" />
            </div>
            <div>
              <Label htmlFor="cust-email">Email</Label>
              <Input id="cust-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
            </div>
            <div>
              <Label htmlFor="cust-phone">Phone</Label>
              <Input id="cust-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+44 7700 900000" />
            </div>
            <div>
              <Label htmlFor="cust-address">Address</Label>
              <Textarea id="cust-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Full address" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this customer? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.size} Customer(s)</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete {selectedIds.size} selected customer(s)? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? "Deleting…" : `Delete ${selectedIds.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Files to Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Customer *</Label>
              <Select value={uploadCustomerId} onValueChange={setUploadCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a customer…" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Files ({uploadFiles.length})</Label>
              <div className="mt-1 max-h-40 overflow-y-auto space-y-1">
                {uploadFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 rounded border p-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)}KB</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setUploadFiles((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUploadFiles} disabled={uploading || !uploadCustomerId || uploadFiles.length === 0}>
              {uploading ? "Uploading…" : `Upload ${uploadFiles.length} File(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Folder Import */}
      <CustomerFolderDrop
        ref={folderDropRef}
        open={folderImportOpen}
        onOpenChange={setFolderImportOpen}
        onImported={fetchCustomers}
      />
    </div>
  );
}
