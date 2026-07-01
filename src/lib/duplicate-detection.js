/**
 * Normalizacja numeru faktury do porównań (spacje, wielkość liter, myślniki).
 */
export function normalizeInvoiceNumberKey(raw) {
  if (raw == null) return "";
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[–—−]/g, "-");
}

/**
 * Czy dwa numery faktury uznajemy za ten sam (dokładnie lub jeden zawiera drugi po normalizacji).
 */
export function invoiceNumberMatches(a, b) {
  const ka = normalizeInvoiceNumberKey(a);
  const kb = normalizeInvoiceNumberKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  return ka.includes(kb) || kb.includes(ka);
}

/** Pierwsza istniejąca faktura o tym samym numerze (wg dopasowania powyżej). */
export function findDuplicateInvoice(existingInvoices, candidate) {
  const num = candidate?.invoice_number;
  if (!String(num ?? "").trim()) return null;
  return existingInvoices.find((ex) => invoiceNumberMatches(ex.invoice_number, num)) ?? null;
}

/**
 * Duplikat numeru względem listy, z pominięciem rekordu o danym id (edycja).
 * @returns {object | null} — konfliktująca faktura lub null
 */
export function findInvoiceNumberConflict(existingInvoices, invoiceNumber, excludeId) {
  if (!String(invoiceNumber ?? "").trim()) return null;
  return (
    existingInvoices.find(
      (ex) => ex.id !== excludeId && invoiceNumberMatches(ex.invoice_number, invoiceNumber)
    ) ?? null
  );
}

/**
 * Odcisk przelewu: ta sama data, kwota, waluta, konto, tytuł i kontrahent → uznajemy za duplikat importu.
 */
export function transferFingerprint(t) {
  const date = String(t.transfer_date || "").trim().slice(0, 10);
  const amt = Number(t.amount);
  const rounded = Number.isFinite(amt) ? Math.round(amt * 100) / 100 : 0;
  const cur = String(t.currency || "PLN")
    .trim()
    .toUpperCase();
  const acc = String(t.account_number || "")
    .replace(/\s/g, "")
    .toLowerCase();
  const title = String(t.title || "")
    .trim()
    .toLowerCase()
    .slice(0, 240);
  const contractor = String(t.contractor_name || "")
    .trim()
    .toLowerCase()
    .slice(0, 160);
  return `${date}|${rounded}|${cur}|${acc}|${title}|${contractor}`;
}

/** Alias — ten sam mechanizm co dla faktur (WZ, LV, dokumenty). */
export const normalizeDocumentNumberKey = normalizeInvoiceNumberKey;

/** Alias — dopasowanie numerów dokumentów. */
export const documentNumberMatches = invoiceNumberMatches;

/** WZ / dostawa materiałów — duplikat po numerze WZ. */
export function findDuplicateMaterialDelivery(existing, candidate) {
  const num = candidate?.document_number;
  if (!String(num ?? "").trim()) return null;
  return existing.find((ex) => documentNumberMatches(ex.document_number, num)) ?? null;
}

export function findMaterialDeliveryNumberConflict(existing, documentNumber, excludeId) {
  if (!String(documentNumber ?? "").trim()) return null;
  return (
    existing.find(
      (ex) => ex.id !== excludeId && documentNumberMatches(ex.document_number, documentNumber)
    ) ?? null
  );
}

