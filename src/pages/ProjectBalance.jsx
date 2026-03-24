import React, { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { sumReceivables, sumPayables } from "@/lib/finance";
import { loadManualBalance, saveManualBalance } from "@/lib/manual-store";
import { toast } from "sonner";
import { Scale } from "lucide-react";

export default function ProjectBalance() {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list(),
  });

  const [manual, setManual] = useState(loadManualBalance);

  useEffect(() => {
    setManual(loadManualBalance());
  }, []);

  const currency = "PLN";

  const calc = useMemo(() => {
    const naleznosci = sumReceivables(invoices, currency);
    const zobowiazania = sumPayables(invoices, currency);
    const gotowka = Number(manual.gotowka) || 0;
    const magazyn = Number(manual.magazyn) || 0;
    const aktywaTrwale = Number(manual.aktywaTrwale) || 0;
    const kapitalWlasny = Number(manual.kapitalWlasny) || 0;
    const sumaAktywow = naleznosci + gotowka + magazyn + aktywaTrwale;
    const sumaPasywow = zobowiazania + kapitalWlasny;
    const roznica = sumaAktywow - sumaPasywow;
    return {
      naleznosci,
      zobowiazania,
      gotowka,
      magazyn,
      aktywaTrwale,
      kapitalWlasny,
      sumaAktywow,
      sumaPasywow,
      roznica,
      ok: Math.abs(roznica) < 0.01,
    };
  }, [invoices, manual]);

  const saveManual = () => {
    saveManualBalance(manual);
    toast.success("Zapisano pola bilansu");
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] w-full items-center justify-center text-muted-foreground">
        <div className="h-10 w-10 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">Bilans projektowy</h1>
          <p className="text-muted-foreground mt-1">Aktywa i pasywa z walidacją równowagi</p>
        </motion.div>

        {!calc.ok && (
          <Alert variant="destructive">
            <Scale className="h-4 w-4" />
            <AlertTitle>Bilans niezbieżny</AlertTitle>
            <AlertDescription>
              Różnica aktywa − pasywa:{" "}
              <strong>{calc.roznica.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN</strong>. Uzupełnij pola
              manualne lub zweryfikuj faktury.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Pola manualne (poza fakturami)</CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            {[
              ["gotowka", "Gotówka / saldo bankowe"],
              ["magazyn", "Magazyn (materiały)"],
              ["aktywaTrwale", "Aktywa trwałe"],
              ["kapitalWlasny", "Kapitał własny"],
            ].map(([key, label]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  type="number"
                  step="0.01"
                  value={manual[key] ?? ""}
                  onChange={(e) => setManual({ ...manual, [key]: e.target.value })}
                />
              </div>
            ))}
            <div className="sm:col-span-2 flex gap-2">
              <Button type="button" onClick={saveManual}>
                Zapisz pola manualne
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setManual(loadManualBalance())}
              >
                Przeładuj z pamięci
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}>
            <Card className="border-emerald-200 dark:border-emerald-900 h-full">
              <CardHeader>
                <CardTitle className="text-emerald-800 dark:text-emerald-200">Aktywa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="Należności (FV sprzedaż, niezapłacone)" value={calc.naleznosci} />
                <Row label="Gotówka" value={calc.gotowka} />
                <Row label="Magazyn" value={calc.magazyn} />
                <Row label="Aktywa trwałe" value={calc.aktywaTrwale} />
                <div className="pt-3 border-t font-bold flex justify-between">
                  <span>Suma aktywów</span>
                  <span>{calc.sumaAktywow.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}>
            <Card className="border-amber-200 dark:border-amber-900 h-full">
              <CardHeader>
                <CardTitle className="text-amber-900 dark:text-amber-200">Pasywa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="Zobowiązania (FV zakup, niezapłacone)" value={calc.zobowiazania} />
                <Row label="Kapitał własny" value={calc.kapitalWlasny} />
                <div className="pt-3 border-t font-bold flex justify-between">
                  <span>Suma pasywów</span>
                  <span>{calc.sumaPasywow.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN</span>
    </div>
  );
}
