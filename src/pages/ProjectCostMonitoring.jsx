import React, { useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

const WORKFLOW_LABELS = {
  oferta: "Oferta",
  zlecenie: "Zlecenie",
  realizacja: "Realizacja",
  odbior: "Odbiór",
  faktura: "Faktura",
  zaplacono: "Zapłacono",
};

function parseSchedule(json) {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export default function ProjectCostMonitoring() {
  const alerted = useRef(new Set());
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list(),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["construction-sites"],
    queryFn: () => base44.entities.ConstructionSite.list(),
  });

  const rows = useMemo(() => {
    return projects.map((p) => {
      const budget = Number(p.budget_planned) || 0;
      const cost = invoices
        .filter((i) => i.project_id === p.id && i.invoice_type !== "sales")
        .reduce((s, i) => s + (Number(i.amount) || 0), 0);
      const pct = budget > 0 ? (cost / budget) * 100 : 0;
      const delta = cost - budget;
      return { project: p, budget, cost, pct, delta, schedule: parseSchedule(p.payment_schedule) };
    });
  }, [projects, invoices]);

  useEffect(() => {
    for (const r of rows) {
      if (r.budget <= 0) continue;
      if (r.pct >= 80 && !alerted.current.has(r.project.id)) {
        alerted.current.add(r.project.id);
        toast.warning(`Projekt ${r.project.object_name || r.project.city}: wykorzystano ${r.pct.toFixed(0)}% budżetu`, {
          duration: 8000,
        });
      }
    }
  }, [rows]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] w-full items-center justify-center text-muted-foreground">
        <div className="h-10 w-10 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl md:text-4xl font-bold">Monitoring kosztów projektów</h1>
          <p className="text-muted-foreground mt-1">Budżet vs koszty rzeczywiste, harmonogram płatności, status</p>
        </motion.div>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Powiadomienia</AlertTitle>
          <AlertDescription>
            Przy przekroczeniu 80% budżetu wyświetlane jest powiadomienie w aplikacji (Sonner). Integracja e-mail wymaga
            funkcji po stronie Base44.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4">
          {rows.map((r) => (
            <motion.div key={r.project.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <CardTitle>{r.project.object_name || r.project.city}</CardTitle>
                    <p className="text-sm text-muted-foreground">{r.project.client_name || "—"}</p>
                  </div>
                  <Badge variant="outline">
                    {WORKFLOW_LABELS[r.project.workflow_status] || r.project.status || "—"}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Budżet</p>
                      <p className="font-semibold">{r.budget.toLocaleString("pl-PL")} PLN</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Koszty (FV zakup)</p>
                      <p className="font-semibold">{r.cost.toLocaleString("pl-PL")} PLN</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Odchylenie</p>
                      <p className={`font-semibold ${r.delta > 0 ? "text-red-600" : "text-emerald-700"}`}>
                        {r.delta.toLocaleString("pl-PL")} PLN ({r.budget > 0 ? `${r.pct.toFixed(1)}%` : "—"})
                      </p>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Wykorzystanie budżetu</span>
                      <span>{r.budget > 0 ? `${r.pct.toFixed(1)}%` : "brak budżetu"}</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          r.pct < 80 && "bg-emerald-600",
                          r.pct >= 80 && r.pct <= 100 && "bg-amber-500",
                          r.pct > 100 && "bg-red-600"
                        )}
                        style={{ width: `${r.budget > 0 ? Math.min(100, r.pct) : 0}%` }}
                      />
                    </div>
                  </div>

                  {r.schedule.length > 0 && (
                    <div>
                      <p className="font-medium mb-2">Harmonogram płatności</p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Etap</TableHead>
                            <TableHead>Data</TableHead>
                            <TableHead className="text-right">Kwota</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {r.schedule.map((s, idx) => (
                            <TableRow key={idx}>
                              <TableCell>{s.etap || s.stage || `Etap ${idx + 1}`}</TableCell>
                              <TableCell>{s.data || s.date || "—"}</TableCell>
                              <TableCell className="text-right">
                                {(Number(s.kwota ?? s.amount) || 0).toLocaleString("pl-PL")} PLN
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
          {rows.length === 0 && <p className="text-muted-foreground">Brak projektów w systemie.</p>}
        </div>
      </div>
    </div>
  );
}
