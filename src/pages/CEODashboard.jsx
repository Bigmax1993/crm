import React, { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { financeMetricSummary } from "@/lib/finance-metric-definitions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { overdueInvoices, activeProjectsCount } from "@/lib/finance";
import {
  sumReceivablesPln,
  sumPayablesPln,
  monthlyRevenueVsCostPln,
  monthlyCashFlowPaidPln,
  costByProjectPln,
  projectProfitabilityPln,
  plByProjectPln,
  globalPLPln,
  budgetAlertsPln,
  getInvoicePlnAtIssue,
  projectExpensesByPeriodPln,
  formatProjectExpensePeriodLabel,
} from "@/lib/finance-pln";
import { getProjectDisplayName } from "@/lib/match-project";
import { useClientEnrichedInvoices } from "@/hooks/useClientEnrichedInvoices";
import { useCurrencyDisplay } from "@/contexts/CurrencyDisplayContext";
import { format } from "date-fns";
import { AlertTriangle, TrendingUp, Wallet, Building2 } from "lucide-react";

const PIE_COLORS = ["#1F4E79", "#2E75B6", "#5B9BD5", "#9DC3E6", "#ED7D31", "#FFC000", "#70AD47"];

function formatChartAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("pl-PL", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

function roundChartAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

const EXPENSE_PERIOD_LIMIT = { month: 18, quarter: 12, year: 8 };

export default function CEODashboard() {
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [expensePeriod, setExpensePeriod] = useState("month");
  const { data: invoices = [], isLoading: loadingInv } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list(),
  });
  const { data: projects = [], isLoading: loadingPr } = useQuery({
    queryKey: ["construction-sites"],
    queryFn: () => base44.entities.ConstructionSite.list(),
  });

  const enriched = useClientEnrichedInvoices(invoices);
  const { formatDisplayAmount, convertPlnToDisplay, displayCurrency } = useCurrencyDisplay();
  const loading = loadingInv || loadingPr;

  const kpis = useMemo(() => {
    const naleznosci = sumReceivablesPln(enriched);
    const zobowiazania = sumPayablesPln(enriched);
    const { brutto: wynikNetto } = globalPLPln(enriched);
    return {
      naleznosci,
      zobowiazania,
      wynikNetto,
      active: activeProjectsCount(projects),
    };
  }, [enriched, projects]);

  const revCost = useMemo(() => {
    return monthlyRevenueVsCostPln(enriched)
      .slice(-12)
      .map((r) => ({
        month: r.month,
        przychody: convertPlnToDisplay(r.przychody),
        koszty: convertPlnToDisplay(r.koszty),
      }));
  }, [enriched, convertPlnToDisplay]);

  const cashCum = useMemo(() => {
    return monthlyCashFlowPaidPln(enriched)
      .slice(-14)
      .map((r) => ({
        month: r.month,
        saldoNarastajace: convertPlnToDisplay(r.saldoNarastajace),
      }));
  }, [enriched, convertPlnToDisplay]);

  const pieData = useMemo(() => {
    return costByProjectPln(enriched, projects)
      .slice(0, 8)
      .map((x) => ({
        ...x,
        koszt: roundChartAmount(convertPlnToDisplay(x.koszt)),
      }));
  }, [enriched, projects, convertPlnToDisplay]);

  const top5 = useMemo(() => {
    return [...projectProfitabilityPln(enriched, projects)]
      .sort((a, b) => b.wynik - a.wynik)
      .slice(0, 5)
      .map((row) => ({
        ...row,
        wynikDisp: convertPlnToDisplay(row.wynik),
      }));
  }, [enriched, projects, convertPlnToDisplay]);

  const top5PaidOnly = useMemo(() => {
    return [...plByProjectPln(enriched, projects)]
      .filter((r) => r.przychody > 0 || r.koszty > 0)
      .sort((a, b) => b.wynik - a.wynik)
      .slice(0, 5)
      .map((row) => ({
        ...row,
        wynikDisp: convertPlnToDisplay(row.wynik),
      }));
  }, [enriched, projects, convertPlnToDisplay]);

  const bAlerts = useMemo(() => budgetAlertsPln(projects, enriched, 0.8), [projects, enriched]);
  const overdue = useMemo(() => overdueInvoices(enriched), [enriched]);
  const overduePlnSum = useMemo(
    () => overdue.reduce((s, i) => s + (getInvoicePlnAtIssue(i) ?? 0), 0),
    [overdue]
  );

  const projectsSorted = useMemo(
    () =>
      [...projects].sort((a, b) =>
        getProjectDisplayName(a).localeCompare(getProjectDisplayName(b), "pl")
      ),
    [projects]
  );

  useEffect(() => {
    if (!projectsSorted.length) {
      setSelectedProjectId("");
      return;
    }
    if (selectedProjectId && projectsSorted.some((p) => p.id === selectedProjectId)) return;
    const withCosts = projectsSorted.find((p) =>
      enriched.some(
        (inv) => inv.project_id === p.id && inv.invoice_type !== "sales" && getInvoicePlnAtIssue(inv) != null
      )
    );
    setSelectedProjectId((withCosts || projectsSorted[0]).id);
  }, [projectsSorted, enriched, selectedProjectId]);

  const projectExpenseChart = useMemo(() => {
    if (!selectedProjectId) return [];
    const limit = EXPENSE_PERIOD_LIMIT[expensePeriod] ?? 18;
    return projectExpensesByPeriodPln(enriched, selectedProjectId, expensePeriod)
      .slice(-limit)
      .map((r) => ({
        period: r.period,
        label: formatProjectExpensePeriodLabel(r.period, expensePeriod),
        wydatki: convertPlnToDisplay(r.wydatki),
        wydatkiPln: r.wydatki,
      }));
  }, [enriched, selectedProjectId, expensePeriod, convertPlnToDisplay]);

  const selectedProject = projectsSorted.find((p) => p.id === selectedProjectId);
  const projectExpenseTotal = useMemo(
    () => projectExpenseChart.reduce((s, r) => s + r.wydatkiPln, 0),
    [projectExpenseChart]
  );

  if (loading) {
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
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">Pulpit CEO</h1>
          <p className="text-muted-foreground mt-1">Podsumowanie finansowe i operacyjne</p>
          <p className="text-xs text-muted-foreground mt-2 max-w-3xl">
            KPI u góry: należności i zobowiązania — FV otwarte (PLN wg wystawienia); wynik — tylko opłacone FV (PLN jak cash
            flow). Wykresy mają krótszą definicję pod tytułem karty.
          </p>
        </motion.div>

        {(bAlerts.length > 0 || overdue.length > 0) && (
          <div className="grid gap-3 md:grid-cols-2">
            {bAlerts.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Przekroczenie budżetu (≥80%)</AlertTitle>
                <AlertDescription>
                  {bAlerts.map((a) => (
                    <div key={a.project.id}>
                      {a.project.object_name || a.project.city}: {(a.ratio * 100).toFixed(0)}% budżetu (
                      {a.cost.toLocaleString("pl-PL")} / {a.budget.toLocaleString("pl-PL")} PLN, koszt wg NBP)
                    </div>
                  ))}
                </AlertDescription>
              </Alert>
            )}
            {overdue.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Faktury przeterminowane</AlertTitle>
                <AlertDescription>
                  {overdue.length} faktur po terminie płatności (łącznie ok.{" "}
                  {formatDisplayAmount(overduePlnSum)} w widoku {displayCurrency}, wartość PLN wg NBP).
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { title: "Suma należności", value: kpis.naleznosci, icon: Wallet },
            { title: "Suma zobowiązań", value: kpis.zobowiazania, icon: TrendingUp },
            { title: "Wynik netto (FV zapłacone)", value: kpis.wynikNetto, icon: TrendingUp },
            { title: "Aktywne projekty", value: kpis.active, icon: Building2, format: "int" },
          ].map((k, i) => (
            <motion.div key={k.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="border shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{k.title}</CardTitle>
                  <k.icon className="h-5 w-5 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {k.format === "int" ? k.value : formatDisplayAmount(k.value)}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Przychody vs koszty (miesiąc)</CardTitle>
              <CardDescription className="text-xs">{financeMetricSummary("revenueCostMonthlyAccrualPln")}</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revCost}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `${Number(v).toLocaleString("pl-PL")} ${displayCurrency}`} />
                  <Legend />
                  <Bar dataKey="przychody" name="Przychody" fill="#2E75B6" />
                  <Bar dataKey="koszty" name="Koszty" fill="#ED7D31" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Przepływy pieniężne narastająco</CardTitle>
              <CardDescription className="text-xs">{financeMetricSummary("cashflowMonthlyPaidPln")}</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cashCum}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `${Number(v).toLocaleString("pl-PL")} ${displayCurrency}`} />
                  <Legend />
                  <Line type="monotone" dataKey="saldoNarastajace" name="Saldo narastające" stroke="#1F4E79" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Koszty wg projektu</CardTitle>
              <CardDescription className="text-xs">{financeMetricSummary("projectCostAccruedPln")}</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              {pieData.length === 0 ? (
                <p className="text-muted-foreground text-sm">Brak kosztów przypisanych do projektów.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="koszt"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, value }) => `${name}: ${formatChartAmount(value)}`}
                    >
                      {pieData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `${formatChartAmount(v)} ${displayCurrency}`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>5 najlepszych projektów wg rentowności</CardTitle>
                <CardDescription className="text-xs">{financeMetricSummary("projectProfitabilityMixedPln")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {top5.map((row, idx) => (
                    <div key={row.project.id || idx} className="flex justify-between items-center border-b border-border pb-2">
                      <div>
                        <p className="font-medium">{row.project.object_name || row.project.city}</p>
                        <p className="text-xs text-muted-foreground">
                          Marża: {row.marza != null ? `${row.marza.toFixed(1)}%` : "—"}
                        </p>
                      </div>
                      <div className="text-right font-semibold">
                        {row.wynikDisp.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} {displayCurrency}
                      </div>
                    </div>
                  ))}
                  {top5.length === 0 && <p className="text-muted-foreground text-sm">Brak danych.</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>5 najlepszych — tylko opłacone FV</CardTitle>
                <CardDescription className="text-xs">{financeMetricSummary("resultByProjectPaidPln")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {top5PaidOnly.map((row, idx) => (
                    <div key={`p-${row.project.id || idx}`} className="flex justify-between items-center border-b border-border pb-2">
                      <div>
                        <p className="font-medium">{row.project.object_name || row.project.city}</p>
                        <p className="text-xs text-muted-foreground">
                          Marża: {row.marza != null ? `${row.marza.toFixed(1)}%` : "—"}
                        </p>
                      </div>
                      <div className="text-right font-semibold">
                        {row.wynikDisp.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} {displayCurrency}
                      </div>
                    </div>
                  ))}
                  {top5PaidOnly.length === 0 && <p className="text-muted-foreground text-sm">Brak danych.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-1">
              <CardTitle>Wydatki według projektu</CardTitle>
              <CardDescription className="text-xs">
                {financeMetricSummary("projectExpensesByPeriodPln")}
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-end">
              <div className="w-full sm:min-w-[240px] sm:flex-1 space-y-2">
                <Label>Projekt (rynek)</Label>
                <Select
                  value={selectedProjectId || "none"}
                  onValueChange={(v) => setSelectedProjectId(v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz projekt" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectsSorted.length === 0 ? (
                      <SelectItem value="none" disabled>
                        Brak projektów
                      </SelectItem>
                    ) : (
                      projectsSorted.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {getProjectDisplayName(p)}
                          {p.city ? ` · ${p.city}` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[200px] space-y-2">
                <Label>Okres</Label>
                <Select value={expensePeriod} onValueChange={setExpensePeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Miesiąc</SelectItem>
                    <SelectItem value="quarter">Kwartał</SelectItem>
                    <SelectItem value="year">Rok</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {selectedProject && projectExpenseChart.length > 0 ? (
                <p className="text-sm text-muted-foreground sm:ml-auto pb-2">
                  Suma na wykresie:{" "}
                  <span className="font-semibold text-foreground">
                    {formatDisplayAmount(projectExpenseTotal)} {displayCurrency}
                  </span>
                </p>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="h-80">
            {!selectedProjectId ? (
              <p className="text-muted-foreground text-sm">Dodaj projekt w module Budowa, aby zobaczyć wydatki.</p>
            ) : projectExpenseChart.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Brak wydatków (FV zakupowych) przypisanych do „{getProjectDisplayName(selectedProject)}”.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectExpenseChart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v) => `${Number(v).toLocaleString("pl-PL")} ${displayCurrency}`}
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload;
                      return row ? `${row.label} (${row.period})` : "";
                    }}
                  />
                  <Legend />
                  <Bar dataKey="wydatki" name="Wydatki" fill="#ED7D31" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          Wygenerowano: {format(new Date(), "yyyy-MM-dd HH:mm")}
        </p>
      </div>
    </div>
  );
}
