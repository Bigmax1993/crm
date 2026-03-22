import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { overdueInvoices, activeProjectsCount } from "@/lib/mizar-finance";
import {
  sumReceivablesPln,
  sumPayablesPln,
  monthlyRevenueVsCostPln,
  monthlyCashFlowPaidPln,
  costByProjectPln,
  projectProfitabilityPln,
  globalPLPln,
  budgetAlertsPln,
  getInvoicePlnAtIssue,
} from "@/lib/mizar-finance-pln";
import { useClientEnrichedInvoices } from "@/hooks/useClientEnrichedInvoices";
import { useCurrencyDisplay } from "@/contexts/CurrencyDisplayContext";
import { format } from "date-fns";
import { AlertTriangle, TrendingUp, Wallet, Building2 } from "lucide-react";

const PIE_COLORS = ["#1F4E79", "#2E75B6", "#5B9BD5", "#9DC3E6", "#ED7D31", "#FFC000", "#70AD47"];

export default function CEODashboard() {
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
        koszt: convertPlnToDisplay(x.koszt),
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

  const bAlerts = useMemo(() => budgetAlertsPln(projects, enriched, 0.8), [projects, enriched]);
  const overdue = useMemo(() => overdueInvoices(enriched), [enriched]);
  const overduePlnSum = useMemo(
    () => overdue.reduce((s, i) => s + (getInvoicePlnAtIssue(i) ?? 0), 0),
    [overdue]
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
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">Dashboard CEO</h1>
          <p className="text-muted-foreground mt-1">MIZAR Sp. z o.o. — podsumowanie finansowe i operacyjne</p>
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
              <CardTitle>Cash flow narastający</CardTitle>
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
            </CardHeader>
            <CardContent className="h-80">
              {pieData.length === 0 ? (
                <p className="text-muted-foreground text-sm">Brak kosztów przypisanych do projektów.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="koszt" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                      {pieData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `${Number(v).toLocaleString("pl-PL")} ${displayCurrency}`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top 5 projektów wg rentowności</CardTitle>
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
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Wygenerowano: {format(new Date(), "yyyy-MM-dd HH:mm")}
        </p>
      </div>
    </div>
  );
}