/** Klucz duplikatu LV: numer LV lub para tytuł + data. */
export function lvDuplicateKey(row) {
  const num = normalizeDocumentNumberKey(row?.document_number);
  if (num) return `nr:${num}`;
  const title = String(row?.title ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const date = String(row?.issue_date ?? "").trim().slice(0, 10);
  if (title && date) return `td:${title}|${date}`;
  if (title) return `t:${title.slice(0, 160)}`;
  return "";
}

export function lvRecordsMatch(a, b) {
  const ka = lvDuplicateKey(a);
  const kb = lvDuplicateKey(b);
  if (ka && kb && ka === kb) return true;
  const na = String(a?.document_number ?? "").trim();
  const nb = String(b?.document_number ?? "").trim();
  if (na && nb && documentNumberMatches(na, nb)) return true;
  return false;
}

/** Kosztorys LV — duplikat w bazie. */
export function findDuplicateProjectBoQ(existing, candidate) {
  if (!lvDuplicateKey(candidate)) return null;
  return existing.find((ex) => lvRecordsMatch(ex, candidate)) ?? null;
}

export function findProjectBoQConflict(existing, candidate, excludeId) {
  if (!lvDuplicateKey(candidate)) return null;
  return existing.find((ex) => ex.id !== excludeId && lvRecordsMatch(ex, candidate)) ?? null;
}

/**
 * Oznacza duplikaty w paczce importu (baza + ta sama paczka).
 * @returns {object[]}
 */
export function applyImportDuplicateFlags(rows, existing, options) {
  const {
    matches,
    getBatchKey,
    entityLabel,
    numberLabel = "numer",
    duplicateInDbMessage,
    duplicateInBatchMessage,
  } = options;
  const result = rows.map((r) => ({ ...r, _rejected: Boolean(r._rejected) }));
  const seenBatch = new Set();

  for (let i = 0; i < result.length; i++) {
    const row = result[i];
    if (row._rejected) continue;

    const batchKey = getBatchKey(row);
    if (!batchKey) continue;

    const dupInDb = existing.find((ex) => matches(ex, row));
    if (dupInDb) {
      const num =
        String(row.document_number ?? row.invoice_number ?? row.title ?? "").trim() || batchKey;
      result[i] = {
        ...row,
        _rejected: true,
        _systemDuplicate: true,
        _duplicateReason:
          duplicateInDbMessage?.(row, dupInDb) ??
          `${entityLabel} „${num}” jest już w systemie — pozycja odrzucona z importu.`,
      };
      continue;
    }

    if (seenBatch.has(batchKey)) {
      const num =
        String(row.document_number ?? row.invoice_number ?? row.title ?? "").trim() || batchKey;
      result[i] = {
        ...row,
        _rejected: true,
        _systemDuplicate: false,
        _duplicateReason:
          duplicateInBatchMessage?.(row) ??
          `${entityLabel} „${num}” występuje więcej niż raz w tej paczce — pozostawiono pierwsze wystąpienie.`,
      };
    } else {
      seenBatch.add(batchKey);
    }
  }

  return result;
}

export function summarizeImportDuplicates(rows) {
  const systemDup = rows.filter((r) => r._systemDuplicate).length;
  const batchDup = rows.filter((r) => r._duplicateReason && !r._systemDuplicate).length;
  return { systemDup, batchDup };
}

/** Filtruje wiersze do zapisu — pomija odrzucone i duplikaty względem bazy / paczki. */
export function filterRowsForImportSave(rows, existing, { matches, getBatchKey }) {
  const kept = [];
  let duplicatesInDb = 0;
  let duplicatesInBatch = 0;
  const seen = new Set();

  for (const row of rows) {
    if (row._rejected) continue;
    const batchKey = getBatchKey(row);
    if (!batchKey) {
      kept.push(row);
      continue;
    }
    if (existing.some((ex) => matches(ex, row))) {
      duplicatesInDb += 1;
      continue;
    }
    if (seen.has(batchKey)) {
      duplicatesInBatch += 1;
      continue;
    }
    seen.add(batchKey);
    kept.push(row);
  }

  return { kept, duplicatesInDb, duplicatesInBatch };
}

export const WZ_DUPLICATE_OPTIONS = {
  matches: (ex, row) => documentNumberMatches(ex.document_number, row.document_number),
  getBatchKey: (row) => normalizeDocumentNumberKey(row.document_number),
  entityLabel: "WZ",
  numberLabel: "numer WZ",
};

export const LV_DUPLICATE_OPTIONS = {
  matches: (ex, row) => lvRecordsMatch(ex, row),
  getBatchKey: (row) => lvDuplicateKey(row),
  entityLabel: "LV",
  numberLabel: "kosztorys",
};

/** Plan budowy — duplikat po numerze arkusza + rewizja lub tytuł + data. */
export function planDuplicateKey(row) {
  const sheet = normalizeDocumentNumberKey(row?.sheet_number);
  const rev = normalizeDocumentNumberKey(row?.revision);
  if (sheet && rev) return `sr:${sheet}|${rev}`;
  if (sheet) return `s:${sheet}`;
  const title = String(row?.title ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const date = String(row?.issue_date ?? "").trim().slice(0, 10);
  if (title && date) return `td:${title}|${date}`;
  if (title) return `t:${title.slice(0, 160)}`;
  return "";
}

export function planRecordsMatch(a, b) {
  const ka = planDuplicateKey(a);
  const kb = planDuplicateKey(b);
  if (ka && kb && ka === kb) return true;
  const sa = String(a?.sheet_number ?? "").trim();
  const sb = String(b?.sheet_number ?? "").trim();
  if (sa && sb && documentNumberMatches(sa, sb)) {
    const ra = normalizeDocumentNumberKey(a?.revision);
    const rb = normalizeDocumentNumberKey(b?.revision);
    if (!ra || !rb || ra === rb) return true;
  }
  return false;
}

export function findDuplicateConstructionPlan(existing, candidate) {
  if (!planDuplicateKey(candidate)) return null;
  return existing.find((ex) => planRecordsMatch(ex, candidate)) ?? null;
}

export const PLAN_DUPLICATE_OPTIONS = {
  matches: (ex, row) => planRecordsMatch(ex, row),
  getBatchKey: (row) => planDuplicateKey(row),
  entityLabel: "Plan budowy",
  numberLabel: "arkusz",
};

export const INVOICE_DUPLICATE_OPTIONS = {
  matches: (ex, row) => invoiceNumberMatches(ex.invoice_number, row.invoice_number),
  getBatchKey: (row) => normalizeInvoiceNumberKey(row.invoice_number),
  entityLabel: "Faktura",
  numberLabel: "numer faktury",
  duplicateInDbMessage: (row) =>
    `Numer faktury „${String(row.invoice_number ?? "").trim()}” jest już w systemie — pozycja odrzucona z importu.`,
  duplicateInBatchMessage: (row) =>
    `Numer „${String(row.invoice_number ?? "").trim()}” występuje więcej niż raz w tej paczce — pozostawiono pierwsze wystąpienie.`,
};
