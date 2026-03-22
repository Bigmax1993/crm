import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDatabase } from "@/hooks/useDatabase";
import { getKPI, getCashFlow } from "@/lib/queries";
import { Database, AlertCircle } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

function fmtPln(n) {
  const x = Number(n) || 0;
  return `${x.toLocaleString("pl-PL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} PLN`;
}

export function MizarSqlLocalPanel() {
  const { ready, error } = useDatabase();
  const [kpi, setKpi] = useState(null);
  const [cashFlow, setCashFlow] = useState([]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    Promise.all([getKPI(), getCashFlow()]).then(([k, cf]) => {
      if (!cancelled) {
        setKpi(k);
        setCashFlow(cf.slice(-8));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (error) {
    return (
      <Card className="bg-white shadow-lg mb-8 border-red-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-red-800">
            <AlertCircle className="h-5 w-5" />
            Lokalna baza SQL.js
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-red-700">{error}</CardContent>
      </Card>
    );
  }

  if (!ready || !kpi) {
    return (
      <Card className="bg-white shadow-lg mb-8 border-emerald-200/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-5 w-5 text-emerald-600" />
            Lokalna baza SQL.js
          </CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            SQLite w przeglądarce — dane w localStorage, seed z mizar_data.json
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white shadow-lg mb-8 border-emerald-200/60">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="h-5 w-5 text-emerald-600" />
          Lokalna baza SQL.js
        </CardTitle>
        <p className="text-xs text-muted-foreground font-normal">
          KPI i cash flow z zapytań w <code className="text-[10px] bg-slate-100 px-1 rounded">queries.js</code> — bez
          zewnętrznej bazy
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
          <div className="rounded-lg border border-border p-3 bg-muted/30">
            <p className="text-xs text-muted-foreground">Aktywne projekty</p>
            <p className="text-xl font-bold">{kpi.aktywne_projekty ?? 0}</p>
          </div>
          <div className="rounded-lg border p-3 bg-blue-50/80">
            <p className="text-xs text-blue-900/80">Należności</p>
            <p className="text-lg font-bold text-blue-900">{fmtPln(kpi.naleznosci)}</p>
          </div>
          <div className="rounded-lg border p-3 bg-amber-50/80">
            <p className="text-xs text-amber-900/80">Zobowiązania</p>
            <p className="text-lg font-bold text-amber-900">{fmtPln(kpi.zobowiazania)}</p>
          </div>
          <div className="rounded-lg border p-3 bg-red-50/80">
            <p className="text-xs text-red-900/80">Przeterminowane</p>
            <p className="text-lg font-bold text-red-800">{kpi.faktury_przeterminowane ?? 0}</p>
            <p className="text-[11px] text-red-700">{fmtPln(kpi.kwota_przeterminowana)}</p>
          </div>
          <div className="rounded-lg border p-3 bg-violet-50/80">
            <p className="text-xs text-violet-900/80">Pipeline (oferty)</p>
            <p className="text-lg font-bold text-violet-900">{fmtPln(kpi.wartosc_pipeline)}</p>
          </div>
        </div>

        {cashFlow.length > 0 && (
          <div className="h-56">
            <p className="text-xs text-muted-foreground mb-2">Saldo miesięczne (zapłacone FV) — narastająco w danych</p>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cashFlow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="miesiac" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v) => [`${Number(v).toLocaleString("pl-PL")} PLN`, ""]}
                  labelFormatter={(l) => `Miesiąc: ${l}`}
                />
                <Line type="monotone" dataKey="narastajace" name="Saldo narastające" stroke="#059669" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
