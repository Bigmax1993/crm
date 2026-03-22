import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { buildCrmContextForAi, stringifyCrmContext } from "@/lib/ai-crm-context";
import {
  openaiChatCompletions,
  isOpenAiConfigured,
  extractJsonObject,
  getAiSettings,
} from "@/lib/openai-mizar";
import { toast } from "sonner";
import { getMizarBrandBriefForPrompt } from "@/lib/mizar-brand-brief";

const LS_KEY = "mizar_ai_alerts_v1";

function levelIcon(level) {
  const l = String(level || "").toLowerCase();
  if (l.includes("kryt")) return "🔴";
  if (l.includes("ostr")) return "🟡";
  return "🔵";
}

export function AiDashboardAlerts() {
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpenAiConfigured()) return;

    let cancelled = false;
    const run = async () => {
      const settings = getAiSettings();
      const ms = (settings.alertIntervalHours || 24) * 3600000;

      try {
        const raw = localStorage.getItem(LS_KEY);
        const cached = raw ? JSON.parse(raw) : null;
        if (cached?.ts && Date.now() - cached.ts < ms && cached.data) {
          setData(cached.data);
          return;
        }
      } catch {
        /* ignore */
      }

      setLoading(true);
      try {
        const ctx = await buildCrmContextForAi(base44);
        const prompt = `Firma: Mizar Sport / MIZAR (obiekty sportowe). Kontekst marki:
${getMizarBrandBriefForPrompt()}

Przeanalizuj dane finansowe CRM i zwróć TYLKO poprawny JSON (cudzysłowy podwójne):
{
  "alerty": [
    {
      "poziom": "krytyczny|ostrzezenie|info",
      "tytul": "",
      "opis": "",
      "projekt_id": "",
      "kwota": 0,
      "akcja": ""
    }
  ],
  "rekomendacje": [
    {
      "priorytet": 1,
      "tytul": "",
      "opis": "",
      "potencjalny_zysk_pln": 0
    }
  ],
  "podsumowanie": ""
}
Wykryj m.in.: faktury przeterminowane, projekty >80% budżetu, ryzyko cash flow, ekspozycję EUR.

DANE:
${stringifyCrmContext(ctx)}`;

        const { text } = await openaiChatCompletions({
          messages: [
            { role: "system", content: "Odpowiadasz wyłącznie JSON bez markdown." },
            { role: "user", content: prompt },
          ],
          max_tokens: 2500,
          temperature: 0.2,
        });

        const j = extractJsonObject(text);
        if (!j || cancelled) return;
        const payload = {
          alerty: Array.isArray(j.alerty) ? j.alerty : [],
          rekomendacje: Array.isArray(j.rekomendacje) ? j.rekomendacje : [],
          podsumowanie: j.podsumowanie || "",
        };
        localStorage.setItem(LS_KEY, JSON.stringify({ ts: Date.now(), data: payload }));
        setData(payload);
      } catch (e) {
        if (!cancelled) {
          toast.message("AI tymczasowo niedostępna — dane z cache", { description: e?.message?.slice(0, 80) });
          try {
            const raw = localStorage.getItem(LS_KEY);
            const c = raw ? JSON.parse(raw) : null;
            if (c?.data) setData(c.data);
          } catch {
            /* */
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isOpenAiConfigured()) {
    return (
      <Card className="bg-white shadow-lg mb-8 border-dashed">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Alerty AI
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Skonfiguruj klucz OpenAI (zmienna <code className="text-xs">VITE_OPENAI_API_KEY</code> lub Ustawienia AI), aby
          włączyć analizę przy starcie dashboardu (cache do 24h).
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <Card className="bg-white shadow-lg">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Alerty AI
            <Badge variant="secondary" className="text-[10px]">
              AI
            </Badge>
            {loading && <span className="text-xs text-muted-foreground font-normal">Analiza…</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!data?.alerty?.length && !loading && (
            <p className="text-sm text-muted-foreground">Brak alertów lub oczekiwanie na analizę.</p>
          )}
          {data?.podsumowanie ? <p className="text-sm text-slate-700 mb-2">{data.podsumowanie}</p> : null}
          {(data?.alerty || []).map((a, i) => (
            <Collapsible key={i} open={openId === `a-${i}`} onOpenChange={(o) => setOpenId(o ? `a-${i}` : null)}>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{levelIcon(a.poziom)}</span>
                    <span className="font-medium text-sm">{a.tytul || "Alert"}</span>
                    <Badge variant="outline" className="text-[10px]">
                      AI
                    </Badge>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs px-2">
                      <ChevronDown className={`h-3 w-3 transition ${openId === `a-${i}` ? "rotate-180" : ""}`} />
                      Szczegóły
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="text-xs text-muted-foreground mt-2 space-y-1">
                  <p>{a.opis}</p>
                  {a.akcja ? <p className="font-medium text-slate-800">Akcja: {a.akcja}</p> : null}
                  {a.kwota ? <p>Kwota: {Number(a.kwota).toLocaleString("pl-PL")} PLN</p> : null}
                  {a.projekt_id ? <p>Projekt: {a.projekt_id}</p> : null}
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-white shadow-lg">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-500" />
            Rekomendacje AI
            <Badge variant="secondary" className="text-[10px]">
              AI
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!data?.rekomendacje?.length && !loading && (
            <p className="text-sm text-muted-foreground">Brak rekomendacji.</p>
          )}
          {(data?.rekomendacje || [])
            .slice()
            .sort((x, y) => (x.priorytet || 99) - (y.priorytet || 99))
            .map((r, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-blue-600">P{r.priorytet ?? i + 1}</Badge>
                  <span className="font-medium">{r.tytul}</span>
                  <Badge variant="outline" className="text-[10px]">
                    AI
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs">{r.opis}</p>
                {r.potencjalny_zysk_pln ? (
                  <p className="text-xs mt-1 font-semibold text-green-700">
                    Potencjał: {Number(r.potencjalny_zysk_pln).toLocaleString("pl-PL")} PLN
                  </p>
                ) : null}
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
