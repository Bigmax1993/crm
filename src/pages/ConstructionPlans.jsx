import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Map, Plus, Search, Trash2, Upload, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { CONSTRUCTION_PLAN_TYPES } from "@/lib/construction-plan-schema";
import { getProjectDisplayName } from "@/lib/match-project";

export default function ConstructionPlans() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["construction-plans"],
    queryFn: () => base44.entities.ConstructionPlan.list("-issue_date"),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["construction-sites"],
    queryFn: () => base44.entities.ConstructionSite.list(),
  });

  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));

  const updateProjectMutation = useMutation({
    mutationFn: ({ id, project_id }) =>
      base44.entities.ConstructionPlan.update(id, {
        project_id: project_id || undefined,
        project_match_reason: project_id ? "manual" : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["construction-plans"] });
      toast.success("Zaktualizowano przypisanie projektu");
    },
    onError: () => toast.error("Nie udało się zapisać zmiany"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ConstructionPlan.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["construction-plans"] });
      toast.success("Usunięto plan");
    },
    onError: () => toast.error("Nie udało się usunąć"),
  });

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    if (!q) return true;
    const projectName = r.project_id ? getProjectDisplayName(projectById[r.project_id]) : "";
    return (
      r.title?.toLowerCase().includes(q) ||
      r.sheet_number?.toLowerCase().includes(q) ||
      r.city?.toLowerCase().includes(q) ||
      r.architect?.toLowerCase().includes(q) ||
      projectName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="w-full p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Map className="h-8 w-8 text-violet-600" />
              Plany budowy
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Rejestr planów przypisanych do projektów. Możesz ręcznie zmienić projekt w kolumnie „Przypisanie”.
            </p>
          </div>
          <Button asChild className="bg-violet-600 hover:bg-violet-700">
            <Link to={createPageUrl("UploadPlan")}>
              <Upload className="h-4 w-4 mr-2" />
              Import planu (PDF / skan)
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
                placeholder="Szukaj tytuł, arkusz, miasto, projekt…"
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
                <Map className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>Brak planów w systemie.</p>
                <Button asChild variant="link" className="mt-2">
                  <Link to={createPageUrl("UploadPlan")}>
                    <Plus className="h-4 w-4 mr-1" />
                    Importuj pierwszy plan
                  </Link>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tytuł</TableHead>
                    <TableHead>Arkusz</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Miasto</TableHead>
                    <TableHead className="min-w-[220px]">Przypisanie projektu</TableHead>
                    <TableHead>Plik</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium text-sm max-w-[180px] truncate" title={r.title}>
                        {r.title}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{r.sheet_number || "—"}</TableCell>
                      <TableCell className="text-sm">
                        {CONSTRUCTION_PLAN_TYPES[r.plan_type] || r.plan_type || "—"}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {r.issue_date ? String(r.issue_date).slice(0, 10) : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{r.city || "—"}</TableCell>
                      <TableCell>
                        <Select
                          value={r.project_id || "none"}
                          onValueChange={(v) =>
                            updateProjectMutation.mutate({
                              id: r.id,
                              project_id: v === "none" ? "" : v,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
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
                        {r.project_match_reason === "claude" && r.project_id ? (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Claude{r.project_match_confidence ? ` (${r.project_match_confidence}%)` : ""}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {r.file_url ? (
                          <a
                            href={r.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-violet-600 hover:underline inline-flex items-center gap-1 text-xs"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Otwórz
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`Usunąć plan „${r.title}”?`)) deleteMutation.mutate(r.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
