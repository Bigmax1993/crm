import React, { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
  currenciesInProjectMetrics,
  costByProjectInCurrency,
  projectProfitabilityInCurrency,
  plByProjectInCurrency,
  formatCurrencyAmount,
  globalPLPln,
  budgetAlertsPln,
  getInvoicePlnAtIssue,
  projectExpensesByPeriod,
  formatProjectExpensePeriodLabel,
  projectExpenseAmountForReporting,
  openPayableInvoices,
  formatInvoiceSourceAmount,
  formatPayablesTotalsByCurrency,
  payablesKpiDisplayLines,
  getInvoiceSourceAmount,
} from "@/lib/finance-pln";
import { displayInvoiceSeller } from "@/lib/invoice-schema";
import { getProjectDisplayName, projectReportingCurrency } from "@/lib/match-project";
import { useClientEnrichedInvoices } from "@/hooks/useClientEnrichedInvoices";
import { useCurrencyDisplay } from "@/contexts/CurrencyDisplayContext";
import { format } from "date-fns";
import { AlertTriangle, TrendingUp, Wallet, Building2, RotateCcw, ClipboardList } from "lucide-react";
import { listRefundClaims, listSiteExtensions } from "@/lib/crm-entity-store";
import { PayablesReconciliation } from "@/components/finance/PayablesReconciliation";
import {
  isRefundFollowUpOverdue,
  openRefundClaims,
  refundClaimOutstanding,
  refundClaimStatusLabel,
  sumOpenRefundClaimsPln,
} from "@/lib/refund-claims";
import { projectsWithOpenLogistics } from "@/lib/project-logistics-checklist";
import { createPageUrl, constructionSitePageUrl } from "@/utils";

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

function invoicePayStatusLabel(status) {
  if (status === "overdue") return "Przeterminowano";
  return "Nieopłacono";
}

function invoicePayStatusClass(status) {
  if (status === "overdue") return "bg-red-100 text-red-800 border-red-200";
  return "bg-amber-100 text-amber-900 border-amber-200";
}

function refundStatusClass(status) {
  if (status === "otrzymano") return "bg-green-100 text-green-800 border-green-200";
  if (status === "odrzucono") return "bg-gray-100 text-gray-700 border-gray-200";
  if (status === "czesciowy") return "bg-violet-100 text-violet-900 border-violet-200";
  return "bg-amber-100 text-amber-900 border-amber-200";
}

const EXPENSE_PERIOD_LIMIT = { month: 18, quarter: 12, year: 8 };

