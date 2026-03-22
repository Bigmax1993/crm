import { format, parseISO, startOfMonth, isValid } from "date-fns";

const PLN = (v) => (typeof v === "number" && !Number.isNaN(v) ? v : 0);

export function invoicePaidDate(inv) {
  if (inv.paid_at && isValid(parseISO(String(inv.paid_at)))) return parseISO(String(inv.paid_at));
  if (inv.issue_date && isValid(parseISO(String(inv.issue_date)))) return parseISO(String(inv.issue_date));
  return null;
}

export function isUnpaidStatus(status) {
  return status === "unpaid" || status === "overdue";
}

/** Należności: faktury sprzedażowe niezapłacone */
export function sumReceivables(invoices, currency = "PLN") {
  return invoices
    .filter((i) => i.invoice_type === "sales" && isUnpaidStatus(i.status) && (i.currency || "PLN") === currency)
    .reduce((s, i) => s + PLN(i.amount), 0);
}

/** Zobowiązania: faktury zakupowe niezapłacone */
export function sumPayables(invoices, currency = "PLN") {
  return invoices
    .filter((i) => i.invoice_type !== "sales" && isUnpaidStatus(i.status) && (i.currency || "PLN") === currency)
    .reduce((s, i) => s + PLN(i.amount), 0);
}

export function monthlyRevenueVsCost(invoices, currency = "PLN") {
  const map = {};
  for (const inv of invoices) {
    if ((inv.currency || "PLN") !== currency) continue;
    const d = inv.issue_date && isValid(parseISO(String(inv.issue_date))) ? parseISO(String(inv.issue_date)) : null;
    if (!d) continue;
    const key = format(startOfMonth(d), "yyyy-MM");
    if (!map[key]) map[key] = { month: key, przychody: 0, koszty: 0 };
    const amt = PLN(inv.amount);
    if (inv.invoice_type === "sales") map[key].przychody += amt;
    else map[key].koszty += amt;
  }
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
}

export function monthlyCashFlowPaid(invoices, currency = "PLN") {
  const map = {};
  for (const inv of invoices) {
    if ((inv.currency || "PLN") !== currency) continue;
    if (inv.status !== "paid") continue;
    const d = invoicePaidDate(inv);
    if (!d) continue;
    const key = format(startOfMonth(d), "yyyy-MM");
    if (!map[key]) map[key] = { month: key, wplywy: 0, wydatki: 0, saldo: 0 };
    const amt = PLN(inv.amount);
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

export function costByProject(invoices, projects, currency = "PLN") {
  const byId = {};
  for (const p of projects) {
    byId[p.id] = { name: p.object_name || p.city || p.id, koszt: 0 };
  }
  for (const inv of invoices) {
    if (inv.invoice_type === "sales") continue;
    if ((inv.currency || "PLN") !== currency) continue;
    const pid = inv.project_id;
    if (pid && byId[pid]) byId[pid].koszt += PLN(inv.amount);
  }
  return Object.values(byId).filter((x) => x.koszt > 0);
}

export function projectProfitability(invoices, projects, currency = "PLN") {
  return projects.map((p) => {
    let przychody = 0;
    let koszty = 0;
    for (const inv of invoices) {
      if ((inv.currency || "PLN") !== currency) continue;
      if (inv.project_id !== p.id) continue;
      if (inv.invoice_type === "sales" && inv.status === "paid") przychody += PLN(inv.amount);
      if (inv.invoice_type !== "sales") koszty += PLN(inv.amount);
    }
    const wynik = przychody - koszty;
    const marza = przychody > 0 ? (wynik / przychody) * 100 : null;
    return {
      project: p,
      przychody,
      koszty,
      wynik,
      marza,
    };
  });
}

export function activeProjectsCount(projects) {
  return projects.filter((p) => {
    if (p.workflow_status === "zaplacono") return false;
    if (p.workflow_status) return true;
    return p.status === "aktywny";
  }).length;
}

export function budgetAlerts(projects, invoices, threshold = 0.8) {
  const alerts = [];
  for (const p of projects) {
    const budget = PLN(p.budget_planned);
    if (budget <= 0) continue;
    const cost = invoices
      .filter((i) => i.project_id === p.id && i.invoice_type !== "sales")
      .reduce((s, i) => s + PLN(i.amount), 0);
    const ratio = cost / budget;
    if (ratio >= threshold) {
      alerts.push({ project: p, cost, budget, ratio });
    }
  }
  return alerts;
}

export function overdueInvoices(invoices) {
  const today = new Date();
  return invoices.filter((i) => {
    if (!isUnpaidStatus(i.status)) return false;
    if (!i.payment_deadline) return false;
    const d = parseISO(String(i.payment_deadline));
    return isValid(d) && d < today;
  });
}

export function globalPL(invoices, currency = "PLN") {
  let przychody = 0;
  let koszty = 0;
  for (const inv of invoices) {
    if ((inv.currency || "PLN") !== currency) continue;
    if (inv.status !== "paid") continue;
    if (inv.invoice_type === "sales") przychody += PLN(inv.amount);
    else koszty += PLN(inv.amount);
  }
  const brutto = przychody - koszty;
  const marzaPct = przychody > 0 ? (brutto / przychody) * 100 : null;
  return { przychody, koszty, brutto, marzaPct };
}

export function plByProject(invoices, projects, currency = "PLN") {
  return projects.map((p) => {
    let przychody = 0;
    let koszty = 0;
    for (const inv of invoices) {
      if ((inv.currency || "PLN") !== currency) continue;
      if (inv.project_id !== p.id) continue;
      if (inv.invoice_type === "sales" && inv.status === "paid") przychody += PLN(inv.amount);
      if (inv.invoice_type !== "sales" && inv.status === "paid") koszty += PLN(inv.amount);
    }
    const brutto = przychody - koszty;
    const marzaPct = przychody > 0 ? (brutto / przychody) * 100 : null;
    return { project: p, przychody, koszty, brutto, marzaPct };
  });
}

export function quarterlyYoYTrend(invoices, currency = "PLN") {
  const qKey = (d) => {
    const m = d.getMonth();
    const q = Math.floor(m / 3) + 1;
    return `${d.getFullYear()}-Q${q}`;
  };
  const bucket = {};
  for (const inv of invoices) {
    if ((inv.currency || "PLN") !== currency) continue;
    if (inv.status !== "paid") continue;
    const d = invoicePaidDate(inv);
    if (!d) continue;
    const k = qKey(d);
    if (!bucket[k]) bucket[k] = { key: k, przychody: 0, koszty: 0 };
    if (inv.invoice_type === "sales") bucket[k].przychody += PLN(inv.amount);
    else bucket[k].koszty += PLN(inv.amount);
  }
  return Object.values(bucket)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((b) => ({
      ...b,
      wynik: b.przychody - b.koszty,
    }));
}

export function forecastFromLast3Months(monthlyRows) {
  const last = monthlyRows.slice(-3);
  if (last.length === 0) return { avgIn: 0, avgOut: 0, avgNet: 0 };
  const avgIn = last.reduce((s, r) => s + r.wplywy, 0) / last.length;
  const avgOut = last.reduce((s, r) => s + r.wydatki, 0) / last.length;
  return { avgIn, avgOut, avgNet: avgIn - avgOut };
}
