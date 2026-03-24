import {
  addDays,
  addMonths,
  eachWeekOfInterval,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

/** Formatowanie kwot PLN (PL). */
export function formatPln(n, { min = 2, max = 2 } = {}) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v.toLocaleString("pl-PL", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  })} PLN`;
}

export function formatPct(n, digits = 1) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v.toLocaleString("pl-PL", { maximumFractionDigits: digits })}%`;
}

const SEASON_FACTORS = {
  1: 0.6,
  2: 0.7,
  3: 0.9,
  4: 1.1,
  5: 1.3,
  6: 1.4,
  7: 1.4,
  8: 1.3,
  9: 1.2,
  10: 1.1,
  11: 0.9,
  12: 0.6,
};

export function getSeasonFactor(monthIndex1Based) {
  return SEASON_FACTORS[monthIndex1Based] ?? 1;
}

function fakturaPln(f) {
  const cur = String(f.waluta || "PLN").toUpperCase();
  if (cur === "EUR" || cur !== "PLN") {
    const pln = Number(f.kwota_pln);
    if (Number.isFinite(pln)) return pln;
  }
  return Number(f.kwota_brutto) || 0;
}

function isPaidStatus(status) {
  const s = String(status || "").toLowerCase();
  return s.includes("zapłac") || s.includes("zaplac");
}

/**
 * MODUŁ 1 — Cash flow etapowy (tygodnie, saldo z konta + przyszłe / zaległe FV).
 */
export function buildCashFlowEtapowy(fixtureData, { horizonDays = 90, referenceDate = new Date() } = {}) {
  const ref = startOfDay(referenceDate);
  const bankSaldo = Number(fixtureData?.konto_bankowe?.saldo_pln) || 0;
  const invoices = fixtureData?.faktury || [];

  const events = [];
  for (const f of invoices) {
    const paid = isPaidStatus(f.status);
    const isSales = f.typ === "wystawiona";
    const amt = fakturaPln(f);

    if (paid && f.data_zaplaty) {
      const d = parseISO(String(f.data_zaplaty).slice(0, 10));
      if (!isValid(d)) continue;
      if (d < ref) continue;
      events.push({
        date: d,
        wplywy: isSales ? amt : 0,
        wydatki: isSales ? 0 : amt,
      });
      continue;
    }

    const deadline = f.termin_platnosci ? parseISO(String(f.termin_platnosci).slice(0, 10)) : null;
    if (!deadline || !isValid(deadline)) continue;

    let eventDate = deadline;
    if (!paid && deadline < ref) {
      eventDate = ref;
    }
    events.push({
      date: eventDate,
      wplywy: isSales ? amt : 0,
      wydatki: isSales ? 0 : amt,
    });
  }

  const end = addDays(ref, horizonDays);
  const weeks = eachWeekOfInterval(
    { start: ref, end },
    { weekStartsOn: 1 }
  );

  const rows = [];
  let saldo = bankSaldo;
  let minSaldo = saldo;
  let minWeek = format(weeks[0] || ref, "yyyy-MM-dd");

  for (let i = 0; i < weeks.length; i++) {
    const wkStart = weeks[i];
    const wkEnd = endOfWeek(wkStart, { weekStartsOn: 1 });
    let wplywy = 0;
    let wydatki = 0;

    for (const e of events) {
      if (e.date >= wkStart && e.date <= wkEnd) {
        wplywy += e.wplywy;
        wydatki += e.wydatki;
      }
    }

    saldo = saldo + wplywy - wydatki;
    if (saldo < minSaldo) {
      minSaldo = saldo;
      minWeek = format(wkStart, "yyyy-MM-dd");
    }

    let status = "ok";
    if (saldo < 200_000) status = "critical";
    else if (saldo < 500_000) status = "warn";

    rows.push({
      weekStart: format(wkStart, "yyyy-MM-dd"),
      weekLabel: `${format(wkStart, "dd.MM")}–${format(wkEnd, "dd.MM")}`,
      wplywy,
      wydatki,
      saldo,
      status,
    });
  }

  const chartData = rows.map((r) => ({
    ...r,
    name: r.weekLabel,
  }));

  const criticalLow = rows.some((r) => r.saldo < 200_000);
  const warnLow = rows.some((r) => r.saldo < 500_000);

  return {
    bankSaldo,
    horizonDays,
    rows,
    chartData,
    criticalLow,
    warnLow,
    minSaldo,
    minWeek,
    thresholds: { critical: 200_000, warn: 500_000 },
  };
}