export default function CEODashboard() {
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [expensePeriod, setExpensePeriod] = useState("month");
  const [refundClaims, setRefundClaims] = useState([]);
  const { data: invoices = [], isLoading: loadingInv } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list(),
  });
  const { data: projects = [], isLoading: loadingPr } = useQuery({
    queryKey: ["construction-sites"],
    queryFn: () => base44.entities.ConstructionSite.list(),
  });
  const { data: transfers = [] } = useQuery({
    queryKey: ["transfers"],
    queryFn: () => base44.entities.Transfer.list(),
  });
  const { data: siteExtensions = [] } = useQuery({
    queryKey: ["site-extensions"],
    queryFn: () => listSiteExtensions(),
  });

  const enriched = useClientEnrichedInvoices(invoices);
  const { formatDisplayAmount, convertPlnToDisplay, displayCurrency } = useCurrencyDisplay();
  const loading = loadingInv || loadingPr;

  useEffect(() => {
    const load = async () => {
      setRefundClaims(await listRefundClaims());
    };
    load();
    const onLocal = () => load();
    window.addEventListener("fakturowo-crm-local", onLocal);
    return () => window.removeEventListener("fakturowo-crm-local", onLocal);
  }, []);

  const refundOpen = useMemo(() => openRefundClaims(refundClaims), [refundClaims]);
  const refundOpenTotal = useMemo(() => sumOpenRefundClaimsPln(refundClaims), [refundClaims]);
  const refundOverdue = useMemo(
    () => refundOpen.filter((c) => isRefundFollowUpOverdue(c)),
    [refundOpen]
  );

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

  const projectChartsByCurrency = useMemo(() => {
    const currencies = currenciesInProjectMetrics(enriched, projects);
    return currencies.map((currency) => {
      const pieData = costByProjectInCurrency(enriched, projects, currency)
        .slice(0, 8)
        .map((x) => ({
          ...x,
          name: getProjectDisplayName(x.project),
          koszt: roundChartAmount(x.koszt),
        }));
      const top5 = [...projectProfitabilityInCurrency(enriched, projects, currency)]
        .filter((r) => r.przychody > 0 || r.koszty > 0)
        .sort((a, b) => b.wynik - a.wynik)
        .slice(0, 5);
      const top5PaidOnly = [...plByProjectInCurrency(enriched, projects, currency)]
        .filter((r) => r.przychody > 0 || r.koszty > 0)
        .sort((a, b) => b.wynik - a.wynik)
        .slice(0, 5);
      return { currency, pieData, top5, top5PaidOnly };
    });
  }, [enriched, projects]);

  const bAlerts = useMemo(() => budgetAlertsPln(projects, enriched, 0.8), [projects, enriched]);
  const overdue = useMemo(() => overdueInvoices(enriched), [enriched]);
  const overduePlnSum = useMemo(
    () => overdue.reduce((s, i) => s + (getInvoicePlnAtIssue(i) ?? 0), 0),
    [overdue]
  );

  const payablesOpen = useMemo(() => openPayableInvoices(enriched), [enriched]);
  const payablesOpenTotalPln = useMemo(
    () => payablesOpen.reduce((s, i) => s + (getInvoicePlnAtIssue(i) ?? 0), 0),
    [payablesOpen]
  );
  const payablesOpenTotalByCurrency = useMemo(
    () => formatPayablesTotalsByCurrency(payablesOpen),
    [payablesOpen]
  );
  const payablesKpiLines = useMemo(() => payablesKpiDisplayLines(payablesOpen), [payablesOpen]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

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
    const projectHasPurchaseInvoices = (p) =>
      enriched.some((inv) => {
        if (inv.project_id !== p.id || inv.invoice_type === "sales") return false;
        const cur = projectReportingCurrency(p) || "PLN";
        return projectExpenseAmountForReporting(inv, cur) != null;
      });
    const withCosts = projectsSorted.find(projectHasPurchaseInvoices);
    setSelectedProjectId((withCosts || projectsSorted[0]).id);
  }, [projectsSorted, enriched, selectedProjectId]);

  const selectedProject = projectsSorted.find((p) => p.id === selectedProjectId);
  const selectedProjectReportingCurrency = selectedProject
    ? projectReportingCurrency(selectedProject) || "PLN"
    : "PLN";

  const projectExpenseChart = useMemo(() => {
    if (!selectedProjectId || !selectedProject) return [];
    const limit = EXPENSE_PERIOD_LIMIT[expensePeriod] ?? 18;
    return projectExpensesByPeriod(enriched, selectedProjectId, expensePeriod, selectedProject)
      .slice(-limit)
      .map((r) => ({
        period: r.period,
        label: formatProjectExpensePeriodLabel(r.period, expensePeriod),
        wydatki: r.wydatki,
        currency: r.currency || selectedProjectReportingCurrency,
      }));
  }, [enriched, selectedProjectId, selectedProject, expensePeriod, selectedProjectReportingCurrency]);

  const projectsWithCostsElsewhere = useMemo(() => {
    if (!selectedProjectId || projectExpenseChart.length > 0) return [];
    return projectsSorted
      .filter((p) => p.id !== selectedProjectId)
      .filter((p) => {
        const cur = projectReportingCurrency(p) || "PLN";
        return enriched.some(
          (inv) =>
            inv.project_id === p.id &&
            inv.invoice_type !== "sales" &&
            projectExpenseAmountForReporting(inv, cur) != null
        );
      })
      .map((p) => {
        const cur = projectReportingCurrency(p) || "PLN";
        const total = enriched
          .filter((inv) => inv.project_id === p.id && inv.invoice_type !== "sales")
          .reduce((s, inv) => s + (projectExpenseAmountForReporting(inv, cur) ?? 0), 0);
        return { project: p, total, currency: cur };
      });
  }, [projectsSorted, enriched, selectedProjectId, projectExpenseChart.length]);
  const projectExpenseTotal = useMemo(
    () => projectExpenseChart.reduce((s, r) => s + r.wydatki, 0),
    [projectExpenseChart]
  );

  const logisticsOpenByProject = useMemo(
    () => projectsWithOpenLogistics({ projects, siteExtensions }),
    [projects, siteExtensions]
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

        {(bAlerts.length > 0 || overdue.length > 0 || refundOverdue.length > 0 || logisticsOpenByProject.length > 0) && (
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
            {refundOverdue.length > 0 && (
              <Alert>
                <RotateCcw className="h-4 w-4" />
                <AlertTitle>Zwroty po terminie follow-up</AlertTitle>
                <AlertDescription>
                  {refundOverdue.length} spraw wymaga kontaktu z dostawcą (łącznie do odzyskania ok.{" "}
                  {refundOpenTotal.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN).
                </AlertDescription>
              </Alert>
            )}
            {logisticsOpenByProject.length > 0 && (
              <Alert className="md:col-span-2 border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
                <ClipboardList className="h-4 w-4" />
                <AlertTitle>
                  Logistyka do załatwienia ({logisticsOpenByProject.reduce((s, r) => s + r.openItems.length, 0)} poz.)
                </AlertTitle>
                <AlertDescription>
                  {logisticsOpenByProject.length} projekt(ów) z otwartą checklistą (cement / piasek / płytki / Radlader).
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { title: "Suma należności", value: kpis.naleznosci, icon: Wallet },
            { title: "Suma zobowiązań", lines: payablesKpiLines, icon: TrendingUp },
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
                  {k.lines ? (
                    <div className="space-y-1">
                      {k.lines.map((line, idx) => (
                        <div
                          key={idx}
                          className={idx === 0 ? "text-2xl font-bold leading-tight" : "text-sm font-medium text-muted-foreground"}
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-2xl font-bold">
                      {k.format === "int" ? k.value : formatDisplayAmount(k.value)}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {logisticsOpenByProject.length > 0 && (
          <Card className="border-amber-200 shadow-md">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ClipboardList className="h-5 w-5 text-amber-700" />
                    Logistyka do załatwienia
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Nieodhaczone pozycje checklisty (cement PL→DE, piasek, płytki, Radlader) przy projektach.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="border-amber-400 text-amber-900 bg-amber-50">
                  {logisticsOpenByProject.reduce((s, r) => s + r.openItems.length, 0)} otwartych
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {logisticsOpenByProject.map(({ project, openItems, progress, cement_load_date, cement_unload_date }) => (
                <div
                  key={project.id}
                  className="rounded-lg border border-amber-200/80 bg-amber-50/40 dark:bg-amber-950/10 p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-foreground">{getProjectDisplayName(project)}</p>
                      {(cement_load_date || cement_unload_date) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {cement_load_date ? `Załadunek: ${cement_load_date}` : null}
                          {cement_load_date && cement_unload_date ? " · " : null}
                          {cement_unload_date ? `Rozładunek: ${cement_unload_date}` : null}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{progress.label}</Badge>
                      <Button asChild variant="outline" size="sm">
                        <Link to={constructionSitePageUrl(project.id)}>Otwórz projekt</Link>
                      </Button>
                    </div>
                  </div>
                  <ul className="space-y-1.5">
                    {openItems.map((item) => (
                      <li key={item.id} className="text-sm flex gap-2">
                        <span className="text-amber-700 shrink-0">•</span>
                        <span>
                          <span className="text-muted-foreground text-xs uppercase tracking-wide mr-1">
                            {item.sectionTitle}:
                          </span>
                          {item.label}
                          {item.comment ? (
                            <span className="block text-xs text-muted-foreground mt-0.5">{item.comment}</span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Faktury do zapłaty</CardTitle>
            <CardDescription className="text-xs">
              {financeMetricSummary("payablesOpenPln")} Łącznie (waluta FV):{" "}
              <span className="font-semibold text-foreground">{payablesOpenTotalByCurrency}</span>
              {payablesOpenTotalPln > 0 && payablesOpen.some((i) => String(i.currency || "PLN").toUpperCase() !== "PLN") ? (
                <span className="text-muted-foreground">
                  {" "}
                  · szac. {formatDisplayAmount(payablesOpenTotalPln)} PLN (NBP)
                </span>
              ) : null}
              {payablesOpen.length ? ` · ${payablesOpen.length} poz.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {payablesOpen.length === 0 ? (
              <p className="text-muted-foreground text-sm p-6">Brak nieopłaconych faktur zakupowych.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Numer FV</TableHead>
                      <TableHead>Dostawca</TableHead>
                      <TableHead>Projekt</TableHead>
                      <TableHead>Wystawienie</TableHead>
                      <TableHead>Termin płatności</TableHead>
                      <TableHead className="text-right">Kwota</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payablesOpen.map((inv) => {
                      const pln = getInvoicePlnAtIssue(inv);
                      const project = inv.project_id ? projectById.get(inv.project_id) : null;
                      const src = getInvoiceSourceAmount(inv);
                      const plnHint =
                        src && src.currency !== "PLN" && pln != null
                          ? `Szac. ${pln.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN (NBP)`
                          : undefined;
                      return (
                        <TableRow key={inv.id || `${inv.invoice_number}-${inv.issue_date}`}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {inv.invoice_number || "—"}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {displayInvoiceSeller(inv) || inv.contractor_name || "—"}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {project ? getProjectDisplayName(project) : "—"}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {inv.issue_date ? String(inv.issue_date).slice(0, 10) : "—"}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {inv.payment_deadline ? String(inv.payment_deadline).slice(0, 10) : "—"}
                          </TableCell>
                          <TableCell
                            className="text-right font-medium whitespace-nowrap"
                            title={plnHint}
                          >
                            {formatInvoiceSourceAmount(inv)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={invoicePayStatusClass(inv.status)}>
                              {invoicePayStatusLabel(inv.status)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
          <PayablesReconciliation
            payablesOpen={payablesOpen}
            transfers={transfers}
            projectById={projectById}
          />
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-primary" />
                Zwroty do odzyskania
              </CardTitle>
              <CardDescription className="text-xs">
                Oczekiwane zwroty po rezygnacji z materiału lub usługi. Łącznie:{" "}
                <span className="font-semibold text-foreground">
                  {refundOpenTotal.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN
                </span>
                {refundOpen.length ? ` · ${refundOpen.length} otwartych` : ""}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to={createPageUrl("ExpectedRefunds")}>Zarządzaj</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {refundOpen.length === 0 ? (
              <p className="text-muted-foreground text-sm p-6">
                Brak otwartych zwrotów.{" "}
                <Link to={createPageUrl("ExpectedRefunds")} className="text-primary underline">
                  Dodaj ręcznie
                </Link>{" "}
                lub wgraj potwierdzenie wpływu na stronie Oczekiwane zwroty.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dostawca</TableHead>
                      <TableHead>Projekt</TableHead>
                      <TableHead>FV / materiał</TableHead>
                      <TableHead>Follow-up</TableHead>
                      <TableHead className="text-right">Pozostało</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {refundOpen.slice(0, 12).map((c) => {
                      const project = c.project_id ? projectById.get(c.project_id) : null;
                      const overdue = isRefundFollowUpOverdue(c);
                      const left = refundClaimOutstanding(c);
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium whitespace-nowrap">{c.supplier_name}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {project ? getProjectDisplayName(project) : "—"}
                          </TableCell>
                          <TableCell className="text-sm max-w-[180px]">
                            <div>{c.invoice_number || "—"}</div>
                            {c.material_description && (
                              <div className="text-xs text-muted-foreground truncate">{c.material_description}</div>
                            )}
                          </TableCell>
                          <TableCell className={`text-sm whitespace-nowrap ${overdue ? "text-red-600 font-medium" : ""}`}>
                            {c.follow_up_date ? String(c.follow_up_date).slice(0, 10) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                            {left.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} {c.currency || "PLN"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={refundStatusClass(c.status)}>
                              {refundClaimStatusLabel(c.status)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

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

        {projectChartsByCurrency.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Koszty wg projektu</CardTitle>
              <CardDescription className="text-xs">{financeMetricSummary("projectCostAccruedPln")}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Brak kosztów przypisanych do projektów.</p>
            </CardContent>
          </Card>
        ) : (
          projectChartsByCurrency.map(({ currency, pieData, top5, top5PaidOnly }) => (
            <div key={currency} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Koszty wg projektu ({currency})</CardTitle>
                  <CardDescription className="text-xs">
                    Zakupy z project_id w {currency}; kwota z FV; bez wymogu zapłaty.
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-80">
                  {pieData.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Brak kosztów w {currency}.</p>
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
                        <Tooltip formatter={(v) => formatCurrencyAmount(v, currency)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>5 najlepszych projektów wg rentowności ({currency})</CardTitle>
                    <CardDescription className="text-xs">
                      Przychód = opłacona sprzedaż; koszty = wszystkie zakupy — tylko FV w {currency}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {top5.map((row, idx) => (
                        <div key={row.project.id || idx} className="flex justify-between items-center border-b border-border pb-2">
                          <div>
                            <p className="font-medium">{getProjectDisplayName(row.project)}</p>
                            <p className="text-xs text-muted-foreground">
                              Marża: {row.marza != null ? `${row.marza.toFixed(1)}%` : "—"}
                            </p>
                          </div>
                          <div className="text-right font-semibold">{formatCurrencyAmount(row.wynik, currency)}</div>
                        </div>
                      ))}
                      {top5.length === 0 && <p className="text-muted-foreground text-sm">Brak danych.</p>}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>5 najlepszych — tylko opłacone FV ({currency})</CardTitle>
                    <CardDescription className="text-xs">
                      Tylko opłacone FV z project_id w {currency}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {top5PaidOnly.map((row, idx) => {
                        const marza = row.marzaPct ?? row.marza;
                        return (
                          <div key={`p-${row.project.id || idx}`} className="flex justify-between items-center border-b border-border pb-2">
                            <div>
                              <p className="font-medium">{getProjectDisplayName(row.project)}</p>
                              <p className="text-xs text-muted-foreground">
                                Marża: {marza != null ? `${marza.toFixed(1)}%` : "—"}
                              </p>
                            </div>
                            <div className="text-right font-semibold">{formatCurrencyAmount(row.wynik, currency)}</div>
                          </div>
                        );
                      })}
                      {top5PaidOnly.length === 0 && <p className="text-muted-foreground text-sm">Brak danych.</p>}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ))
        )}

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
                    {formatCurrencyAmount(projectExpenseTotal, selectedProjectReportingCurrency)}
                  </span>
                </p>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="h-80">
            {!selectedProjectId ? (
              <p className="text-muted-foreground text-sm">Brak projektów — dodaj obiekty, aby zobaczyć wydatki.</p>
            ) : projectExpenseChart.length === 0 ? (
              <div className="text-muted-foreground text-sm space-y-2">
                <p>
                  Brak wydatków (FV zakupowych) przypisanych do „{getProjectDisplayName(selectedProject)}”.
                </p>
                {projectsWithCostsElsewhere.length > 0 ? (
                  <p className="text-xs">
                    Koszty są przypisane do innych projektów:{" "}
                    {projectsWithCostsElsewhere.map(({ project, total, currency }, i) => (
                      <span key={project.id}>
                        {i > 0 ? "; " : ""}
                        <button
                          type="button"
                          className="text-primary underline-offset-2 hover:underline font-medium"
                          onClick={() => setSelectedProjectId(project.id)}
                        >
                          {getProjectDisplayName(project)}
                        </button>
                        {total > 0 ? ` (${formatCurrencyAmount(total, currency)})` : ""}
                      </span>
                    ))}
                    . Sprawdź przypisanie FV w module Faktury lub scal duplikaty obiektów w Budowie.
                  </p>
                ) : null}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectExpenseChart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v) =>
                      formatCurrencyAmount(v, projectExpenseChart[0]?.currency || selectedProjectReportingCurrency)
                    }
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
