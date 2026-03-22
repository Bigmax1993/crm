import { format, isValid, parseISO, startOfMonth, subMonths } from "date-fns";
import { pl } from "date-fns/locale";

function fakturaPln(f) {
  const cur = String(f.waluta || "PLN").toUpperCase();
  if (cur !== "PLN") {
    const pln = Number(f.kwota_pln);
    if (Number.isFinite(pln)) return pln;
  }
  return Number(f.kwota_brutto) || 0;
}

function isZaplacona(f) {
  const s = String(f.status || "").toLowerCase();
  return s.includes("zapłac") || s.includes("zaplac");
}

/**
 * KPI i agregaty pod dashboard MIZAR z mizar_data.json.
 * @param {object} mizarData — struktura jak w fixtures/mizar_data.json
 * @param {Date} [now]
 */
export function computeMizarDashboardStats(mizarData, now = new Date()) {
  const projekty = mizarData?.projekty || [];
  const faktury = mizarData?.faktury || [];

  const activeProjects = projekty.filter((p) =>
    String(p.status || "").toLowerCase().includes("w trakcie")
  );
  const activeCount = activeProjects.length;
  const activeValue = activeProjects.reduce((s, p) => s + (Number(p.budzet) || 0), 0);

  const naleznosciFv = faktury.filter((f) => f.typ === "wystawiona" && !isZaplacona(f));
  const naleznosciSum = naleznosciFv.reduce((s, f) => s + fakturaPln(f), 0);

  const ymCurrent = format(startOfMonth(now), "yyyy-MM");
  let wplywyMc = 0;
  let wydatkiMc = 0;
  for (const f of faktury) {
    if (!f.data_zaplaty) continue;
    const d = parseISO(String(f.data_zaplaty).slice(0, 10));
    if (!isValid(d)) continue;
    if (format(startOfMonth(d), "yyyy-MM") !== ymCurrent) continue;
    const p = fakturaPln(f);
    if (f.typ === "wystawiona") wplywyMc += p;
    else if (f.typ === "otrzymana") wydatkiMc += p;
  }
  const cfMc = wplywyMc - wydatkiMc;

  const przeterminowaneFv = faktury.filter((f) =>
    String(f.status || "").toLowerCase().includes("przetermin")
  );
  const przeterminowaneSum = przeterminowaneFv.reduce((s, f) => s + fakturaPln(f), 0);

  const last6Months = [];
  for (let i = 5; i >= 0; i--) {
    const m = startOfMonth(subMonths(now, i));
    const key = format(m, "yyyy-MM");
    let w = 0;
    let y = 0;
    for (const f of faktury) {
      if (!f.data_zaplaty) continue;
      const d = parseISO(String(f.data_zaplaty).slice(0, 10));
      if (!isValid(d)) continue;
      if (format(startOfMonth(d), "yyyy-MM") !== key) continue;
      const p = fakturaPln(f);
      if (f.typ === "wystawiona") w += p;
      else if (f.typ === "otrzymana") y += p;
    }
    last6Months.push({
      month: key,
      label: format(m, "LLL yyyy", { locale: pl }),
      wplywy: w,
      wydatki: y,
      netto: w - y,
    });
  }

  const spendByProj = {};
  for (const f of faktury) {
    if (f.typ !== "otrzymana" || !f.projekt_id) continue;
    const id = f.projekt_id;
    spendByProj[id] = (spendByProj[id] || 0) + fakturaPln(f);
  }

  const top5ByValue = [...projekty]
    .sort((a, b) => (Number(b.budzet) || 0) - (Number(a.budzet) || 0))
    .slice(0, 5)
    .map((p) => {
      const budzet = Number(p.budzet) || 0;
      const spent = spendByProj[p.id] || 0;
      const pct = budzet > 0 ? (spent / budzet) * 100 : 0;
      return {
        id: p.id,
        nazwa: p.nazwa,
        miasto: p.lokalizacja?.miasto || "",
        budzet,
        spent,
        pctReal: pct,
        pctBar: Math.min(100, pct),
      };
    });

  const budgetAlerts = projekty
    .map((p) => {
      const budzet = Number(p.budzet) || 0;
      const spent = spendByProj[p.id] || 0;
      const ratio = budzet > 0 ? spent / budzet : 0;
      return {
        id: p.id,
        nazwa: p.nazwa,
        budzet,
        spent,
        ratio,
      };
    })
    .filter((p) => p.budzet > 0 && p.ratio >= 0.8)
    .sort((a, b) => b.ratio - a.ratio);

  return {
    activeCount,
    activeValue,
    naleznosciSum,
    naleznosciCount: naleznosciFv.length,
    cfMc,
    wplywyMc,
    wydatkiMc,
    przeterminowaneCount: przeterminowaneFv.length,
    przeterminowaneSum,
    last6Months,
    top5ByValue,
    budgetAlerts,
  };
}
