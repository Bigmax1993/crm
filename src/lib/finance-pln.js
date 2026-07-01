/**
 * Agregaty finansowe w **PLN** (`amount_pln`, kurs NBP z wystawienia / płatności).
 * Zestawienie definicji metryk: `finance-metric-definitions.js`.
 */
import { format, parseISO, startOfMonth, isValid } from "date-fns";
import {
  filterProjectsForReportingCurrency,
  projectReportingCurrency,
} from "@/lib/match-project";

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

/** Kwota faktury w walucie źródłowej (bez przeliczenia na PLN). */
export function getInvoiceSourceAmount(inv) {
  const currency = String(inv?.currency || "PLN").toUpperCase();
  const amount = Number(inv?.amount);
  if (Number.isFinite(amount)) return { amount, currency };
  if (currency === "PLN") {
    const pln = getInvoicePlnAtIssue(inv);
    if (pln != null) return { amount: pln, currency: "PLN" };
  }
  return null;
}

export function formatInvoiceSourceAmount(inv, locale = "pl-PL") {
  const src = getInvoiceSourceAmount(inv);
  if (!src) return "—";
  return `${src.amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${src.currency}`;
}

/** Suma zobowiązań wg waluty FV (do widoku listy — bez przeliczania na PLN). */
export function sumOpenPayablesByCurrency(invoices) {
  const map = {};
  for (const inv of invoices) {
    const src = getInvoiceSourceAmount(inv);
    if (!src) continue;
    map[src.currency] = (map[src.currency] || 0) + src.amount;
  }
  return Object.entries(map)
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function formatPayablesTotalsByCurrency(invoices, locale = "pl-PL") {
  const parts = sumOpenPayablesByCurrency(invoices);
  if (!parts.length) return "0,00 PLN";
  return parts
    .map(
      (p) =>
        `${p.amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${p.currency}`
    )
    .join(" · ");
}

/** Linie KPI „Suma zobowiązań” — kwoty w walucie FV oraz PLN (szac. NBP) gdy są FV w obcej walucie. */
export function payablesKpiDisplayLines(invoices, locale = "pl-PL") {
  const parts = sumOpenPayablesByCurrency(invoices);
  if (!parts.length) return ["0,00 PLN"];

  const sourceLine = formatPayablesTotalsByCurrency(invoices, locale);
  const hasForeign = parts.some((p) => p.currency !== "PLN" && p.amount > 0);
  const hasPlnSource = parts.some((p) => p.currency === "PLN" && p.amount > 0);
  const plnEstimate = invoices.reduce((s, i) => s + (getInvoicePlnAtIssue(i) ?? 0), 0);

  const lines = [sourceLine];

  if (hasForeign && plnEstimate > 0) {
    const plnStr = `${plnEstimate.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} PLN`;
    lines.push(hasPlnSource ? `łącznie szac. ${plnStr} (NBP)` : `${plnStr} (szac. NBP)`);
  }

  return lines;
}

export function normalizeInvoiceCurrency(inv) {
  return String(inv?.currency || "PLN").toUpperCase();
}

/** Kwota FV w żądanej walucie źródłowej (bez przeliczenia NBP). */
export function getInvoiceAmountInCurrency(inv, currency) {
  const target = String(currency || "PLN").toUpperCase();
  const src = getInvoiceSourceAmount(inv);
  if (!src || src.currency !== target) return null;
  return src.amount;
}

export function getInvoicePaidAmountInCurrency(inv, currency) {
  if (inv.status !== "paid") return null;
  return getInvoiceAmountInCurrency(inv, currency);
}

/** Waluty występujące w kosztach przypisanych do projektów (do osobnych wykresów CEO). */
export function currenciesInProjectCosts(invoices) {
  const set = new Set();
  for (const inv of invoices) {
    if (inv.invoice_type === "sales") continue;
    if (!inv.project_id) continue;
    const cur = normalizeInvoiceCurrency(inv);
    const amt = getInvoiceAmountInCurrency(inv, cur);
    if (amt != null && amt > 0) set.add(cur);
  }
  return sortProjectChartCurrencies([...set]);
}

/** Wszystkie waluty FV przypisanych do projektów (koszty, sprzedaż, opłacone). */
export function currenciesInProjectMetrics(invoices, projects = []) {
  const set = new Set();
  for (const inv of invoices) {
    if (!inv.project_id) continue;
    const cur = normalizeInvoiceCurrency(inv);
    const src = getInvoiceSourceAmount(inv);
    if (src && src.currency === cur && src.amount > 0) set.add(cur);
  }
  for (const p of projects) {
    const assigned = projectReportingCurrency(p);
    if (assigned) set.add(assigned);
  }
  return sortProjectChartCurrencies([...set]);
}

function sortProjectChartCurrencies(currencies) {
  return currencies.sort((a, b) => {
    if (a === "PLN") return -1;
    if (b === "PLN") return 1;
    return a.localeCompare(b);
  });
}

export function costByProjectInCurrency(invoices, projects, currency) {
  const eligible = filterProjectsForReportingCurrency(projects, currency);
  const byId = {};
  for (const p of eligible) {
    byId[p.id] = { project: p, koszt: 0 };
  }
  for (const inv of invoices) {
    if (inv.invoice_type === "sales") continue;
    const pid = inv.project_id;
    if (!pid || !byId[pid]) continue;
    const amt = getInvoiceAmountInCurrency(inv, currency);
    if (amt == null) continue;
    byId[pid].koszt += amt;
  }
  return Object.values(byId)
    .filter((x) => x.koszt > 0)
    .map((x) => ({ ...x, koszt: Math.round(x.koszt * 100) / 100 }));
}

export function projectProfitabilityInCurrency(invoices, projects, currency) {
  const eligible = filterProjectsForReportingCurrency(projects, currency);
  return eligible.map((p) => {
    let przychody = 0;
    let koszty = 0;
    for (const inv of invoices) {
      if (inv.project_id !== p.id) continue;
      if (inv.invoice_type === "sales") {
        if (inv.status === "paid") {
          const a = getInvoicePaidAmountInCurrency(inv, currency);
          if (a != null) przychody += a;
        }
      } else {
        const a = getInvoiceAmountInCurrency(inv, currency);
        if (a != null) koszty += a;
      }
    }
    const wynik = Math.round((przychody - koszty) * 100) / 100;
    const marza = przychody > 0 ? (wynik / przychody) * 100 : null;
    return { project: p, przychody, koszty, wynik, marza };
  });
}

export function plByProjectInCurrency(invoices, projects, currency) {
  const eligible = filterProjectsForReportingCurrency(projects, currency);
  return eligible.map((p) => {
    let przychody = 0;
    let koszty = 0;
    for (const inv of invoices) {
      if (inv.project_id !== p.id) continue;
      if (inv.status !== "paid") continue;
      const a = getInvoicePaidAmountInCurrency(inv, currency);
      if (a == null) continue;
      if (inv.invoice_type === "sales") przychody += a;
      else koszty += a;
    }
    const brutto = Math.round((przychody - koszty) * 100) / 100;
    const marzaPct = przychody > 0 ? (brutto / przychody) * 100 : null;
    return { project: p, przychody, koszty, brutto, wynik: brutto, marzaPct };
  });
}

export function formatCurrencyAmount(value, currency, locale = "pl-PL") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
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

function expensePeriodKey(d, period) {
  if (period === "year") return format(d, "yyyy");
  if (period === "quarter") {
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `${d.getFullYear()}-Q${q}`;
  }
  return format(startOfMonth(d), "yyyy-MM");
}

/** Etykieta osi X dla wykresu wydatków projektu. */
export function formatProjectExpensePeriodLabel(periodKey, period = "month") {
  if (period === "year") return periodKey;
  if (period === "quarter") {
    const m = String(periodKey).match(/^(\d{4})-Q([1-4])$/);
    if (m) return `Q${m[2]} ${m[1]}`;
    return periodKey;
  }
  const m = String(periodKey).match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[2]}/${m[1]}`;
  return periodKey;
}

/** Data do wykresu wydatków projektu: wystawienie, potem płatność. */
export function invoiceExpenseDate(inv) {
  if (inv.issue_date && isValid(parseISO(String(inv.issue_date)))) return parseISO(String(inv.issue_date));
  return invoicePaidDate(inv);
}

/** Kwota wydatku w walucie raportowania projektu (EUR dla REWE/EDEKA) lub PLN. */
export function projectExpenseAmountForReporting(inv, reportingCurrency) {
  const cur = String(reportingCurrency || "PLN").toUpperCase();
  if (cur !== "PLN") {
    const src = getInvoiceAmountInCurrency(inv, cur);
    if (src != null) return src;
  }
  return getInvoicePlnAtIssue(inv);
}

/**
 * Wydatki (FV zakupowe) jednego projektu wg miesiąca, kwartału lub roku.
 * Dla projektów DE (REWE/EDEKA) sumuje w EUR jak wykres „Koszty wg projektu”.
 * @param {'month'|'quarter'|'year'} [period='month']
 */
export function projectExpensesByPeriod(invoices, projectId, period = "month", project = null) {
  if (!projectId) return [];
  const reportingCurrency = project ? projectReportingCurrency(project) : null;
  const currency = reportingCurrency || "PLN";
  const map = {};
  for (const inv of invoices) {
    if (inv.project_id !== projectId) continue;
    if (inv.invoice_type === "sales") continue;
    const d = invoiceExpenseDate(inv);
    if (!d) continue;
    const amt = projectExpenseAmountForReporting(inv, currency);
    if (amt == null) continue;
    const key = expensePeriodKey(d, period);
    if (!map[key]) map[key] = { period: key, wydatki: 0, currency };
    map[key].wydatki += amt;
  }
  return Object.values(map)
    .map((r) => ({ ...r, wydatki: Math.round(r.wydatki * 100) / 100 }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Wydatki (FV zakupowe) jednego projektu wg miesiąca, kwartału lub roku (data wystawienia, PLN z wystawienia).
 * @param {'month'|'quarter'|'year'} [period='month']
 * @deprecated Preferuj projectExpensesByPeriod z obiektem projektu (obsługa EUR).
 */
export function projectExpensesByPeriodPln(invoices, projectId, period = "month") {
  return projectExpensesByPeriod(invoices, projectId, period, null).map(({ period: p, wydatki }) => ({
    period: p,
    wydatki,
  }));
}

/** Nieopłacone FV zakupowe — jak sumPayablesPln, posortowane: przeterminowane, potem termin. */
export function openPayableInvoices(invoices) {
  return invoices
    .filter((i) => i.invoice_type !== "sales" && isUnpaidStatus(i.status))
    .sort((a, b) => {
      if (a.status === "overdue" && b.status !== "overdue") return -1;
      if (b.status === "overdue" && a.status !== "overdue") return 1;
      const da = a.payment_deadline || "9999-99-99";
      const db = b.payment_deadline || "9999-99-99";
      return String(da).localeCompare(String(db));
    });
}
