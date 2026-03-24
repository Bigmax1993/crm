import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Images } from "lucide-react";
import { getPortfolio, setPortfolio, newLocalId } from "@/lib/crm-local-store";
import { OFFER_SEGMENT_OPTIONS, offerSegmentLabel } from "@/lib/offer-segments";

const emptyForm = {
  title: "",
  city: "",
  offer_segment: "",
  description: "",
  contract_value_pln: "",
  image_urls: "",
  featured: false,
  completed_year: "",
};

export default function Portfolio() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    setRows(getPortfolio());
  }, []);

  const persist = (next) => {
    setRows(next);
    setPortfolio(next);
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      title: row.title || "",
      city: row.city || "",
      offer_segment: row.offer_segment || "",
      description: row.description || "",
      contract_value_pln: row.contract_value_pln != null ? String(row.contract_value_pln) : "",
      image_urls: Array.isArray(row.image_urls) ? row.image_urls.join("\n") : row.image_urls || "",
      featured: Boolean(row.featured),
      completed_year: row.completed_year || "",
    });
    setOpen(true);
  };

  const save = () => {
    const urls = form.image_urls
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const payload = {
      id: editing?.id || newLocalId("portfolio"),
      title: form.title,
      city: form.city,
      offer_segment: form.offer_segment,
      description: form.description,
      contract_value_pln: form.contract_value_pln ? parseFloat(form.contract_value_pln) : null,
      image_urls: urls,
      featured: form.featured,
      completed_year: form.completed_year || null,
      updated_at: new Date().toISOString(),
    };
    let next;
    if (editing) next = rows.map((r) => (r.id === editing.id ? payload : r));
    else next = [payload, ...rows];
    persist(next);
    setOpen(false);
  };

  const remove = (id) => {
    if (!confirm("Usunąć realizację z portfolio?")) return;
    persist(rows.filter((r) => r.id !== id));
  };

  return (
    <div className="w-full p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground flex items-center gap-2">
              <Images className="h-8 w-8 text-primary" />
              Realizacje (portfolio)
            </h1>
            <p className="text-muted-foreground mt-1">
              Wewnętrzna baza referencji — odpowiada sekcji Realizacje na stronie publicznej; URL zdjęć (jeden w linii).
            </p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Dodaj realizację
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
                  <TableHead>Tytuł</TableHead>
                  <TableHead>Miasto</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead>Wartość PLN</TableHead>
                  <TableHead>Rok</TableHead>
                  <TableHead>Wyróżnione</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                      Brak realizacji — dodaj pierwszą do ofertowania.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium max-w-[200px]">{r.title}</TableCell>
                      <TableCell>{r.city || "—"}</TableCell>
                      <TableCell className="text-sm">{offerSegmentLabel(r.offer_segment)}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {r.contract_value_pln != null ? Number(r.contract_value_pln).toLocaleString("pl-PL") : "—"}
                      </TableCell>
                      <TableCell>{r.completed_year || "—"}</TableCell>
                      <TableCell>{r.featured ? "tak" : "—"}</TableCell>
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
              <DialogTitle>{editing ? "Edytuj realizację" : "Nowa realizacja"}</DialogTitle>
              <DialogDescription>
                Wewnętrzna baza referencji — wpisy zapisują się lokalnie.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label>Tytuł / nazwa obiektu *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Miasto / lokalizacja</Label>
                  <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </div>
                <div>
                  <Label>Rok ukończenia</Label>
                  <Input value={form.completed_year} onChange={(e) => setForm({ ...form, completed_year: e.target.value })} placeholder="2025" />
                </div>
              </div>
              <div>
                <Label>Segment oferty</Label>
                <Select value={form.offer_segment || "__empty"} onValueChange={(v) => setForm({ ...form, offer_segment: v === "__empty" ? "" : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__empty">—</SelectItem>
                    {OFFER_SEGMENT_OPTIONS.filter((o) => o.value).map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Wartość kontraktu (PLN)</Label>
                <Input type="number" step="0.01" value={form.contract_value_pln} onChange={(e) => setForm({ ...form, contract_value_pln: e.target.value })} />
              </div>
              <div>
                <Label>Opis (krótki)</Label>
                <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <Label>URL zdjęć (jeden na linię)</Label>
                <Textarea rows={4} value={form.image_urls} onChange={(e) => setForm({ ...form, image_urls: e.target.value })} placeholder="https://..." />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="feat" checked={form.featured} onCheckedChange={(c) => setForm({ ...form, featured: Boolean(c) })} />
                <Label htmlFor="feat">Wyróżnij w materiałach ofertowych</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Anuluj
              </Button>
              <Button onClick={save} disabled={!form.title.trim()}>
                Zapisz
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
