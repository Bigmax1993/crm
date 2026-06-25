/**
 * Powiadomienia biznesowe (terminy płatności, budżet, zwroty) — teksty po polsku.
 */
import { parseISO, differenceInCalendarDays, isValid } from "date-fns";
import { budgetAlertsPln } from "@/lib/finance-pln";
import { isRefundFollowUpOverdue } from "@/lib/refund-claims";
import { activeProjectsCount } from "@/lib/finance";

const SETTINGS_KEY = "fakturowo_powiadomienia_v1";

export const DEFAULT_NOTIFICATION_SETTINGS = {
  wlaczone: true,
  dni_przed_terminem: 3,
  prog_budzetu_pct: 80,
};

export function loadNotificationSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_SETTINGS };
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

export function saveNotificationSettings(settings) {
  const next = { ...DEFAULT_NOTIFICATION_SETTINGS, ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("fakturowo-notify-settings"));
  return next;
}

function deadlineDays(invoice) {
  const raw = invoice.payment_deadline || invoice.issue_date;
  if (!raw) return null;
  const d = parseISO(String(raw).slice(0, 10));
  if (!isValid(d)) return null;
  return differenceInCalendarDays(d, new Date());
}

/**
 * @returns {Array<{ id: string, severity: 'warning'|'danger'|'info', title: string, body: string, href?: string }>}
 */
export function buildBusinessNotifications({
  invoices = [],
  projects = [],
  refundClaims = [],
  settings = loadNotificationSettings(),
}) {
  if (!settings.wlaczone) return [];

  const items = [];
  const openPurchases = invoices.filter(
    (i) => i.invoice_type !== "sales" && (i.status === "unpaid" || i.status === "overdue")
  );

  for (const inv of openPurchases) {
    const days = deadlineDays(inv);
    if (days == null) continue;
    const nr = inv.invoice_number || "bez numeru";
    if (days < 0) {
      items.push({
        id: `fv-overdue-${inv.id}`,
        severity: "danger",
        title: "Faktura po terminie",
        body: `${nr} — termin minął ${Math.abs(days)} dni temu`,
        href: "/CEODashboard",
      });
    } else if (days <= settings.dni_przed_terminem) {
      items.push({
        id: `fv-due-${inv.id}`,
        severity: "warning",
        title: "Zbliża się termin płatności",
        body: `${nr} — za ${days} dni`,
        href: "/CEODashboard",
      });
    }
  }

  const alerts = budgetAlertsPln(projects, invoices, settings.prog_budzetu_pct / 100);
  for (const a of alerts.slice(0, 5)) {
    const name = a.project.object_name || a.project.city || "Projekt";
    items.push({
      id: `budget-${a.project.id}`,
      severity: "warning",
      title: "Próg budżetu projektu",
      body: `${name}: ${(a.ratio * 100).toFixed(0)}% budżetu wykorzystane`,
      href: "/ProjectCostMonitoring",
    });
  }

  for (const claim of refundClaims || []) {
    if (!isRefundFollowUpOverdue(claim)) continue;
    items.push({
      id: `refund-${claim.id}`,
      severity: "warning",
      title: "Zwrot po terminie follow-up",
      body: `${claim.supplier_name || "Dostawca"} — ${claim.invoice_number || "bez nr FV"}`,
      href: "/ExpectedRefunds",
    });
  }

  if (activeProjectsCount(projects) === 0 && projects.length > 0) {
    items.push({
      id: "no-active-projects",
      severity: "info",
      title: "Brak aktywnych projektów",
      body: "Wszystkie obiekty są zaplanowane, zawieszone lub zakończone.",
      href: "/Construction",
    });
  }

  const order = { danger: 0, warning: 1, info: 2 };
  return items.sort((a, b) => order[a.severity] - order[b.severity]);
}
