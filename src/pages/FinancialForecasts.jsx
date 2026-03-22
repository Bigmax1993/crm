import React, { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import mizarData from "@/fixtures/mizar_data.json";
import { getNbpEurMidCached } from "@/lib/nbp-rates";
import {
  buildCashFlowEtapowy,
  buildSeasonalityAnalysis,
  buildEurExposure,
  eurSensitivityRows,
  buildPipelineScenarios,
  getOfertyProjects,
  buildRentownoscTypy,
  formatPln,
  formatPct,
} from "@/lib/prognozy";
import { exportPrognozyExcel, exportPrognozyPdf } from "@/lib/prognozy-export";
import { ForecastErrorBoundary } from "@/components/prognozy/ForecastErrorBoundary";
import { ForecastModuleChrome } from "@/components/prognozy/ForecastModuleChrome";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
  BarChart,
  Bar,
  LineChart,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
} from "recharts";
import { parseISO } from "date-fns";

const BANK_TS = mizarData?.konto_bankowe?.data_aktualizacji
  ? parseISO(`${mizarData.konto_bankowe.data_aktualizacji}T12:00:00`).getTime()
  : Date.now();

export default function FinancialForecasts() {
  const queryClient = useQueryClient();
  const [horizon, setHorizon] = useState(90);
  const [pipelineProbs, setPipelineProbs] = useState(() => {
    const init = {};
    for (const p of getOfertyProjects(mizarData)) {
      init[p.id] = 50;
    }
    return init;
  });
  const [eurSliderDelta, setEurSliderDelta] = useState([0]);

  const {
    data: eurData,
    isLoading: eurLoading,
    isFetching: eurFetching,
    dataUpdatedAt,
    refetch: refetchEur,
  } = useQuery({
    queryKey: ["prognozy-nbp-eur"],
    queryFn: getNbpEurMidCached,
    staleTime: 1000 * 60 * 60 * 24,
  });

  const updatedAt = Math.max(BANK_TS, dataUpdatedAt || 0);

  const refreshAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["prognozy-nbp-eur"] });
    await refetchEur();
  }, [queryClient, refetchEur]);

  const loadingNbp = eurLoading || eurFetching;

  const kontrahenciById = useMemo(
    () => Object.fromEntries((mizarData.kontrahenci || []).map((k) => [k.id, k.nazwa])),
    []
  );

  const cash = useMemo(() => buildCashFlowEtapowy(mizarData, { horizonDays: horizon }), [horizon]);
  const season = useMemo(() => buildSeasonalityAnalysis(mizarData), []);
  const eurEx = useMemo(() => buildEurExposure(mizarData), []);
  const baseMid = eurData?.mid ?? 4.32;
  const sens = useMemo(
    () => eurSensitivityRows(eurEx.exposureEur, baseMid, [-0.5, -0.2, -0.1, 0, 0.1, 0.2, 0.5]),
    [eurEx.exposureEur, baseMid]
  );
  const pipeline = useMemo(
    () => buildPipelineScenarios(mizarData, pipelineProbs, { referenceDate: new Date() }),
    [pipelineProbs]
  );
  const rent = useMemo(() => buildRentownoscTypy(mizarData), []);

  const scenarioRate = baseMid + (eurSliderDelta[0] ?? 0);
  const scenarioCost = eurEx.exposureEur * scenarioRate;
  const scenarioBaseCost = eurEx.exposureEur * baseMid;
  const scenarioDiff = scenarioCost - scenarioBaseCost;

  const chartMotion = {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35 },
  };

  return (
    <div className="w-full p-4 md:p-6 pb-16">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">Prognozy finansowe</h1>
          <p className="text-muted-foreground mt-1">
            MIZAR Sp. z o.o. — pięć modułów analitycznych na danych testowych{" "}
            <span className="font-mono text-xs">mizar_data.json</span> oraz kursie EUR (NBP, cache 24h).
          </p>
        </motion.div>

        <Tabs defaultValue="cashflow" className="w-full">
          <TabsList className="flex h-auto min-h-9 w-full flex-wrap justify-start gap-1 bg-muted/80 p-1">
            <TabsTrigger value="cashflow" className="text-xs sm:text-sm">
              Cash flow
            </TabsTrigger>
            <TabsTrigger value="season" className="text-xs sm:text-sm">
              Sezonowość
            </TabsTrigger>
            <TabsTrigger value="fx" className="text-xs sm:text-sm">
              Ryzyko EUR
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="text-xs sm:text-sm">
              Pipeline
            </TabsTrigger>
            <TabsTrigger value="margin" className="text-xs sm:text-sm">
              Rentowność
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cashflow" className="mt-4">
            <ForecastErrorBoundary moduleName="Cash flow etapowy">
              <ForecastModuleChrome
                title="MODUŁ 1 — Cash flow etapowy"
                description="Saldo startowe z konta (PLN) + przyszłe i zaległe przepływy z faktur wg terminów płatności / zaksięgowanych zapłat."
                updatedAt={updatedAt}
                loading={false}
                onRefresh={refreshAll}
                onExportPdf={() =>
                  exportPrognozyPdf(
                    `MIZAR_prognoza_cf_${horizon}d.pdf`,
                    `Cash flow ${horizon} dni`,
                    ["Tydzień", "Wpływy", "Wydatki", "Saldo", "Status"],
                    cash.rows.map((r) => [r.weekStart, r.wplywy, r.wydatki, r.saldo, r.status])
                  )
                }
                onExportExcel={() =>
                  exportPrognozyExcel(
                    `MIZAR_prognoza_cf_${horizon}d.xlsx`,
                    "Cash flow",
                    ["Tydzień", "Wpływy", "Wydatki", "Saldo", "Status"],
                    cash.rows.map((r) => [r.weekStart, r.wplywy, r.wydatki, r.saldo, r.status])
                  )
                }
              >
                <div className="flex flex-wrap gap-2 mb-2">
                  {[30, 60, 90].map((d) => (
                    <Button
                      key={d}
                      type="button"
                      size="sm"
                      variant={horizon === d ? "default" : "outline"}
                      onClick={() => setHorizon(d)}
                    >
                      {d} dni
                    </Button>
                  ))}
                </div>
                {cash.criticalLow && (
                  <Alert variant="destructive" className="mb-3">
                    <AlertTitle>Alert krytyczny</AlertTitle>
                    <AlertDescription>
                      Prognozowane saldo spada poniżej {formatPln(200000, { min: 0, max: 0 })} w oknie{" "}
                      {horizon} dni.
                    </AlertDescription>
                  </Alert>
                )}
                {!cash.criticalLow && cash.warnLow && (
                  <Alert className="mb-3 border-amber-500/50 bg-amber-500/10">
                    <AlertTitle>Ostrzeżenie</AlertTitle>
                    <AlertDescription>
                      Saldo spada poniżej {formatPln(500000, { min: 0, max: 0 })} w części tygodni.
                    </AlertDescription>
                  </Alert>
                )}
                <motion.div {...chartMotion} className="h-[340px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={cash.chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} interval={0} angle={-20} height={55} />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                        domain={["auto", "auto"]}
                      />
                      <Tooltip
                        formatter={(v) => formatPln(v, { min: 0, max: 0 })}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                      />
                      <Legend />
                      <ReferenceArea
                        y1={0}
                        y2={cash.thresholds.critical}
                        fill="#ef4444"
                        fillOpacity={0.12}
                        ifOverflow="extendDomain"
                      />
                      <Line
                        type="monotone"
                        dataKey="wplywy"
                        name="Wpływy"
                        stroke="#16a34a"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="wydatki"
                        name="Wydatki"
                        stroke="#dc2626"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="saldo"
                        name="Saldo narastające"
                        stroke="#2563eb"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </motion.div>
                <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tydzień</TableHead>
                      <TableHead className="text-right">Wpływy</TableHead>
                      <TableHead className="text-right">Wydatki</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cash.rows.map((r) => (
                      <TableRow
                        key={r.weekStart}
                        className={
                          r.status === "critical"
                            ? "bg-red-500/10"
                            : r.status === "warn"
                              ? "bg-amber-500/10"
                              : "bg-emerald-500/5"
                        }
                      >
                        <TableCell className="font-mono text-xs">{r.weekLabel}</TableCell>
                        <TableCell className="text-right text-sm">{formatPln(r.wplywy, { min: 0, max: 0 })}</TableCell>
                        <TableCell className="text-right text-sm">{formatPln(r.wydatki, { min: 0, max: 0 })}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatPln(r.saldo, { min: 0, max: 0 })}</TableCell>
                        <TableCell className="text-xs capitalize">{r.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </ForecastModuleChrome>
            </ForecastErrorBoundary>
          </TabsContent>

          <TabsContent value="season" className="mt-4">
            <ForecastErrorBoundary moduleName="Sezonowość">
              <ForecastModuleChrome
                title="MODUŁ 2 — Sezonowość branży budowlanej"
                description="Netto miesięczne wg dat zapłaty; prognoza sezonowa = średnia × współczynnik miesiąca."
                updatedAt={updatedAt}
                loading={false}
                onRefresh={refreshAll}
                onExportPdf={() =>
                  exportPrognozyPdf(
                    "MIZAR_prognoza_sezon.pdf",
                    "Sezonowość",
                    ["Miesiąc", "Plan (śr.)", "Sezon", "Rzeczywistość", "Odchylenie %"],
                    season.deviationRows.map((r) => [
                      r.month,
                      r.plan,
                      r.sezon,
                      r.rzeczywistosc,
                      r.odchyleniePct != null ? r.odchyleniePct.toFixed(1) : "",
                    ])
                  )
                }
                onExportExcel={() =>
                  exportPrognozyExcel(
                    "MIZAR_prognoza_sezon.xlsx",
                    "Sezonowość",
                    ["Miesiąc", "Plan (śr.)", "Sezon", "Rzeczywistość", "Odchylenie %"],
                    season.deviationRows.map((r) => [
                      r.month,
                      r.plan,
                      r.sezon,
                      r.rzeczywistosc,
                      r.odchyleniePct,
                    ])
                  )
                }
              >
                <motion.div {...chartMotion} className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={season.barData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(v) => formatPln(v, { min: 0, max: 0 })}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                      />
                      <Legend />
                      <Bar dataKey="rzeczywistosc" name="Rzeczywistość (netto)" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="sezon" name="Prognoza sezonowa" stroke="#c026d3" strokeWidth={2} dot />
                      <Line
                        type="monotone"
                        dataKey="plan"
                        name="Plan (średnia)"
                        stroke="#64748b"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </motion.div>
                <Card className="bg-muted/40">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Wnioski</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-1">
                    <p>Najlepszy okres aktywności (współczynniki): {season.insight.best}.</p>
                    <p>Najsłabszy okres: {season.insight.worst}.</p>
                    <p>Średnia miesięczna netto (historia): {formatPln(season.avgMonthly, { min: 0, max: 0 })}.</p>
                  </CardContent>
                </Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Miesiąc</TableHead>
                      <TableHead className="text-right">Plan</TableHead>
                      <TableHead className="text-right">Sezon</TableHead>
                      <TableHead className="text-right">Rzeczywistość</TableHead>
                      <TableHead className="text-right">Odchylenie %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {season.deviationRows.map((r) => (
                      <TableRow key={r.month}>
                        <TableCell className="font-mono text-xs">{r.month}</TableCell>
                        <TableCell className="text-right text-sm">{formatPln(r.plan, { min: 0, max: 0 })}</TableCell>
                        <TableCell className="text-right text-sm">{formatPln(r.sezon, { min: 0, max: 0 })}</TableCell>
                        <TableCell className="text-right text-sm">{formatPln(r.rzeczywistosc, { min: 0, max: 0 })}</TableCell>
                        <TableCell className="text-right text-sm">
                          {r.odchyleniePct != null ? `${r.odchyleniePct.toFixed(1)}%` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ForecastModuleChrome>
            </ForecastErrorBoundary>
          </TabsContent>

          <TabsContent value="fx" className="mt-4">
            <ForecastErrorBoundary moduleName="Ryzyko walutowe">
              <ForecastModuleChrome
                title="MODUŁ 3 — Ryzyko walutowe EUR/PLN"
                description="Ekspozycja z niezapłaconych faktur otrzymanych w EUR; kurs z API NBP (A/EUR/last)."
                updatedAt={updatedAt}
                loading={loadingNbp}
                onRefresh={refreshAll}
                onExportPdf={() =>
                  exportPrognozyPdf(
                    "MIZAR_prognoza_fx.pdf",
                    "Ryzyko EUR",
                    ["Scenariusz kursu", "Kurs", "Koszt PLN", "Różnica vs bazowy"],
                    sens.map((s) => [s.deltaLabel, s.kurs, s.kosztPln, s.roznica])
                  )
                }
                onExportExcel={() =>
                  exportPrognozyExcel(
                    "MIZAR_prognoza_fx.xlsx",
                    "Ryzyko EUR",
                    ["Scenariusz", "Kurs", "Koszt PLN", "Różnica"],
                    sens.map((s) => [s.deltaLabel, s.kurs, s.kosztPln, s.roznica])
                  )
                }
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-base">Ekspozycja EUR</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      <p>
                        Niezapłacone FV (EUR): <strong>{eurEx.exposureEur.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} EUR</strong>
                      </p>
                      <p>
                        Przy kursie NBP {baseMid.toFixed(4)}: <strong>{formatPln(scenarioBaseCost, { min: 0, max: 0 })}</strong>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Źródło kursu: {eurData?.source || "—"} {eurData?.effectiveDate ? `(${eurData.effectiveDate})` : ""}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-base">Scenariusz (suwak Δ kursu PLN/EUR)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Slider
                        value={eurSliderDelta}
                        onValueChange={setEurSliderDelta}
                        min={-0.5}
                        max={0.5}
                        step={0.01}
                        className="py-2"
                      />
                      <p className="text-sm">
                        Kurs: <strong>{scenarioRate.toFixed(4)}</strong> PLN/EUR → koszt:{" "}
                        <strong>{formatPln(scenarioCost, { min: 0, max: 0 })}</strong> (
                        {scenarioDiff >= 0 ? "+" : ""}
                        {formatPln(scenarioDiff, { min: 0, max: 0 })} vs bazowy)
                      </p>
                    </CardContent>
                  </Card>
                </div>
                <motion.div {...chartMotion} className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={sens} margin={{ left: 88, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="deltaLabel" width={86} tick={{ fontSize: 9 }} />
                      <Tooltip
                        formatter={(v) => formatPln(v, { min: 0, max: 0 })}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                      />
                      <Bar dataKey="roznica" name="Wpływ na koszt PLN" radius={[0, 4, 4, 0]}>
                        {sens.map((s, i) => (
                          <Cell key={i} fill={s.worseForMizar ? "#dc2626" : "#16a34a"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </motion.div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kontrahent</TableHead>
                      <TableHead className="text-right">EUR brutto</TableHead>
                      <TableHead className="text-right">Kurs</TableHead>
                      <TableHead className="text-right">PLN</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eurEx.tableInvoices.map((r) => (
                      <TableRow key={r.numer}>
                        <TableCell className="text-sm">{kontrahenciById[r.kontrahentId] || r.kontrahentId}</TableCell>
                        <TableCell className="text-right text-sm">{r.kwotaEur.toLocaleString("pl-PL")}</TableCell>
                        <TableCell className="text-right text-sm">{r.kurs?.toFixed(4) ?? "—"}</TableCell>
                        <TableCell className="text-right text-sm">{formatPln(r.kwotaPln, { min: 0, max: 0 })}</TableCell>
                        <TableCell className="text-xs">{r.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <h3 className="text-sm font-semibold mt-4">Różnice kursowe (FV zapłacone, EUR)</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Numer</TableHead>
                      <TableHead className="text-right">Δ PLN (zapis vs brutto×kurs)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eurEx.fxDiffPaid.map((r) => (
                      <TableRow key={r.numer}>
                        <TableCell className="font-mono text-xs">{r.numer}</TableCell>
                        <TableCell className="text-right text-sm">{formatPln(r.roznicapl, { min: 0, max: 0 })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ForecastModuleChrome>
            </ForecastErrorBoundary>
          </TabsContent>

          <TabsContent value="pipeline" className="mt-4">
            <ForecastErrorBoundary moduleName="Pipeline">
              <ForecastModuleChrome
                title="MODUŁ 4 — Pipeline projektów (oferty)"
                description="Projekty w fazie „oferta” — prawdopodobieństwo wygranej i trzy scenariusze przychodu/kosztu/zysku."
                updatedAt={updatedAt}
                loading={false}
                onRefresh={refreshAll}
                onExportPdf={() =>
                  exportPrognozyPdf(
                    "MIZAR_prognoza_pipeline.pdf",
                    "Pipeline",
                    ["Oferta", "P%", "Budżet", "Zysk"],
                    pipeline.items.map((i) => [i.nazwa, i.pwin * 100, i.budzet, i.zysk])
                  )
                }
                onExportExcel={() =>
                  exportPrognozyExcel(
                    "MIZAR_prognoza_pipeline.xlsx",
                    "Pipeline",
                    ["Oferta", "P%", "Budżet", "Zysk"],
                    pipeline.items.map((i) => [i.nazwa, i.pwin * 100, i.budzet, i.zysk])
                  )
                }
              >
                <div className="grid gap-4 md:grid-cols-3">
                  {Object.values(pipeline.scenarios).map((sc) => (
                    <Card
                      key={sc.key}
                      className="border-2"
                      style={{ borderColor: sc.color + "55" }}
                    >
                      <CardHeader className="py-3">
                        <CardTitle className="text-base" style={{ color: sc.color }}>
                          {sc.label}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm space-y-1">
                        <p>Przychody: {formatPln(sc.przychody, { min: 0, max: 0 })}</p>
                        <p>Koszty: {formatPln(sc.koszty, { min: 0, max: 0 })}</p>
                        <p className="font-semibold">Zysk: {formatPln(sc.zysk, { min: 0, max: 0 })}</p>
                        <p className="text-muted-foreground text-xs">
                          Wpływ CF (śr. / mc, 12 mc): {formatPln(sc.cfMies, { min: 0, max: 0 })}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  Ważona wartość pipeline: <strong>{formatPln(pipeline.weightedPipeline, { min: 0, max: 0 })}</strong>
                </p>
                <div className="space-y-6">
                  {pipeline.items.map((item) => (
                    <div key={item.id} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{item.nazwa}</span>
                        <span>{pipelineProbs[item.id] ?? 50}%</span>
                      </div>
                      <Slider
                        value={[pipelineProbs[item.id] ?? 50]}
                        onValueChange={([v]) =>
                          setPipelineProbs((prev) => ({ ...prev, [item.id]: v }))
                        }
                        min={0}
                        max={100}
                        step={1}
                      />
                    </div>
                  ))}
                </div>
                <motion.div {...chartMotion} className="h-[260px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pipeline.scenarioCompare} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => formatPln(v, { min: 0, max: 0 })} />
                      <Legend />
                      <Bar dataKey="przychody" name="Przychody" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="koszty" name="Koszty" fill="#f97316" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="zysk" name="Zysk" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </motion.div>
                <motion.div {...chartMotion} className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={pipeline.cfLines} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => formatPln(v, { min: 0, max: 0 })} />
                      <Legend />
                      <Line type="monotone" dataKey="pes" name="CF skumulowany — pesymistyczny" stroke="#dc2626" dot={false} />
                      <Line type="monotone" dataKey="baz" name="CF skumulowany — bazowy" stroke="#2563eb" dot={false} />
                      <Line type="monotone" dataKey="opt" name="CF skumulowany — optymistyczny" stroke="#16a34a" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </motion.div>
              </ForecastModuleChrome>
            </ForecastErrorBoundary>
          </TabsContent>

          <TabsContent value="margin" className="mt-4">
            <ForecastErrorBoundary moduleName="Rentowność typów">
              <ForecastModuleChrome
                title="MODUŁ 5 — Rentowność wg typu obiektu"
                description="Agregacja projektów z mizar_data: marża planowana vs rzeczywista, regresja trendu, prognoza ±20%."
                updatedAt={updatedAt}
                loading={false}
                onRefresh={refreshAll}
                onExportPdf={() =>
                  exportPrognozyPdf(
                    "MIZAR_prognoza_typy.pdf",
                    "Rentowność typów",
                    ["Typ", "Liczba", "Wartość", "Marża plan", "Marża rzecz.", "Odchylenie"],
                    rent.rows.map((r) => [
                      r.typ,
                      r.liczbaProjektow,
                      r.wartoscLaczna,
                      r.marzaPlan,
                      r.marzaRzecz,
                      r.odchylenie,
                    ])
                  )
                }
                onExportExcel={() =>
                  exportPrognozyExcel(
                    "MIZAR_prognoza_typy.xlsx",
                    "Rentowność",
                    ["Typ", "Liczba", "Wartość", "Marża plan", "Marża rzecz.", "Odchylenie"],
                    rent.rows.map((r) => [
                      r.typ,
                      r.liczbaProjektow,
                      r.wartoscLaczna,
                      r.marzaPlan,
                      r.marzaRzecz,
                      r.odchylenie,
                    ])
                  )
                }
              >
                <motion.div {...chartMotion} className="h-[360px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 16, right: 16, bottom: 16, left: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="Wartość"
                        tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`}
                        label={{ value: "Łączna wartość projektów (PLN)", position: "bottom", offset: 0 }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name="Marża %"
                        label={{ value: "Marża rzeczywista %", angle: -90, position: "insideLeft" }}
                      />
                      <ZAxis type="number" dataKey="z" range={[80, 400]} />
                      <Tooltip
                        cursor={{ strokeDasharray: "3 3" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
                              <p className="font-semibold">{d.typ}</p>
                              <p>Wartość: {formatPln(d.x, { min: 0, max: 0 })}</p>
                              <p>Marża: {Number(d.y).toFixed(1)}%</p>
                            </div>
                          );
                        }}
                      />
                      <Scatter name="Typy" data={rent.bubbleData}>
                        {rent.bubbleData.map((e, i) => (
                          <Cell key={i} fill={e.fill} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </motion.div>
                <Card className="bg-muted/40">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Rekomendacja</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">{rent.rekomendacja}</CardContent>
                </Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Typ</TableHead>
                      <TableHead className="text-right">Projekty</TableHead>
                      <TableHead className="text-right">Wartość</TableHead>
                      <TableHead className="text-right">Marża plan</TableHead>
                      <TableHead className="text-right">Marża rzecz.</TableHead>
                      <TableHead className="text-right">Odchylenie</TableHead>
                      <TableHead>Trend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rent.rows.map((r) => (
                      <TableRow key={r.typ}>
                        <TableCell className="font-medium">{r.typ}</TableCell>
                        <TableCell className="text-right">{r.liczbaProjektow}</TableCell>
                        <TableCell className="text-right text-sm">{formatPln(r.wartoscLaczna, { min: 0, max: 0 })}</TableCell>
                        <TableCell className="text-right text-sm">{r.marzaPlan != null ? formatPct(r.marzaPlan) : "—"}</TableCell>
                        <TableCell className="text-right text-sm">{r.marzaRzecz != null ? formatPct(r.marzaRzecz) : "—"}</TableCell>
                        <TableCell
                          className={`text-right text-sm ${
                            r.odchylenie == null
                              ? ""
                              : r.odchylenie >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {r.odchylenie != null ? formatPct(r.odchylenie) : "—"}
                        </TableCell>
                        <TableCell className="text-xs capitalize">{r.trend}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <h3 className="text-sm font-semibold mt-6">Prognoza marży (12 miesięcy, scenariusze ±20%)</h3>
                <div className="space-y-6">
                  {rent.forecast12.map((block) => (
                    <div key={block.typ}>
                      <p className="text-xs font-medium mb-1">{block.typ}</p>
                      <div className="h-[140px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={block.points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="m" tick={{ fontSize: 9 }} />
                            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9 }} tickFormatter={(v) => `${v}%`} />
                            <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                            <Line type="monotone" dataKey="base" name="Bazowa" stroke="#2563eb" dot={false} strokeWidth={2} />
                            <Line type="monotone" dataKey="high" name="+20%" stroke="#16a34a" dot={false} strokeDasharray="4 4" />
                            <Line type="monotone" dataKey="low" name="−20%" stroke="#dc2626" dot={false} strokeDasharray="4 4" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ))}
                </div>
              </ForecastModuleChrome>
            </ForecastErrorBoundary>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
