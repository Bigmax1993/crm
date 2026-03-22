import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "recharts";
import { forecastFromLast3Months } from "@/lib/mizar-finance";
import { monthlyCashFlowPaidPln } from "@/lib/mizar-finance-pln";
import { useClientEnrichedInvoices } from "@/hooks/useClientEnrichedInvoices";
import { useCurrencyDisplay } from "@/contexts/CurrencyDisplayContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, addMonths, startOfMonth } from "date-fns";

export default function CashFlow() {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list(),
  });
  const enriched = useClientEnrichedInvoices(invoices);
  const { convertPlnToDisplay, formatDisplayAmount, displayCurrency } = useCurrencyDisplay();

  const rowsPln = useMemo(() => monthlyCashFlowPaidPln(enriched), [enriched]);
  const forecast = useMemo(() => forecastFromLast3Months(rowsPln), [rowsPln]);

  const rows = useMemo(
    () =>
      rowsPln.map((r) => ({
        ...r,
        wplywyD: convertPlnToDisplay(r.wplywy),
        wydatkiD: convertPlnToDisplay(r.wydatki),
        saldoD: convertPlnToDisplay(r.saldo),
        saldoNarD: convertPlnToDisplay(r.saldoNarastajace),
      })),
    [rowsPln, convertPlnToDisplay]
  );

  const future = useMemo(() => {
    const lastMonth = rowsPln.length ? rowsPln[rowsPln.length - 1].month : format(startOfMonth(new Date()), "yyyy-MM");
    const base = startOfMonth(new Date(`${lastMonth}-01`));
    return [30, 60, 90].map((days, i) => {
      const m = addMonths(base, i + 1);
      return {
        label: `+${days} dni`,
        month: format(m, "yyyy-MM"),
        prognoza: convertPlnToDisplay(forecast.avgNet * (days / 30)),
      };
    });
  }, [rowsPln, forecast, convertPlnToDisplay]);

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
          <h1 className="text-3xl md:text-4xl font-bold">Cash flow</h1>
          <p className="text-muted-foreground mt-1">
            Wpływy i wydatki (FV zapłacone, PLN wg kursu płatności NBP) — waluta widoku: {displayCurrency}
          </p>
        </motion.div>

        <Card>
          <CardHeader>
            <CardTitle>Prognoza (średnia z ostatnich 3 miesięcy)</CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Śr. wpływy / mc</p>
              <p className="text-xl font-semibold">{formatDisplayAmount(forecast.avgIn)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Śr. wydatki / mc</p>
              <p className="text-xl font-semibold">{formatDisplayAmount(forecast.avgOut)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Śr. saldo / mc</p>
              <p className="text-xl font-semibold">{formatDisplayAmount(forecast.avgNet)}</p>
            </div>
            <div className="sm:col-span-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Horyzont</TableHead>
                    <TableHead>Miesiąc referencyjny</TableHead>
                    <TableHead className="text-right">Szac. skumulowane saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {future.map((f) => (
                    <TableRow key={f.label}>
                      <TableCell>{f.label}</TableCell>
                      <TableCell>{f.month}</TableCell>
                      <TableCell className={`text-right font-medium ${f.prognoza < 0 ? "text-red-600" : ""}`}>
                        {f.prognoza.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} {displayCurrency}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Wpływy vs wydatki</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `${Number(v).toLocaleString("pl-PL")} ${displayCurrency}`} />
                  <Legend />
                  <Bar dataKey="wplywyD" name="Wpływy" fill="#2E75B6" />
                  <Bar dataKey="wydatkiD" name="Wydatki" fill="#C55A11" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Saldo narastające</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `${Number(v).toLocaleString("pl-PL")} ${displayCurrency}`} />
                  <Legend />
                  <Line type="monotone" dataKey="saldoNarD" name="Saldo narastające" stroke="#1F4E79" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tabela miesięczna ({displayCurrency})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Miesiąc</TableHead>
                  <TableHead className="text-right">Wpływy</TableHead>
                  <TableHead className="text-right">Wydatki</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Saldo narastające</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.month}>
                    <TableCell>{r.month}</TableCell>
                    <TableCell className="text-right">{r.wplywyD.toLocaleString("pl-PL")}</TableCell>
                    <TableCell className="text-right">{r.wydatkiD.toLocaleString("pl-PL")}</TableCell>
                    <TableCell className={`text-right font-medium ${r.saldo < 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {r.saldoD.toLocaleString("pl-PL")}
                    </TableCell>
                    <TableCell className="text-right">{r.saldoNarD.toLocaleString("pl-PL")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
