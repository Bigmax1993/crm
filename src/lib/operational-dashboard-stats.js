/**
 * KPI pulpitu operacyjnego z żywych faktur Base44 (bez fixture JSON).
 */
import { format, isValid, parseISO, startOfMonth, subMonths } from "date-fns";
import { pl } from "date-fns/locale";
import {
  getInvoicePlnAtIssue,
  getInvoicePlnForCashflow,
  sumReceivablesPln,
  budgetAlertsPln,
} from "@/lib/finance-pln";
import { activeProjectsCount } from "@/lib/finance";
import { overdueInvoices } from "@/lib/finance";
import { getProjectDisplayName } from "@/lib/match-project";

/**
 * @param {object[]} invoices — wzbogacone FV
 * @param {object[]} projects — ConstructionSite
 * @param {Date} [now]
 */
export function computeOperationalDashboardStats(invoices, projects, now = new Date()) {
  const inv = invoices || [];
  const pr = projects || [];

  const activeCount = activeProjectsCount(pr);
  const activeValue = pr
    .filter((p) => {
      const ws = String(p.workflow_status || "").toLowerCase();
      return !["zaplanowany", "zaplacono", "zakończony", "zawieszony"].includes(ws);
    })
    .reduce((s, p) => s + (Number(p.budget_planned) || 0), 0);

  const naleznosciFv = inv.filter((i) => i.invoice_type === "sales" && (i.status === "unpaid" || i.status === "overdue"));
  const naleznosciSum = sumReceivablesPln(inv);
  const naleznosciCount = naleznosciFv.length;

  const ymCurrent = format(startOfMonth(now), "yyyy-MM");
  let wplywyMc = 0;
  let wydatkiMc = 0;
  for (const f of inv) {
    if (f.status !== "paid") continue;
    const dRaw = f.paid_at || f.issue_date;
    if (!dRaw) continue;
    const d = parseISO(String(dRaw).slice(0, 10));
    if (!isValid(d)) continue;
    if (format(startOfMonth(d), "yyyy-MM") !== ymCurrent) continue;
    const p = getInvoicePlnForCashflow(f);
    if (f.invoice_type === "sales") wplywyMc += p;
    else wydatkiMc += p;
  }
  const cfMc = wplywyMc - wydatkiMc;

  const overdue = overdueInvoices(inv);
  const przeterminowaneSum = overdue.reduce((s, i) => s + (getInvoicePlnAtIssue(i) ?? 0), 0);

  const last6Months = [];
  for (let i = 5; i >= 0; i--) {
    const m = startOfMonth(subMonths(now, i));
    const key = format(m, "yyyy-MM");
    let w = 0;
    let y = 0;
    for (const f of inv) {
      if (f.status !== "paid") continue;
      const dRaw = f.paid_at || f.issue_date;
      if (!dRaw) continue;
      const d = parseISO(String(dRaw).slice(0, 10));
      if (!isValid(d)) continue;
      if (format(startOfMonth(d), "yyyy-MM") !== key) continue;
      const p = getInvoicePlnForCashflow(f);
      if (f.invoice_type === "sales") w += p;
      else if (f.invoice_type !== "sales") y += p;
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
  for (const f of inv) {
    if (f.invoice_type === "sales" || !f.project_id) continue;
    const pid = f.project_id;
    spendByProj[pid] = (spendByProj[pid] || 0) + (getInvoicePlnAtIssue(f) ?? 0);
  }

  const top5ByValue = [...pr]
    .sort((a, b) => (Number(b.budget_planned) || 0) - (Number(a.budget_planned) || 0))
    .slice(0, 5)
    .map((p) => {
      const budzet = Number(p.budget_planned) || 0;
      const spent = spendByProj[p.id] || 0;
      const pct = budzet > 0 ? (spent / budzet) * 100 : 0;
      return {
        id: p.id,
        nazwa: getProjectDisplayName(p),
        miasto: p.city || "",
        budzet,
        spent,
        pctReal: pct,
        pctBar: Math.min(100, pct),
      };
    });

  const budgetAlerts = budgetAlertsPln(pr, inv, 0.8).map((a) => ({
    id: a.project.id,
    nazwa: getProjectDisplayName(a.project),
    budzet: a.budget,
    spent: a.cost,
    ratio: a.ratio,
  }));

  return {
    activeCount,
    activeValue,
    naleznosciSum,
    naleznosciCount,
    cfMc,
    wplywyMc,
    wydatkiMc,
    przeterminowaneCount: overdue.length,
    przeterminowaneSum,
    last6Months,
    top5ByValue,
    budgetAlerts,
  };
}
