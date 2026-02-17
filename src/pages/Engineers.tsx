import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Phone, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function Engineers() {
  const [engineers, setEngineers] = useState<any[]>([]);
  const [editEng, setEditEng] = useState<any | null>(null);
  const [form, setForm] = useState({ full_name: "", phone: "", whatsapp_number: "" });
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ full_name: "", email: "", phone: "", whatsapp_number: "" });
  const [adding, setAdding] = useState(false);
  const { toast } = useToast();

  const fetchEngineers = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "engineer");
    if (!roles || roles.length === 0) { setEngineers([]); return; }

    const userIds = roles.map((r) => r.user_id);
    const { data: profiles } = await supabase.from("profiles").select("*").in("user_id", userIds);

    const { data: assignments } = await supabase
      .from("job_assignments")
      .select("engineer_id, job_id")
      .in("engineer_id", userIds);

    const counts: Record<string, number> = {};
    (assignments || []).forEach((a) => { counts[a.engineer_id] = (counts[a.engineer_id] || 0) + 1; });

    setEngineers((profiles || []).map((p) => ({ ...p, job_count: counts[p.user_id] || 0 })));
  };

  useEffect(() => { fetchEngineers(); }, []);

  const openEdit = (eng: any) => {
    setEditEng(eng);
    setForm({ full_name: eng.full_name || "", phone: eng.phone || "", whatsapp_number: eng.whatsapp_number || "" });
  };

  const handleSave = async () => {
    if (!editEng) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name,
        phone: form.phone || null,
        whatsapp_number: form.whatsapp_number || null,
      })
      .eq("id", editEng.id);
    setSaving(false);

    if (error) {
      toast({ title: "Error", description: "Failed to update engineer.", variant: "destructive" });
    } else {
      toast({ title: "Updated", description: "Engineer details saved." });
      setEditEng(null);
      fetchEngineers();
    }
  };

  const handleAddEngineer = async () => {
    if (!addForm.email || !addForm.full_name) {
      toast({ title: "Error", description: "Name and email are required.", variant: "destructive" });
      return;
    }
    setAdding(true);
    const { data, error } = await supabase.functions.invoke("create-engineer", {
      body: addForm,
    });
    setAdding(false);

    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || "Failed to create engineer.", variant: "destructive" });
    } else {
      toast({ title: "Engineer added", description: `${addForm.full_name} has been created.` });
      setAddOpen(false);
      setAddForm({ full_name: "", email: "", phone: "", whatsapp_number: "" });
      fetchEngineers();
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Engineers</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Engineer
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Assigned Jobs</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {engineers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No engineers found. Users need to be assigned the engineer role.
                  </TableCell>
                </TableRow>
              ) : (
                engineers.map((eng) => (
                  <TableRow key={eng.id}>
                    <TableCell className="font-medium">{eng.full_name || "—"}</TableCell>
                    <TableCell>
                      {eng.whatsapp_number ? (
                        <span className="inline-flex items-center gap-1 text-sm">
                          <Phone className="h-3.5 w-3.5 text-accent" />
                          {eng.whatsapp_number}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{eng.phone || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{eng.job_count}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(eng)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editEng} onOpenChange={(open) => { if (!open) setEditEng(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Engineer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input id="edit-name" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input id="edit-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+44..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-wa">WhatsApp Number</Label>
              <Input id="edit-wa" value={form.whatsapp_number} onChange={(e) => setForm((f) => ({ ...f, whatsapp_number: e.target.value }))} placeholder="+44..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEng(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Engineer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="add-name">Full Name *</Label>
              <Input id="add-name" value={addForm.full_name} onChange={(e) => setAddForm((f) => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-email">Email *</Label>
              <Input id="add-email" type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-phone">Phone</Label>
              <Input id="add-phone" value={addForm.phone} onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+44..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-wa">WhatsApp Number</Label>
              <Input id="add-wa" value={addForm.whatsapp_number} onChange={(e) => setAddForm((f) => ({ ...f, whatsapp_number: e.target.value }))} placeholder="+44..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddEngineer} disabled={adding}>{adding ? "Adding…" : "Add Engineer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
