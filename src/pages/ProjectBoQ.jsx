import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, Loader2, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import {
  emptyProjectBoQ,
  formatLvMoney,
  lvLinesCount,
  lvLinesSummary,
  normalizeLvLines,
  pickProjectBoQApiPayload,
  sumLvLines,
} from "@/lib/lv-schema";
import { getProjectDisplayName } from "@/lib/match-project";
import { formatBase44Error } from "@/lib/base44-entity-save";
import { findProjectBoQConflict } from "@/lib/duplicate-detection";

function rowToForm(row) {
  const lines = normalizeLvLines(row?.lines);
  return {
    ...emptyProjectBoQ(row),
    lines,
    total_net:
      row?.total_net != null && row.total_net !== ""
        ? Number(row.total_net)
        : lines.length
          ? sumLvLines(lines)
          : null,
    total_gross: row?.total_gross != null && row.total_gross !== "" ? Number(row.total_gross) : null,
    vat_percent: row?.vat_percent != null && row.vat_percent !== "" ? Number(row.vat_percent) : null,
    project_id: row?.project_id || "",
  };
}

export default function ProjectBoQ() {
  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(() => emptyProjectBoQ());
  const [linesJson, setLinesJson] = useState("[]");
  const queryClient = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["project-boq"],
    queryFn: () => base44.entities.ProjectBoQ.list("-issue_date"),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["construction-sites"],
    queryFn: () => base44.entities.ConstructionSite.list(),
  });

  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ProjectBoQ.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-boq"] });
      toast.success("Usunięto LV");
    },
    onError: () => toast.error("Nie udało się usunąć"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProjectBoQ.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-boq"] });
      setEditOpen(false);
      setEditing(null);
      toast.success("Zapisano zmiany LV");
    },
    onError: (e) => toast.error(formatBase44Error(e) || "Nie udało się zapisać"),
  });

  const openEdit = (row) => {
    const next = rowToForm(row);
    setEditing(row);
    setForm(next);
    setLinesJson(JSON.stringify(normalizeLvLines(next.lines), null, 2));
    setEditOpen(true);
  };

  const setField = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "total_net" || field === "total_gross" || field === "vat_percent") {
        next[field] = value === "" ? null : Number(value);
      }
      return next;
    });
  };

  const saveEdit = () => {
    if (!editing?.id) return;
    if (!String(form.document_number ?? "").trim() && !String(form.title ?? "").trim()) {
      toast.error("Uzupełnij numer LV lub tytuł obiektu.");
      return;
    }
    let lines;
    try {
      lines = normalizeLvLines(JSON.parse(linesJson));
    } catch {
      toast.error("Niepoprawny JSON pozycji LV.");
      return;
    }
    const candidate = { ...form, lines };
    const conflict = findProjectBoQConflict(rows, candidate, editing.id);
    if (conflict) {
      toast.error(
        `Duplikat kosztorysu: „${conflict.document_number || conflict.title}” już istnieje w systemie.`
      );
      return;
    }
    const payload = pickProjectBoQApiPayload({
      ...form,
      lines,
      project_id: form.project_id || undefined,
    });
    updateMutation.mutate({ id: editing.id, data: payload });
  };

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      r.document_number?.toLowerCase().includes(q) ||
      r.title?.toLowerCase().includes(q) ||
      r.client_name?.toLowerCase().includes(q) ||
      r.site_address?.toLowerCase().includes(q) ||
      lvLinesSummary(r.lines).toLowerCase().includes(q)
    );
  });

  const formLines = normalizeLvLines(form.lines);
  const formNetPreview =
    form.total_net != null && form.total_net !== ""
      ? Number(form.total_net)
      : formLines.length
        ? sumLvLines(formLines)
        : null;

  return (
    <div className="w-full p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <FileSpreadsheet className="h-8 w-8 text-blue-600" />
              Kosztorysy LV (Niemcy)
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Leistungsverzeichnis — pełny kosztorys prac na market (pozycje, ilości, ceny EUR). Plan budżetu projektu.
            </p>
          </div>
          <Button asChild className="bg-blue-600 hover:bg-blue-700">
            <Link to={createPageUrl("UploadLV")}>
              <Upload className="h-4 w-4 mr-2" />
              Import LV (PDF/JSON)
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>Lista ({filtered.length})</CardTitle>
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Szukaj LV, klient, objekt…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Ładowanie…</p>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>Brak kosztorysów LV.</p>
                <Button asChild variant="link" className="mt-2">
                  <Link to={createPageUrl("UploadLV")}>
                    <Plus className="h-4 w-4 mr-1" />
                    Importuj pierwszy LV
                  </Link>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nr LV</TableHead>
                    <TableHead>Objekt</TableHead>
                    <TableHead>Auftraggeber</TableHead>
                    <TableHead className="text-right">Pozycji</TableHead>
                    <TableHead className="text-right">Netto EUR</TableHead>
                    <TableHead>Projekt</TableHead>
                    <TableHead className="w-[88px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const lines = normalizeLvLines(r.lines);
                    const net =
                      r.total_net != null && r.total_net !== ""
                        ? Number(r.total_net)
                        : lines.length
                          ? sumLvLines(lines)
                          : null;
                    return (
                      <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(r)}>
                        <TableCell className="font-mono text-sm">{r.document_number || "—"}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={r.title}>
                          {r.title || r.site_address || "—"}
                        </TableCell>
                        <TableCell className="text-sm">{r.client_name || "—"}</TableCell>
                        <TableCell className="text-right text-sm">{lvLinesCount(lines)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {net != null ? formatLvMoney(net) : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.project_id ? getProjectDisplayName(projectById[r.project_id]) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Edytuj LV"
                              onClick={() => openEdit(r)}
                            >
                              <Pencil className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Usuń LV"
                              onClick={() => {
                                if (confirm(`Usunąć LV ${r.document_number || r.title}?`)) deleteMutation.mutate(r.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edytuj kosztorys LV</DialogTitle>
            <DialogDescription>
              {editing?.document_number || editing?.title || "Leistungsverzeichnis"}
              {formNetPreview != null ? ` · ${formatLvMoney(formNetPreview)} netto` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
            <div>
              <Label>Nr LV / Angebot</Label>
              <Input value={form.document_number || ""} onChange={(e) => setField("document_number", e.target.value)} />
            </div>
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={(form.issue_date || "").slice(0, 10)}
                onChange={(e) => setField("issue_date", e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Tytuł / Objekt (Markt)</Label>
              <Input value={form.title || ""} onChange={(e) => setField("title", e.target.value)} />
            </div>
            <div>
              <Label>Auftraggeber (klient)</Label>
              <Input value={form.client_name || ""} onChange={(e) => setField("client_name", e.target.value)} />
            </div>
            <div>
              <Label>Vergabenummer / PO</Label>
              <Input value={form.order_number || ""} onChange={(e) => setField("order_number", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label>Baustelle / adres</Label>
              <Input value={form.site_address || ""} onChange={(e) => setField("site_address", e.target.value)} />
            </div>
            <div>
              <Label>Suma netto (EUR)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.total_net ?? ""}
                onChange={(e) => setField("total_net", e.target.value)}
              />
            </div>
            <div>
              <Label>Suma brutto (EUR)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.total_gross ?? ""}
                onChange={(e) => setField("total_gross", e.target.value)}
              />
            </div>
            <div>
              <Label>VAT %</Label>
              <Input
                type="number"
                step="0.01"
                value={form.vat_percent ?? ""}
                onChange={(e) => setField("vat_percent", e.target.value)}
              />
            </div>
            <div>
              <Label>Projekt (market DE)</Label>
              <Select
                value={form.project_id || "none"}
                onValueChange={(v) => setField("project_id", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz projekt" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— brak —</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {getProjectDisplayName(p)}
                      {p.city ? ` · ${p.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Pozycje LV (JSON)</Label>
              <Textarea
                rows={10}
                className="font-mono text-xs"
                value={linesJson}
                onChange={(e) => {
                  setLinesJson(e.target.value);
                  try {
                    const parsed = normalizeLvLines(JSON.parse(e.target.value));
                    setForm((prev) => ({ ...prev, lines: parsed }));
                  } catch {
                    /* edycja w toku */
                  }
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {lvLinesCount(form.lines)} pozycji · pola: position, description, unit, quantity, unit_price, line_total
              </p>
            </div>
            <div className="md:col-span-2">
              <Label>Uwagi</Label>
              <Input value={form.notes || ""} onChange={(e) => setField("notes", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              Anuluj
            </Button>
            <Button
              type="button"
              className="bg-blue-600 hover:bg-blue-700"
              disabled={updateMutation.isPending}
              onClick={saveEdit}
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Zapisz zmiany
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
