/**
 * Agregaty finansowe w **PLN** (`amount_pln`, kurs NBP z wystawienia / płatności).
 * Zestawienie definicji metryk: `finance-metric-definitions.js`.
 */
import { format, parseISO, startOfMonth, isValid } from "date-fns";

export const PLN = (v) => (typeof v === "number" && !Number.isNaN(v) ? v : 0);

export function invoicePaidDate(inv) {
  if (inv.paid_at && isValid(parseISO(String(inv.paid_at)))) return parseISO(String(inv.paid_at));
  if (inv.issue_date && isValid(parseISO(String(inv.issue_date)))) return parseISO(String(inv.issue_date));
  return null;
}

/** Kwota w PLN według kursu z wystawienia (zapisana lub szacunek dla PLN). */
export function getInvoicePlnAtIssue(inv) {
  const ap = inv.amount_pln;
  if (ap != null && Number.isFinite(Number(ap))) return Number(ap);
  const cur = (inv.currency || "PLN").toUpperCase();
  if (cur === "PLN") return PLN(inv.amount);
  return null;
}

/** Dla przepływów gotówki — po zapłacie preferuj kurs z płatności. */
export function getInvoicePlnForCashflow(inv) {
  if (inv.status !== "paid") return 0;
  const atPay = inv.amount_pln_at_payment;
  if (atPay != null && Number.isFinite(Number(atPay))) return Number(atPay);
  return getInvoicePlnAtIssue(inv) ?? (inv.currency === "PLN" || !inv.currency ? PLN(inv.amount) : null) ?? 0;
}

export function isUnpaidStatus(status) {
  return status === "unpaid" || status === "overdue";
}

/** @see FINANCE_METRICS.receivablesOpenPln w `finance-metric-definitions.js` */
export function sumReceivablesPln(invoices) {
  return invoices
    .filter((i) => i.invoice_type === "sales" && isUnpaidStatus(i.status))
    .reduce((s, i) => s + (getInvoicePlnAtIssue(i) ?? 0), 0);
}

/** @see FINANCE_METRICS.payablesOpenPln */
export function sumPayablesPln(invoices) {
  return invoices
    .filter((i) => i.invoice_type !== "sales" && isUnpaidStatus(i.status))
    .reduce((s, i) => s + (getInvoicePlnAtIssue(i) ?? 0), 0);
}

/** @see FINANCE_METRICS.cashflowMonthlyPaidPln */
export function monthlyCashFlowPaidPln(invoices) {
  const map = {};
  for (const inv of invoices) {
    if (inv.status !== "paid") continue;
    const d = invoicePaidDate(inv);
    if (!d) continue;
    const key = format(startOfMonth(d), "yyyy-MM");
    if (!map[key]) map[key] = { month: key, wplywy: 0, wydatki: 0, saldo: 0 };
    const amt = getInvoicePlnForCashflow(inv);
    if (inv.invoice_type === "sales") map[key].wplywy += amt;
    else map[key].wydatki += amt;
  }
  const rows = Object.values(map)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => ({
      ...r,
      saldo: r.wplywy - r.wydatki,
    }));
  let cum = 0;
  return rows.map((r) => {
    cum += r.saldo;
    return { ...r, saldoNarastajace: cum };
  });
}

/** @see FINANCE_METRICS.revenueCostMonthlyAccrualPln */
export function monthlyRevenueVsCostPln(invoices) {
  const map = {};
  for (const inv of invoices) {
    const d = inv.issue_date && isValid(parseISO(String(inv.issue_date))) ? parseISO(String(inv.issue_date)) : null;
    if (!d) continue;
    const key = format(startOfMonth(d), "yyyy-MM");
    if (!map[key]) map[key] = { month: key, przychody: 0, koszty: 0 };
    const amt = getInvoicePlnAtIssue(inv);
    if (amt == null) continue;
    if (inv.invoice_type === "sales") map[key].przychody += amt;
    else map[key].koszty += amt;
  }
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
}

/** @see FINANCE_METRICS.resultGlobalPaidPln */
export function globalPLPln(invoices) {
  let przychody = 0;
  let koszty = 0;
  for (const inv of invoices) {
    if (inv.status !== "paid") continue;
    const amt = getInvoicePlnForCashflow(inv);
    if (inv.invoice_type === "sales") przychody += amt;
    else koszty += amt;
  }
  const brutto = przychody - koszty;
  const marzaPct = przychody > 0 ? (brutto / przychody) * 100 : null;
  return { przychody, koszty, brutto, marzaPct };
}

