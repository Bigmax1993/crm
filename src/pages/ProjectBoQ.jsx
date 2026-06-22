import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import {
  formatLvMoney,
  lvLinesCount,
  lvLinesSummary,
  normalizeLvLines,
  sumLvLines,
} from "@/lib/lv-schema";
import { getProjectDisplayName } from "@/lib/match-project";

export default function ProjectBoQ() {
  const [search, setSearch] = useState("");
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
                    <TableHead className="w-12" />
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
                      <TableRow key={r.id}>
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
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(`Usunąć LV ${r.document_number || r.title}?`)) deleteMutation.mutate(r.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
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
    </div>
  );
}