/**
 * MODUŁ 2 — Sezonowość (netto gotówkowe wg dat zapłaty).
 */
export function buildSeasonalityAnalysis(fixtureData, { referenceDate = new Date() } = {}) {
  const byMonth = {};
  for (const f of fixtureData?.faktury || []) {
    if (!f.data_zaplaty) continue;
    const d = parseISO(String(f.data_zaplaty).slice(0, 10));
    if (!isValid(d)) continue;
    const key = format(startOfMonth(d), "yyyy-MM");
    if (!byMonth[key]) byMonth[key] = { month: key, wplywy: 0, wydatki: 0 };
    const p = fakturaPln(f);
    if (f.typ === "wystawiona") byMonth[key].wplywy += p;
    else byMonth[key].wydatki += p;
  }

  const hist = Object.values(byMonth)
    .map((r) => ({
      ...r,
      netto: r.wplywy - r.wydatki,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const nets = hist.map((h) => h.netto).filter((n) => Number.isFinite(n));
  const avgMonthly = nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : 0;

  const deviationRows = hist.map((h) => {
    const dt = parseISO(`${h.month}-01`);
    const mi = isValid(dt) ? dt.getMonth() + 1 : 1;
    const plan = avgMonthly;
    const sezon = avgMonthly * getSeasonFactor(mi);
    const rzecz = h.netto;
    const odchyleniePct =
      sezon !== 0 && Number.isFinite(rzecz) ? ((rzecz - sezon) / Math.abs(sezon)) * 100 : null;
    return {
      month: h.month,
      plan,
      sezon,
      rzeczywistosc: rzecz,
      odchyleniePct,
    };
  });

  const barData = hist.slice(-12).map((h) => {
    const dt = parseISO(`${h.month}-01`);
    const mi = isValid(dt) ? dt.getMonth() + 1 : 1;
    return {
      month: h.month,
      rzeczywistosc: h.netto,
      sezon: avgMonthly * getSeasonFactor(mi),
      plan: avgMonthly,
    };
  });

  return {
    hist,
    avgMonthly,
    barData,
    deviationRows,
    insight: {
      best: "czerwiec / lipiec",
      worst: "grudzień / styczeń",
    },
  };
}

/**
 * MODUŁ 3 — Ekspozycja EUR + scenariusze kursu (faktury z fixture).
 */
export function buildEurExposure(fixtureData) {
  const invoices = (fixtureData?.faktury || []).filter((f) => String(f.waluta || "").toUpperCase() === "EUR");
  const unpaid = invoices.filter((f) => !isPaidStatus(f.status));
  const paid = invoices.filter((f) => isPaidStatus(f.status));

  const exposureEur = unpaid.reduce((s, f) => s + (Number(f.kwota_brutto) || 0), 0);

  const tableInvoices = invoices.map((f) => ({
    numer: f.numer,
    kontrahentId: f.kontrahent_id,
    kwotaEur: Number(f.kwota_brutto) || 0,
    kurs: Number(f.kurs_nbp) || null,
    kwotaPln: fakturaPln(f),
    status: f.status,
    paid: isPaidStatus(f.status),
  }));

  const fxDiffPaid = paid.map((f) => {
    const issue = Number(f.kurs_nbp) || 0;
    const grossEur = Number(f.kwota_brutto) || 0;
    const plnIssue = grossEur * issue;
    const plnRecorded = fakturaPln(f);
    const paidRate = issue;
    const diff = plnRecorded - plnIssue;
    return {
      numer: f.numer,
      kontrahentId: f.kontrahent_id,
      kursWystawienia: issue,
      kursZaplatyPrzyjety: paidRate,
      roznicapl: Number.isFinite(diff) ? diff : 0,
      opis: f.opis,
    };
  });

  const DELTAS = [-0.5, -0.2, -0.1, 0, 0.1, 0.2, 0.5];

  return {
    exposureEur,
    unpaidCount: unpaid.length,
    tableInvoices,
    fxDiffPaid,
    rateDeltas: DELTAS,
  };
}

export function eurSensitivityRows(exposureEur, baseMid, deltas) {
  const base = Number(baseMid) || 4.32;
  const baseCost = exposureEur * base;
  return deltas.map((d) => {
    const rate = base + d;
    const cost = exposureEur * rate;
    const roznica = cost - baseCost;
    return {
      deltaLabel: d === 0 ? "aktualny" : `${d > 0 ? "+" : ""}${d.toFixed(2)} PLN/EUR`,
      delta: d,
      kurs: rate,
      kosztPln: cost,
      roznica,
      worseForCompany: d > 0,
    };
  });
}

/**
 * MODUŁ 4 — Pipeline ofert.
 */
export function getOfertyProjects(fixtureData) {
  return (fixtureData?.projekty || []).filter((p) => String(p.status || "").toLowerCase().includes("oferta"));
}

export function buildPipelineScenarios(
  fixtureData,
  probabilitiesByProjectId,
  { referenceDate = new Date() } = {}
) {
  const oferty = getOfertyProjects(fixtureData);
  const probs = probabilitiesByProjectId || {};

  const items = oferty.map((p) => {
    const budzet = Number(p.budzet) || 0;
    const marza = Number(p.marza_planowana_procent) || 0;
    const pwin = (probs[p.id] != null ? Number(probs[p.id]) : 50) / 100;
    const przychod = budzet;
    const koszt = budzet * (1 - marza / 100);
    const zysk = przychod - koszt;
    return {
      id: p.id,
      nazwa: p.nazwa,
      budzet,
      marzaPlan: marza,
      pwin,
      przychod,
      koszt,
      zysk,
      weighted: budzet * pwin,
    };
  });

  const sum = (arr, key, pFn) =>
    arr.reduce((s, x) => s + (key ? x[key] : x) * (pFn ? pFn(x) : 1), 0);

  const scenario = (pFn) => {
    let przychody = 0;
    let koszty = 0;
    for (const x of items) {
      const p = pFn(x);
      przychody += x.przychod * p;
      koszty += x.koszt * p;
    }
    const zysk = przychody - koszty;
    const cfMies = zysk / 12;
    return { przychody, koszty, zysk, cfMies };
  };

  const pes = scenario(() => 0);
  const opt = scenario(() => 1);
  const baz = scenario((x) => x.pwin);

  const weightedPipeline = items.reduce((s, x) => s + x.weighted, 0);

  const refM = startOfMonth(referenceDate);

  const cfLines = Array.from({ length: 12 }, (_, i) => ({
    label: format(addMonths(refM, i + 1), "yyyy-MM"),
    pes: pes.cfMies * (i + 1),
    baz: baz.cfMies * (i + 1),
    opt: opt.cfMies * (i + 1),
  }));

  return {
    items,
    weightedPipeline,
    scenarios: {
      pesymistyczny: { ...pes, key: "pes", label: "Pesymistyczny", color: "#dc2626" },
      bazowy: { ...baz, key: "baz", label: "Bazowy", color: "#2563eb" },
      optymistyczny: { ...opt, key: "opt", label: "Optymistyczny", color: "#16a34a" },
    },
    cfLines,
    scenarioCompare: [
      { name: "Pesymistyczny", przychody: pes.przychody, koszty: pes.koszty, zysk: pes.zysk, cf: pes.cfMies },
      { name: "Bazowy", przychody: baz.przychody, koszty: baz.koszty, zysk: baz.zysk, cf: baz.cfMies },
      { name: "Optymistyczny", przychody: opt.przychody, koszty: opt.koszty, zysk: opt.zysk, cf: opt.cfMies },
    ],
  };
}

function linearRegression(xs, ys) {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] || 0 };
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumXX += xs[i] * xs[i];
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/**
 * MODUŁ 5 — Rentowność wg typu obiektu.
 */
export function buildRentownoscTypy(fixtureData) {
  const byType = {};
  for (const p of fixtureData?.projekty || []) {
    const t = (p.typ_obiektu || "inny").trim();
    if (!byType[t]) {
      byType[t] = {
        typ: t,
        projekty: [],
        sumBudzet: 0,
        sumPlan: 0,
        sumRzecz: 0,
        countPlan: 0,
        countRzecz: 0,
      };
    }
    const g = byType[t];
    g.projekty.push(p);
    g.sumBudzet += Number(p.budzet) || 0;
    const mp = p.marza_planowana_procent;
    if (mp != null && Number.isFinite(Number(mp))) {
      g.sumPlan += Number(mp);
      g.countPlan += 1;
    }
    const mr = p.marza_rzeczywista_procent;
    if (mr != null && Number.isFinite(Number(mr))) {
      g.sumRzecz += Number(mr);
      g.countRzecz += 1;
    }
  }

  const TYPE_COLORS = [
    "#1d4ed8",
    "#16a34a",
    "#c026d3",
    "#ea580c",
    "#0891b2",
    "#ca8a04",
    "#4f46e5",
    "#be123c",
  ];

  const rows = Object.values(byType).map((g, idx) => {
    const marzaPlan = g.countPlan ? g.sumPlan / g.countPlan : null;
    const marzaRzecz = g.countRzecz ? g.sumRzecz / g.countRzecz : null;
    const odchylenie =
      marzaPlan != null && marzaRzecz != null ? marzaRzecz - marzaPlan : null;

    const sorted = [...g.projekty]
      .filter((p) => p.marza_rzeczywista_procent != null)
      .sort((a, b) => String(a.data_rozpoczecia).localeCompare(String(b.data_rozpoczecia)));
    const xs = sorted.map((_, i) => i);
    const ys = sorted.map((p) => Number(p.marza_rzeczywista_procent));
    const { slope, intercept } = linearRegression(xs, ys);
    const trend = slope > 0.1 ? "up" : slope < -0.1 ? "down" : "flat";

    const nextY = intercept + slope * xs.length;
    const forecastBase = Number.isFinite(nextY) ? nextY : marzaRzecz ?? marzaPlan ?? 0;

    return {
      typ: g.typ,
      liczbaProjektow: g.projekty.length,
      wartoscLaczna: g.sumBudzet,
      marzaPlan,
      marzaRzecz,
      odchylenie,
      trend,
      slope,
      forecastBase,
      forecastLow: forecastBase * 0.8,
      forecastHigh: forecastBase * 1.2,
      color: TYPE_COLORS[idx % TYPE_COLORS.length],
    };
  });

  rows.sort((a, b) => (b.marzaRzecz || 0) - (a.marzaRzecz || 0));

  const withRzecz = rows.filter((r) => r.marzaRzecz != null);
  const best = withRzecz[0];
  const worst = withRzecz[withRzecz.length - 1];

  const bubbleData = rows.map((r) => ({
    typ: r.typ,
    x: r.wartoscLaczna,
    y: r.marzaRzecz ?? r.marzaPlan ?? 0,
    z: r.liczbaProjektow * 8 + 20,
    fill: r.color,
  }));

  const forecast12 = rows.map((r) => ({
    typ: r.typ,
    points: Array.from({ length: 12 }, (_, i) => ({
      m: i + 1,
      base: r.forecastBase + (r.slope || 0) * i,
      low: r.forecastLow + (r.slope || 0) * i * 0.9,
      high: r.forecastHigh + (r.slope || 0) * i * 1.1,
    })),
  }));

  let rekomendacja = "Brak wystarczających danych o marży rzeczywistej.";
  if (best && worst) {
    rekomendacja = `Najbardziej opłacalny typ: ${best.typ} (${formatPct(best.marzaRzecz, 1)}). Najmniej opłacalny: ${worst.typ} (${formatPct(worst.marzaRzecz, 1)}). Rekomendacja: priorytetyzować oferty na ${best.typ} zamiast ${worst.typ}.`;
  }

  return {
    rows,
    bubbleData,
    forecast12,
    best,
    worst,
    rekomendacja,
  };
}

/** Eksport tabeli do prostych wierszy (PDF/Excel). */
export function cashFlowTableExportRows(result) {
  return result.rows.map((r) => ({
    Tydzień: r.weekStart,
    Wpływy: r.wplywy,
    Wydatki: r.wydatki,
    Saldo: r.saldo,
    Status: r.status,
  }));
}
