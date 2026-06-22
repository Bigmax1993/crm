import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Package, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { linesToDisplay, MATERIAL_DELIVERY_STATUSES } from "@/lib/material-delivery-schema";
import { getProjectDisplayName } from "@/lib/match-project";

export default function MaterialDeliveries() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["material-deliveries"],
    queryFn: () => base44.entities.MaterialDelivery.list("-issue_date"),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["construction-sites"],
    queryFn: () => base44.entities.ConstructionSite.list(),
  });

  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.MaterialDelivery.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["material-deliveries"] });
      toast.success("Usunięto WZ");
    },
    onError: () => toast.error("Nie udało się usunąć"),
  });

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      r.document_number?.toLowerCase().includes(q) ||
      r.supplier_name?.toLowerCase().includes(q) ||
      r.order_number?.toLowerCase().includes(q) ||
      linesToDisplay(r.lines).toLowerCase().includes(q)
    );
  });

  return (
    <div className="w-full p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Package className="h-8 w-8 text-blue-600" />
              Dostawy materiałów (WZ)
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Rejestr wydań zewnętrznych od dostawców — piasek, kruszywa itd. Powiąż później z fakturą zakupową.
            </p>
          </div>
          <Button asChild className="bg-blue-600 hover:bg-blue-700">
            <Link to={createPageUrl("UploadWZ")}>
              <Upload className="h-4 w-4 mr-2" />
              Import WZ (PDF)
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
                placeholder="Szukaj nr WZ, dostawca, materiał…"
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
                <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>Brak WZ w systemie.</p>
                <Button asChild variant="link" className="mt-2">
                  <Link to={createPageUrl("UploadWZ")}>
                    <Plus className="h-4 w-4 mr-1" />
                    Importuj pierwszy dokument
                  </Link>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nr WZ</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Dostawca</TableHead>
                    <TableHead>Materiał</TableHead>
                    <TableHead>Projekt</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.document_number}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {r.issue_date ? String(r.issue_date).slice(0, 10) : "—"}
                      </TableCell>
                      <TableCell>{r.supplier_name}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate" title={linesToDisplay(r.lines)}>
                        {linesToDisplay(r.lines)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.project_id ? getProjectDisplayName(projectById[r.project_id]) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{MATERIAL_DELIVERY_STATUSES[r.status] || r.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`Usunąć WZ ${r.document_number}?`)) deleteMutation.mutate(r.id);
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
