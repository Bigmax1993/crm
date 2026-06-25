/** NIP / VAT do porównań: cyfry; dla DE zachowaj prefiks DE. */
export function invoiceNipDigits(nip) {
  return String(nip ?? "").replace(/\D/g, "");
}

export function normalizeTaxId(raw) {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s/g, "");
  if (s.startsWith("DE")) return s;
  return invoiceNipDigits(s);
}

export function normalizePostalCode(raw) {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s/g, "")
    .replace(/-/g, "");
}

/** Kraj faktury: EUR/PLN, VAT DE, NIP PL, słowa z dokumentu. */
export function inferInvoiceCountry(invoice) {
  const cur = String(invoice.currency ?? "").toUpperCase();
  if (cur === "EUR") return "DE";
  if (cur === "PLN") return "PL";

  for (const field of [invoice.contractor_nip, invoice.seller_nip]) {
    const v = String(field ?? "").trim().toUpperCase();
    if (v.startsWith("DE")) return "DE";
    const digits = invoiceNipDigits(v);
    if (digits.length === 10) return "PL";
  }

  const hay = `${invoice.position || ""} ${invoice.invoice_lines || ""} ${invoice.order_number || ""}`.toLowerCase();
  if (/\b(rechnung|ust-idnr|ust-id|mwst|filiale|baustelle|auftragsnummer|bestellnummer)\b/.test(hay)) {
    return "DE";
  }
  if (/\b(faktura\s+vat|nabywca|sprzedawca|nip)\b/.test(hay)) return "PL";

  return null;
}

/** Kraj projektu: kod PL (XX-XXX), pierwsze słowo kluczowe PL/DE. */
export function inferProjectCountry(project) {
  const rawPostal = String(project.postal_code ?? "").trim();
  if (/^\d{2}-\d{3}$/i.test(rawPostal)) return "PL";

  const kw = String(project.project_match_keywords ?? "").trim();
  const first = kw
    .split(/[,;\n]/)
    .map((x) => x.trim().toUpperCase())
    .find(Boolean);
  if (first === "PL" || first === "DE") return first;

  return null;
}

/** Sieci DE raportowane wyłącznie w EUR na pulpicie CEO (np. REWE, EDEKA). */
const EUR_ONLY_RETAIL_PATTERN = /\b(rewe|edeka)\b/i;

/**
 * Waluta raportowania projektu na wykresach CEO (PLN | EUR | null).
 * null = brak przypisania — projekt pojawia się tylko w sekcji waluty, w której ma FV.
 */
export function projectReportingCurrency(project) {
  if (!project) return null;
  const country = inferProjectCountry(project);
  if (country === "DE") return "EUR";
  if (country === "PL") return "PLN";

  const hay = [project.object_name, project.client_name, project.project_match_keywords]
    .filter(Boolean)
    .join(" ");
  if (EUR_ONLY_RETAIL_PATTERN.test(hay)) return "EUR";

  return null;
}

export function projectIncludedInReportingCurrency(project, currency) {
  const assigned = projectReportingCurrency(project);
  const cur = String(currency || "PLN").toUpperCase();
  if (!assigned) return true;
  return assigned === cur;
}

export function filterProjectsForReportingCurrency(projects, currency) {
  return (projects || []).filter((p) => projectIncludedInReportingCurrency(p, currency));
}

function filterProjectsByCountry(projects, invoiceCountry) {
  if (!invoiceCountry) return projects;
  const withHint = projects.filter((p) => inferProjectCountry(p));
  if (withHint.length === 0) return projects;
  return projects.filter((p) => {
    const pc = inferProjectCountry(p);
    return !pc || pc === invoiceCountry;
  });
}

function invoiceHaystack(invoice) {
  return `${invoice.position || ""} ${invoice.invoice_lines || ""} ${invoice.order_number || ""} ${invoice.invoice_number || ""}`.toLowerCase();
}

function keywordParts(raw) {
  return String(raw ?? "")
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter((x) => {
      const u = x.toUpperCase();
      return u !== "PL" && u !== "DE";
    });
}

function orderTokens(invoice) {
  const parts = [
    invoice.order_number,
    invoice.invoice_number,
    invoice.position,
  ]
    .map((x) => String(x ?? "").trim().toLowerCase())
    .filter((x) => x.length >= 3);
  return [...new Set(parts)];
}

/**
 * Dopasowanie projektu z metadanymi (posadzki / market PL+DE).
 * @returns {{ project_id: string|null, reason: string|null, confidence: number }}
 */
