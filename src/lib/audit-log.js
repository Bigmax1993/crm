/**
 * Dziennik zdarzeń biznesowych (kto / co / kiedy).
 */
import { base44 } from "@/api/base44Client";
import { newLocalId } from "@/lib/crm-local-store";

export const AUDIT_ACTIONS = {
  INVOICE_STATUS: "zmiana_statusu_fv",
  INVOICE_RECONCILE: "rozliczenie_przelewu",
  REFUND_UPDATE: "aktualizacja_zwrotu",
  LEAD_UPDATE: "aktualizacja_leadu",
  PROJECT_UPDATE: "aktualizacja_projektu",
};

export const AUDIT_ACTION_LABELS = {
  [AUDIT_ACTIONS.INVOICE_STATUS]: "Zmiana statusu faktury",
  [AUDIT_ACTIONS.INVOICE_RECONCILE]: "Rozliczenie przelewu z FV",
  [AUDIT_ACTIONS.REFUND_UPDATE]: "Aktualizacja zwrotu",
  [AUDIT_ACTIONS.LEAD_UPDATE]: "Aktualizacja leadu",
  [AUDIT_ACTIONS.PROJECT_UPDATE]: "Aktualizacja projektu",
};

function formatDetail(detail) {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

/** @param {{ action: string, entity_type: string, entity_id?: string, summary: string, detail?: object|string, actor?: string }} entry */
export async function logAuditEvent(entry) {
  const row = {
    id: newLocalId("audit"),
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id || "",
    summary: entry.summary,
    detail: formatDetail(entry.detail),
    actor: entry.actor || "system",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (base44?.entities?.AuditLog) {
    try {
      await base44.entities.AuditLog.create(row);
      return row;
    } catch {
      /* zapas poniżej */
    }
  }

  try {
    const key = "fakturowo_audit_log_v1";
    const prev = JSON.parse(localStorage.getItem(key) || "[]");
    prev.unshift(row);
    localStorage.setItem(key, JSON.stringify(prev.slice(0, 500)));
  } catch {
    /* ignore */
  }
  return row;
}

export async function listAuditLog(limit = 50) {
  if (base44?.entities?.AuditLog) {
    try {
      const rows = await base44.entities.AuditLog.list("-created_at");
      return rows.slice(0, limit);
    } catch {
      /* zapas */
    }
  }
  try {
    const key = "fakturowo_audit_log_v1";
    return JSON.parse(localStorage.getItem(key) || "[]").slice(0, limit);
  } catch {
    return [];
  }
}
