import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { financeMetricSummary } from "@/lib/finance-metric-definitions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  sumReceivablesPln,
  sumPayablesPln,
  monthlyCashFlowPaidPln,
  globalPLPln,
  foreignExposureRatio,
} from "@/lib/finance-pln";
import { useClientEnrichedInvoices } from "@/hooks/useClientEnrichedInvoices";
import { useCurrencyDisplay } from "@/contexts/CurrencyDisplayContext";
import { getNbpLatestTableA, getNbpTableAForBusinessDay, getMidFromTable } from "@/lib/nbp-rates";
import { loadFxConfig } from "@/lib/fx-config-store";
import { format, subDays } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";

export default function MultiCurrencyDashboard() {
  const [chartDisplay, setChartDisplay] = useState("PLN");
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list(),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["construction-sites"],
    queryFn: () => base44.entities.ConstructionSite.list(),
  });
  const { data: latest } = useQuery({
    queryKey: ["nbp", "latest-table"],
    queryFn: getNbpLatestTableA,
    staleTime: 1000 * 60 * 60 * 6,
  });
  const { data: prevTable } = useQuery({
    queryKey: ["nbp", "prev-compare", latest?.effectiveDate],
    queryFn: async () => {
      if (!latest?.effectiveDate) return null;
      const d = subDays(new Date(latest.effectiveDate + "T12:00:00"), 1);
      return getNbpTableAForBusinessDay(format(d, "yyyy-MM-dd"));
    },
    enabled: !!latest?.effectiveDate,
  });

  const enriched = useClientEnrichedInvoices(invoices);
  const { formatDisplayAmount, convertPlnToDisplay, mids, displayCurrency } = useCurrencyDisplay();

  const convertForChart = (pln) => {
    if (chartDisplay === "PLN") return pln;
    const mid = latest?.rates?.[chartDisplay] || mids[chartDisplay];
    if (!mid) return pln;
    return pln / mid;
  };

  const kpis = useMemo(() => {
    const n = sumReceivablesPln(enriched);
    const z = sumPayablesPln(enriched);
    const { brutto } = globalPLPln(enriched);
    return { naleznosci: n, zobowiazania: z, wynik: brutto, fxShare: foreignExposureRatio(enriched) };
  }, [enriched]);

  const cashRows = useMemo(() => monthlyCashFlowPaidPln(enriched).slice(-14), [enriched]);
  const chartData = useMemo(() => {
    const cv = (pln) => {
      if (chartDisplay === "PLN") return pln;
      const mid = latest?.rates?.[chartDisplay] || mids[chartDisplay];
      return mid ? pln / mid : pln;
    };
    return cashRows.map((r) => ({
      ...r,
      wplywyD: cv(r.wplywy),
      wydatkiD: cv(r.wydatki),
      saldoNarD: cv(r.saldoNarastajace),
    }));
  }, [cashRows, chartDisplay, mids, latest?.rates]);

  const activeCodes = useMemo(() => {
    const cfg = loadFxConfig();
    const all = Object.keys(latest?.rates || {}).filter((c) => c !== "PLN");
    const act = new Set(cfg.activeCurrencies || []);
    return all.filter((c) => act.has(c)).slice(0, 24);
  }, [latest]);

  const rateRows = useMemo(() => {
    return activeCodes.map((code) => {
      const cur = getMidFromTable(latest, code);
      const prev = getMidFromTable(prevTable, code);
      const delta = cur != null && prev != null ? cur - prev : null;
      const pct = cur && prev && prev !== 0 ? ((cur - prev) / prev) * 100 : null;
      return { code, cur, prev, delta, pct };
    });
  }, [activeCodes, latest, prevTable]);

  const fxDiffRows = useMemo(() => {
    return enriched.filter(
      (i) =>
        i.fx_difference_pln != null &&
        Number.isFinite(Number(i.fx_difference_pln)) &&
        (i.currency || "PLN").toUpperCase() !== "PLN"
    );
  }, [enriched]);

  const fxByProject = useMemo(() => {
    const m = {};
    for (const r of fxDiffRows) {
      const pid = r.project_id || "_";
      if (!m[pid]) m[pid] = { sum: 0, byCur: {}, label: "" };
      const c = (r.currency || "").toUpperCase();
      const d = Number(r.fx_difference_pln);
      m[pid].sum += d;
      m[pid].byCur[c] = (m[pid].byCur[c] || 0) + d;
    }
    for (const pid of Object.keys(m)) {
      if (pid === "_") m[pid].label = "Bez projektu";
      else {
        const p = projects.find((x) => x.id === pid);
        m[pid].label = p?.object_name || p?.city || pid;
      }
    }
    return m;
  }, [fxDiffRows, projects]);

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
          <h1 className="text-3xl md:text-4xl font-bold">Dashboard wielowalutowy</h1>
          <p className="text-muted-foreground mt-1">
            Kursy NBP, KPI w walucie widoku ({displayCurrency}), cash flow PLN z przełącznikiem wykresu
          </p>
          <p className="text-xs text-muted-foreground mt-2 max-w-3xl">
            {financeMetricSummary("receivablesOpenPln")} {financeMetricSummary("resultGlobalPaidPln")}
          </p>
        </motion.div>

        {kpis.fxShare > 0.2 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Ryzyko walutowe</AlertTitle>
            <AlertDescription>
              Ponad 20% faktur jest w walutach obcych ({(kpis.fxShare * 100).toFixed(1)}%). Rozważ zabezpieczenia FX.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Należności (PLN wg NBP)</CardTitle>
              <CardDescription className="text-[11px] leading-snug">{financeMetricSummary("receivablesOpenPln")}</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{formatDisplayAmount(kpis.naleznosci)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Zobowiązania (PLN wg NBP)</CardTitle>
              <CardDescription className="text-[11px] leading-snug">{financeMetricSummary("payablesOpenPln")}</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{formatDisplayAmount(kpis.zobowiazania)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Wynik (zapłacone, PLN)</CardTitle>
              <CardDescription className="text-[11px] leading-snug">{financeMetricSummary("resultGlobalPaidPln")}</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{formatDisplayAmount(kpis.wynik)}</CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle>Cash flow (wartości w PLN, skorygowane o kurs płatności)</CardTitle>
              <CardDescription className="text-xs mt-1">{financeMetricSummary("cashflowMonthlyPaidPln")}</CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Skala wykresu</span>
              <Select value={chartDisplay} onValueChange={setChartDisplay}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLN">PLN</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v) =>
                    `${Number(v).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} ${chartDisplay}`
                  }
                />
                <Legend />
                <Bar dataKey="wplywyD" name="Wpływy" fill="#2E75B6" />
                <Bar dataKey="wydatkiD" name="Wydatki" fill="#C55A11" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Tabs defaultValue="rates">
          <TabsList>
            <TabsTrigger value="rates">Kursy NBP</TabsTrigger>
            <TabsTrigger value="fxdiff">Różnice kursowe</TabsTrigger>
          </TabsList>
          <TabsContent value="rates">
            <Card>
              <CardHeader>
                <CardTitle>
                  Tabela A — dzień {latest?.effectiveDate || "—"} (vs porównanie dzień wcześniejszy)
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Waluta</TableHead>
                      <TableHead className="text-right">Kurs (PLN)</TableHead>
                      <TableHead className="text-right">Poprzedni</TableHead>
                      <TableHead className="text-right">Zmiana</TableHead>
                      <TableHead className="text-right">Trend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rateRows.map((r) => (
                      <TableRow key={r.code}>
                        <TableCell className="font-medium">{r.code}</TableCell>
                        <TableCell className="text-right">{r.cur != null ? r.cur.toFixed(4) : "—"}</TableCell>
                        <TableCell className="text-right">{r.prev != null ? r.prev.toFixed(4) : "—"}</TableCell>
                        <TableCell className="text-right">
                          {r.delta != null ? r.delta.toFixed(4) : "—"}
                          {r.pct != null && <span className="text-muted-foreground text-xs ml-1">({r.pct.toFixed(2)}%)</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.delta == null ? (
                            "—"
                          ) : r.delta > 0 ? (
                            <TrendingUp className="h-4 w-4 text-amber-600 inline" />
                          ) : r.delta < 0 ? (
                            <TrendingDown className="h-4 w-4 text-emerald-600 inline" />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {rateRows.length === 0 && <p className="text-sm text-muted-foreground">Brak danych NBP lub wyłączonych walut w ustawieniach.</p>}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="fxdiff">
            <Card>
              <CardHeader>
                <CardTitle>Różnice kursowe (zapłata vs wystawienie)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nr FV</TableHead>
                      <TableHead>Projekt</TableHead>
                      <TableHead>Waluta</TableHead>
                      <TableHead className="text-right">Różnica PLN</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fxDiffRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.invoice_number}</TableCell>
                        <TableCell>
                          {r.project_id
                            ? projects.find((p) => p.id === r.project_id)?.object_name || r.project_id
                            : "—"}
                        </TableCell>
                        <TableCell>{r.currency}</TableCell>
                        <TableCell className="text-right font-medium">
                          {Number(r.fx_difference_pln).toLocaleString("pl-PL", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div>
                  <h3 className="font-semibold mb-2">Podsumowanie per projekt (PLN)</h3>
                  <Table>
                    <TableBody>
                      {Object.entries(fxByProject).map(([pid, v]) => (
                        <TableRow key={pid}>
                          <TableCell>{v.label}</TableCell>
                          <TableCell className="text-right">{v.sum.toLocaleString("pl-PL", { minimumFractionDigits: 2 })}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
