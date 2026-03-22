import React, { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sparkles } from "lucide-react";
import mizarData from "@/fixtures/mizar_data.json";
import { stringifyCrmContext } from "@/lib/ai-crm-context";
import {
  openaiChatCompletions,
  isOpenAiConfigured,
  extractJsonObject,
} from "@/lib/openai-mizar";
import { toast } from "sonner";
import { getMizarBrandBriefForPrompt } from "@/lib/mizar-brand-brief";
import { getSiteExtension } from "@/lib/mizar-crm-local-store";
import { offerSegmentLabel } from "@/lib/mizar-offer-segments";

function mizarOferty() {
  return (mizarData.projekty || []).filter((p) =>
    String(p.status || "").toLowerCase().includes("oferta")
  );
}

function matchMizarForSite(site) {
  const mo = mizarOferty();
  return (
    mo.find(
      (p) =>
        p.lokalizacja?.miasto &&
        site.city &&
        p.lokalizacja.miasto.toLowerCase() === site.city.toLowerCase()
    ) ||
    mo.find(
      (p) =>
        site.object_name &&
        p.nazwa &&
        (p.nazwa.toLowerCase().includes(site.object_name.toLowerCase().slice(0, 20)) ||
          site.object_name.toLowerCase().includes(p.nazwa.toLowerCase().slice(0, 15)))
    ) ||
    null
  );
}

function historySnippet() {
  const done = (mizarData.projekty || []).filter((p) =>
    String(p.status || "").toLowerCase().includes("zakończ")
  );
  const byType = {};
  for (const p of done) {
    const t = p.typ_obiektu || "inny";
    if (!byType[t]) byType[t] = { sumM: 0, n: 0 };
    if (p.marza_rzeczywista_procent != null) {
      byType[t].sumM += Number(p.marza_rzeczywista_procent);
      byType[t].n += 1;
    }
  }
  const avg = {};
  Object.keys(byType).forEach((k) => {
    avg[k] = byType[k].n ? byType[k].sumM / byType[k].n : null;
  });
  return { zakonczone_projekty: done.length, srednia_marza_rzeczywista_per_typ: avg };
}

const cacheKey = (id) => `mizar_ai_offer_${id}`;

export function ConstructionOffersAi({ sites = [] }) {
  const oferty = sites.filter((s) => s.workflow_status === "oferta");
  const [modal, setModal] = useState(null);
  const [results, setResults] = useState({});

  const loadCached = useCallback(() => {
    const next = {};
    for (const s of oferty) {
      try {
        const raw = localStorage.getItem(cacheKey(s.id));
        if (!raw) continue;
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts < 24 * 3600000) next[s.id] = data;
      } catch {
        /* */
      }
    }
    setResults((r) => ({ ...r, ...next }));
  }, [oferty]);

  useEffect(() => {
    loadCached();
  }, [loadCached]);

  const analyzeOne = async (site) => {
    if (!isOpenAiConfigured()) {
      toast.error("Brak klucza OpenAI");
      return;
    }
    const m = matchMizarForSite(site);
    const hist = historySnippet();
    const ext = getSiteExtension(site.id);
    const prompt = `Jesteś ekspertem od budownictwa sportowego (Mizar Sport / MIZAR).

Kontekst marki:
${getMizarBrandBriefForPrompt()}

Oceń szansę wygrania tej oferty przez firmę na podstawie historycznych danych.
Zwróć TYLKO JSON:
{
  "prawdopodobienstwo_procent": 0,
  "uzasadnienie": "",
  "czynniki_pozytywne": [],
  "czynniki_ryzyka": [],
  "rekomendowana_cena": 0,
  "optymalna_marza_procent": 0
}

OFERTA (CRM):
${stringifyCrmContext({
          site,
          budzet_api: site.budget_planned,
          miasto: site.city,
          obiekt: site.object_name,
          segment_oferty: offerSegmentLabel(ext.offer_segment),
          normy: ext.norms_note,
          dofinansowanie: ext.subsidy,
          certyfikaty: (ext.certifications || []).slice(0, 8),
        })}

OFERTA (mizar_data dopasowanie):
${JSON.stringify(m || {})}

HISTORIA MIZAR:
${JSON.stringify(hist)}`;

    const { text } = await openaiChatCompletions({
      messages: [
        { role: "system", content: "Odpowiadasz wyłącznie JSON." },
        { role: "user", content: prompt },
      ],
      max_tokens: 1200,
      temperature: 0.25,
    });

    const j = extractJsonObject(text);
    if (!j) throw new Error("Niepoprawna odpowiedź AI");
    localStorage.setItem(cacheKey(site.id), JSON.stringify({ ts: Date.now(), data: j }));
    setResults((r) => ({ ...r, [site.id]: j }));
    return j;
  };

  const runAll = async () => {
    for (const s of oferty) {
      try {
        await analyzeOne(s);
      } catch (e) {
        toast.error(`${s.object_name}: ${e.message}`);
      }
    }
  };

  if (!oferty.length) return null;

  const barColor = (pct) => {
    if (pct < 30) return "bg-red-600";
    if (pct <= 70) return "bg-amber-500";
    return "bg-green-600";
  };

  return (
    <Card className="bg-white shadow-lg mb-6">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Oferty — predykcja AI
          <Badge variant="secondary" className="text-[10px]">
            AI
          </Badge>
        </CardTitle>
        {isOpenAiConfigured() && (
          <Button type="button" size="sm" variant="outline" onClick={runAll}>
            Odśwież analizę (wszystkie)
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!isOpenAiConfigured() && (
          <p className="text-sm text-muted-foreground">Włącz klucz OpenAI, aby ocenić szanse ofert.</p>
        )}
        {oferty.map((site) => {
          const r = results[site.id];
          const pct = Math.min(100, Math.max(0, Number(r?.prawdopodobienstwo_procent) || 0));
          const m = matchMizarForSite(site);
          return (
            <div key={site.id} className="rounded-lg border border-slate-200 p-4 space-y-2">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{site.object_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {site.city} · budżet planowany:{" "}
                    {(Number(site.budget_planned) || 0).toLocaleString("pl-PL")} PLN
                    {m ? ` · dopasowano: ${m.nazwa.slice(0, 40)}…` : ""}
                  </p>
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={() => analyzeOne(site).catch((e) => toast.error(e.message))}>
                  Analiza AI
                </Button>
              </div>
              {r ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor(pct)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold w-12 text-right">{pct}%</span>
                  </div>
                  <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => setModal({ site, r })}>
                    Pokaż szczegóły analizy
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Brak analizy — kliknij „Analiza AI”.</p>
              )}
            </div>
          );
        })}
      </CardContent>

      <Dialog open={Boolean(modal)} onOpenChange={() => setModal(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Analiza AI — {modal?.site?.object_name}</DialogTitle>
          </DialogHeader>
          {modal?.r && (
            <div className="text-sm space-y-2">
              <p>{modal.r.uzasadnienie}</p>
              <div>
                <p className="font-medium">Czynniki pozytywne</p>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {(modal.r.czynniki_pozytywne || []).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium">Ryzyka</p>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {(modal.r.czynniki_ryzyka || []).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
              <p>
                <span className="font-medium">Rekomendowana cena: </span>
                {Number(modal.r.rekomendowana_cena || 0).toLocaleString("pl-PL")} PLN
              </p>
              <p>
                <span className="font-medium">Optymalna marża: </span>
                {modal.r.optymalna_marza_procent}%
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
