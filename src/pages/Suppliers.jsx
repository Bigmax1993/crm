import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Package } from "lucide-react";
import { getSuppliers, setSuppliers, newLocalId } from "@/lib/crm-local-store";

const emptyForm = {
  name: "",
  nip: "",
  email: "",
  phone: "",
  website: "",
  categories: "",
  notes: "",
};

export default function Suppliers() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    setRows(getSuppliers());
  }, []);

  const persist = (next) => {
    setRows(next);
    setSuppliers(next);
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name || "",
      nip: row.nip || "",
      email: row.email || "",
      phone: row.phone || "",
      website: row.website || "",
      categories: row.categories || "",
      notes: row.notes || "",
    });
    setOpen(true);
  };

  const save = () => {
    const payload = {
      id: editing?.id || newLocalId("supplier"),
      ...form,
      updated_at: new Date().toISOString(),
    };
    let next;
    if (editing) next = rows.map((r) => (r.id === editing.id ? payload : r));
    else next = [payload, ...rows];
    persist(next);
    setOpen(false);
  };

  const remove = (id) => {
    if (!confirm("Usunąć dostawcę?")) return;
    persist(rows.filter((r) => r.id !== id));
  };

  return (
    <div className="w-full p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground flex items-center gap-2">
              <Package className="h-8 w-8 text-primary" />
              Dostawcy i partnerzy
            </h1>
            <p className="text-muted-foreground mt-1">
              Producenci materiałów (obok kontrahentów z faktur). Dane lokalne — ułatwiają zestawienia i kontakt.
            </p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Dodaj dostawcę
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Kartoteka ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>NIP</TableHead>
                  <TableHead>Kontakt</TableHead>
                  <TableHead>Kategorie / produkty</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                      Brak wpisów — dodaj partnerów jak na stronie „Nasi partnerzy”.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm">{r.nip || "—"}</TableCell>
                      <TableCell className="text-sm">
                        {[r.email, r.phone].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate">{r.categories || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edytuj dostawcę" : "Nowy dostawca"}</DialogTitle>
              <DialogDescription>
                Kartoteka partnerów — dane tylko lokalnie w tej przeglądarce.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label>Nazwa *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>NIP</Label>
                  <Input value={form.nip} onChange={(e) => setForm({ ...form, nip: e.target.value })} />
                </div>
                <div>
                  <Label>Strona www</Label>
                  <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>E-mail</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <Label>Telefon</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Kategorie / produkty (krótko)</Label>
                <Input value={form.categories} onChange={(e) => setForm({ ...form, categories: e.target.value })} placeholder="np. nawierzchnie, tartan, PVC" />
              </div>
              <div>
                <Label>Notatki</Label>
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Anuluj
              </Button>
              <Button onClick={save} disabled={!form.name.trim()}>
                Zapisz
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
