import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Pencil, Trash2, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        {isAdmin && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Add Customer
          </Button>
        )}
      </div>

      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search customers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-8 text-center text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
              <Building2 className="h-10 w-10" />
              <p>{search ? "No customers match your search." : "No customers yet. Add your first customer to get started."}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="hidden md:table-cell">Address</TableHead>
                  {isAdmin && <TableHead className="w-24">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
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
    </div>
  );
}