export function matchProject(projects, invoice, options = {}) {
  const contractors = options.contractors || [];
  const invoiceCountry = inferInvoiceCountry(invoice);
  const candidates = filterProjectsByCountry(projects, invoiceCountry);
  const hay = invoiceHaystack(invoice);
  const orders = orderTokens(invoice);

  for (const p of candidates) {
    const nums = String(p.invoice_numbers ?? "").toLowerCase();
    if (!nums) continue;
    for (const o of orders) {
      if (o.length >= 4 && nums.includes(o)) {
        return { project_id: p.id, reason: "order", confidence: 95 };
      }
    }
  }

  for (const o of orders) {
    if (o.length < 4) continue;
    for (const p of candidates) {
      const parts = keywordParts(p.project_match_keywords).map((k) => k.toLowerCase());
      if (parts.some((k) => k.length >= 4 && (k === o || o.includes(k) || k.includes(o)))) {
        return { project_id: p.id, reason: "order", confidence: 90 };
      }
    }
  }

  for (const p of candidates) {
    const parts = keywordParts(p.project_match_keywords).map((k) => k.toLowerCase());
    for (const k of parts) {
      if (k.length >= 3 && hay.includes(k)) {
        return { project_id: p.id, reason: "keyword", confidence: 85 };
      }
    }
  }

  for (const p of candidates) {
    const pp = normalizePostalCode(p.postal_code);
    if (pp.length >= 4 && hay.includes(pp.toLowerCase())) {
      return { project_id: p.id, reason: "postal", confidence: 80 };
    }
  }

  for (const p of candidates) {
    const city = String(p.city ?? "")
      .trim()
      .toLowerCase();
    if (city.length >= 3 && hay.includes(city)) {
      return { project_id: p.id, reason: "city", confidence: 70 };
    }
  }

  const cn = (invoice.contractor_name || "").toLowerCase().trim();
  const sn = (invoice.seller_name || "").toLowerCase().trim();
  for (const p of candidates) {
    const client = (p.client_name || "").toLowerCase().trim();
    if (
      client &&
      client.length >= 3 &&
      (cn.includes(client) || client.includes(cn) || sn.includes(client) || client.includes(sn))
    ) {
      return { project_id: p.id, reason: "client", confidence: 65 };
    }
    const oname = (p.object_name || "").toLowerCase().trim();
    if (
      oname &&
      oname.length >= 4 &&
      (cn.includes(oname) || oname.includes(cn) || sn.includes(oname) || oname.includes(sn) || hay.includes(oname))
    ) {
      return { project_id: p.id, reason: "object", confidence: 60 };
    }
  }

  const sellerN = normalizeTaxId(invoice.seller_nip);
  const buyerN = normalizeTaxId(invoice.contractor_nip);
  for (const c of contractors) {
    if (c.type === "supplier") continue;
    const cn = normalizeTaxId(c.nip);
    const pid = c.default_project_id;
    if (!cn || !pid) continue;
    if (cn === sellerN || cn === buyerN) {
      const inCandidates = candidates.some((p) => p.id === pid);
      if (inCandidates || !invoiceCountry) {
        return { project_id: pid, reason: "nip_client", confidence: 55 };
      }
    }
  }

  return { project_id: null, reason: null, confidence: 0 };
}

/** @deprecated — używaj matchProject; zwraca samo id. */
export function matchProjectId(projects, invoice, options = {}) {
  return matchProject(projects, invoice, options).project_id;
}

export function projectMatchReasonLabel(reason) {
  const labels = {
    order: "nr zamówienia / PO",
    keyword: "słowo kluczowe",
    postal: "kod pocztowy",
    city: "miasto",
    client: "klient",
    object: "obiekt",
    nip_client: "NIP klienta",
    manual: "ręcznie",
  };
  return labels[reason] || null;
}

export function getProjectDisplayName(project) {
  if (!project) return "—";
  return project.object_name || project.city || project.id;
}

/**
 * Uzupełnia fakturę o project_id i metadane dopasowania (nie nadpisuje ręcznego wyboru).
 */
export function attachProjectMatch(invoice, projects, options = {}) {
  if (invoice._projectMatchManual) {
    return invoice;
  }
  const result = matchProject(projects, invoice, options);
  if (result.project_id) {
    return {
      ...invoice,
      project_id: result.project_id,
      _projectMatchReason: result.reason,
      _projectMatchConfidence: result.confidence,
      _projectMatchManual: false,
    };
  }
  return {
    ...invoice,
    project_id: invoice.project_id || null,
    _projectMatchReason: null,
    _projectMatchConfidence: null,
    _projectMatchManual: false,
  };
}
