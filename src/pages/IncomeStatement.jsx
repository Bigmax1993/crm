import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { plByProject, quarterlyYoYTrend, globalPL } from "@/lib/mizar-finance";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

export default function IncomeStatement() {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list(),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["construction-sites"],
    queryFn: () => base44.entities.ConstructionSite.list(),
  });

  const currency = "PLN";

  const perProject = useMemo(() => plByProject(invoices, projects, currency), [invoices, projects]);
  const globalRow = useMemo(() => globalPL(invoices, currency), [invoices]);

  const trend = useMemo(() => quarterlyYoYTrend(invoices, currency).slice(-12), [invoices]);

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
          <h1 className="text-3xl md:text-4xl font-bold">Rachunek wyników</h1>
          <p className="text-muted-foreground mt-1">Przychody i koszty (faktury zapłacone) — per projekt i globalnie</p>
        </motion.div>

        <Tabs defaultValue="projects">
          <TabsList>
            <TabsTrigger value="projects">Per projekt</TabsTrigger>
            <TabsTrigger value="trend">Trend kwartalny</TabsTrigger>
          </TabsList>
          <TabsContent value="projects" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Podsumowanie globalne</CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-3 gap-4 text-sm">
                <Kpi label="Przychody" value={globalRow.przychody} />
                <Kpi label="Koszty" value={globalRow.koszty} />
                <Kpi label="Wynik brutto" value={globalRow.brutto} />
                <div className="sm:col-span-3">
                  <p className="text-muted-foreground">Marża %</p>
                  <p className="text-2xl font-bold">
                    {globalRow.marzaPct != null ? `${globalRow.marzaPct.toFixed(2)}%` : "—"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Projekty</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Projekt</TableHead>
                      <TableHead className="text-right">Przychody</TableHead>
                      <TableHead className="text-right">Koszty</TableHead>
                      <TableHead className="text-right">Wynik</TableHead>
                      <TableHead className="text-right">Marża %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perProject.map((r) => (
                      <TableRow key={r.project.id}>
                        <TableCell className="font-medium">{r.project.object_name || r.project.city}</TableCell>
                        <TableCell className="text-right">{r.przychody.toLocaleString("pl-PL")}</TableCell>
                        <TableCell className="text-right">{r.koszty.toLocaleString("pl-PL")}</TableCell>
                        <TableCell className="text-right font-semibold">{r.brutto.toLocaleString("pl-PL")}</TableCell>
                        <TableCell className="text-right">
                          {r.marzaPct != null ? `${r.marzaPct.toFixed(1)}%` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="trend">
            <Card>
              <CardHeader>
                <CardTitle>Trend rentowności (kwartały, zapłacone)</CardTitle>
              </CardHeader>
              <CardContent className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="key" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => Number(v).toLocaleString("pl-PL")} />
                    <Legend />
                    <Line type="monotone" dataKey="przychody" name="Przychody" stroke="#2E75B6" strokeWidth={2} />
                    <Line type="monotone" dataKey="koszty" name="Koszty" stroke="#C55A11" strokeWidth={2} />
                    <Line type="monotone" dataKey="wynik" name="Wynik" stroke="#1F4E79" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN</p>
    </div>
  );
}
