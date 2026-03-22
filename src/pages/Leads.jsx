import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, UserPlus } from "lucide-react";
import { getLeads, setLeads, newLocalId } from "@/lib/mizar-crm-local-store";

const STATUSES = [
  { value: "nowy", label: "Nowy" },
  { value: "zakwalifikowany", label: "Zakwalifikowany" },
  { value: "oferta", label: "Oferta" },
  { value: "wygrana", label: "Wygrana" },
  { value: "utracony", label: "Utracony" },
];

const emptyForm = {
  contact_name: "",
  company: "",
  email: "",
  phone: "",
  source: "www / kontakt",
  status: "nowy",
  assigned_to: "",
  notes: "",
  linked_site_label: "",
};

export default function Leads() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    setRows(getLeads());
  }, []);

  const persist = (next) => {
    setRows(next);
    setLeads(next);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, created_at: new Date().toISOString().slice(0, 10) });
    setOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      contact_name: row.contact_name || "",
      company: row.company || "",
      email: row.email || "",
      phone: row.phone || "",
      source: row.source || "",
      status: row.status || "nowy",
      assigned_to: row.assigned_to || "",
      notes: row.notes || "",
      linked_site_label: row.linked_site_label || "",
      created_at: row.created_at || new Date().toISOString().slice(0, 10),
    });
    setOpen(true);
  };

  const save = () => {
    const payload = {
      id: editing?.id || newLocalId("lead"),
      ...form,
      updated_at: new Date().toISOString(),
    };
    if (!payload.created_at) payload.created_at = new Date().toISOString().slice(0, 10);
    let next;
    if (editing) next = rows.map((r) => (r.id === editing.id ? payload : r));
    else next = [payload, ...rows];
    persist(next);
    setOpen(false);
  };

  const remove = (id) => {
    if (!confirm("Usunąć lead?")) return;
    persist(rows.filter((r) => r.id !== id));
  };

  const statusBadge = (s) => {
    const map = {
      nowy: "bg-muted text-foreground",
      zakwalifikowany: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100",
      oferta: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
      wygrana: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100",
      utracony: "bg-destructive/15 text-destructive",
    };
    return map[s] || "bg-muted";
  };

  return (
    <div className="w-full p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground flex items-center gap-2">
              <UserPlus className="h-8 w-8 text-primary" />
              Leady i zapytania
            </h1>
            <p className="text-muted-foreground mt-1">
              Lejek sprzedażowy (dane lokalne — uzupełnia stronę kontaktową{" "}
              <a href="https://mizarsport.eu/kontakt/" className="text-primary underline" target="_blank" rel="noreferrer">
                mizarsport.eu
              </a>
              ).
            </p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Dodaj lead
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lista ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Firma / kontakt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Źródło</TableHead>
                  <TableHead>Przypisany</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      Brak leadów — dodaj pierwszy lub importuj z notatek.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.company || r.contact_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{[r.contact_name, r.email].filter(Boolean).join(" · ")}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusBadge(r.status)} variant="secondary">
                          {STATUSES.find((x) => x.value === r.status)?.label || r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{r.source || "—"}</TableCell>
                      <TableCell className="text-sm">{r.assigned_to || "—"}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{r.created_at || "—"}</TableCell>
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
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edytuj lead" : "Nowy lead"}</DialogTitle>
              <DialogDescription>
                Dane zapisują się lokalnie w przeglądarce (lejek sprzedażowy Mizar Sport).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Firma</Label>
                  <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                </div>
                <div>
                  <Label>Osoba kontaktowa</Label>
                  <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Źródło</Label>
                  <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Przypisany do</Label>
                  <Input value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} placeholder="np. handlowiec" />
                </div>
                <div>
                  <Label>Data wpisu</Label>
                  <Input type="date" value={form.created_at || ""} onChange={(e) => setForm({ ...form, created_at: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Powiązanie z obiektem (tekst)</Label>
                <Input
                  value={form.linked_site_label}
                  onChange={(e) => setForm({ ...form, linked_site_label: e.target.value })}
                  placeholder="np. miasto + nazwa obiektu z Budowy"
                />
              </div>
              <div>
                <Label>Notatki</Label>
                <Textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Anuluj
              </Button>
              <Button onClick={save}>Zapisz</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