/** @see FINANCE_METRICS.resultByProjectPaidPln */
export function plByProjectPln(invoices, projects) {
  return projects.map((p) => {
    let przychody = 0;
    let koszty = 0;
    for (const inv of invoices) {
      if (inv.project_id !== p.id) continue;
      if (inv.status !== "paid") continue;
      const amt = getInvoicePlnForCashflow(inv);
      if (inv.invoice_type === "sales") przychody += amt;
      else koszty += amt;
    }
    const brutto = przychody - koszty;
    const marzaPct = przychody > 0 ? (brutto / przychody) * 100 : null;
    return { project: p, przychody, koszty, brutto, marzaPct };
  });
}

/** @see FINANCE_METRICS.quarterlyTrendPaidPln */
export function quarterlyYoYTrendPln(invoices) {
  const qKey = (d) => {
    const m = d.getMonth();
    const q = Math.floor(m / 3) + 1;
    return `${d.getFullYear()}-Q${q}`;
  };
  const bucket = {};
  for (const inv of invoices) {
    if (inv.status !== "paid") continue;
    const d = invoicePaidDate(inv);
    if (!d) continue;
    const k = qKey(d);
    if (!bucket[k]) bucket[k] = { key: k, przychody: 0, koszty: 0 };
    const amt = getInvoicePlnForCashflow(inv);
    if (inv.invoice_type === "sales") bucket[k].przychody += amt;
    else bucket[k].koszty += amt;
  }
  return Object.values(bucket)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((b) => ({
      ...b,
      wynik: b.przychody - b.koszty,
    }));
}

export function foreignExposureRatio(invoices) {
  if (!invoices.length) return 0;
  const foreign = invoices.filter((i) => (i.currency || "PLN").toUpperCase() !== "PLN").length;
  return foreign / invoices.length;
}

/** @see FINANCE_METRICS.projectCostAccruedPln */
export function costByProjectPln(invoices, projects) {
  const byId = {};
  for (const p of projects) {
    byId[p.id] = { name: p.object_name || p.city || p.id, koszt: 0 };
  }
  for (const inv of invoices) {
    if (inv.invoice_type === "sales") continue;
    const pid = inv.project_id;
    if (!pid || !byId[pid]) continue;
    const amt = getInvoicePlnAtIssue(inv);
    if (amt == null) continue;
    byId[pid].koszt += amt;
  }
  return Object.values(byId).filter((x) => x.koszt > 0);
}

/** @see FINANCE_METRICS.projectProfitabilityMixedPln */
export function projectProfitabilityPln(invoices, projects) {
  return projects.map((p) => {
    let przychody = 0;
    let koszty = 0;
    for (const inv of invoices) {
      if (inv.project_id !== p.id) continue;
      const issueAmt = getInvoicePlnAtIssue(inv);
      if (issueAmt == null) continue;
      if (inv.invoice_type === "sales" && inv.status === "paid") przychody += getInvoicePlnForCashflow(inv);
      if (inv.invoice_type !== "sales") koszty += issueAmt;
    }
    const wynik = przychody - koszty;
    const marza = przychody > 0 ? (wynik / przychody) * 100 : null;
    return { project: p, przychody, koszty, wynik, marza };
  });
}

export function budgetCostPlnForProject(invoices, projectId) {
  return invoices
    .filter((i) => i.project_id === projectId && i.invoice_type !== "sales")
    .reduce((s, i) => s + (getInvoicePlnAtIssue(i) ?? 0), 0);
}

/** @see FINANCE_METRICS.budgetUtilizationPln */
export function budgetAlertsPln(projects, invoices, threshold = 0.8) {
  const alerts = [];
  for (const p of projects) {
    const budget = PLN(p.budget_planned);
    if (budget <= 0) continue;
    const cost = budgetCostPlnForProject(invoices, p.id);
    const ratio = cost / budget;
    if (ratio >= threshold) {
      alerts.push({ project: p, cost, budget, ratio });
    }
  }
  return alerts;
}
