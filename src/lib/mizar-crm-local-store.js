/**
 * Dane CRM rozszerzające Base44 bez zmiany schematu API: segment oferty, certyfikaty,
 * dofinansowania, leady, dostawcy, portfolio — localStorage.
 */

const STORAGE_KEY = "mizar_crm_local_v1";

function defaultState() {
  return {
    version: 1,
    siteExtensions: {},
    leads: [],
    suppliers: [],
    portfolio: [],
  };
}

export function loadCrmLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw);
    return { ...defaultState(), ...p, siteExtensions: p.siteExtensions || {} };
  } catch {
    return defaultState();
  }
}

export function saveCrmLocalState(next) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultState(), ...next, version: 1 }));
  window.dispatchEvent(new Event("mizar-crm-local"));
}

export function newLocalId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** @param {string} siteId */
export function getSiteExtension(siteId) {
  if (!siteId) return emptySiteExtension();
  const st = loadCrmLocalState();
  return { ...emptySiteExtension(), ...(st.siteExtensions[siteId] || {}) };
}

function emptySiteExtension() {
  return {
    offer_segment: "",
    norms_note: "",
    certifications: [],
    subsidy: {
      program: "",
      stage: "",
      deadline: "",
      amount_pln: "",
      notes: "",
    },
    updatedAt: null,
  };
}

/** @param {string} siteId @param {object} partial */
export function removeSiteExtension(siteId) {
  if (!siteId) return;
  const st = loadCrmLocalState();
  delete st.siteExtensions[siteId];
  saveCrmLocalState(st);
}

export function patchSiteExtension(siteId, partial) {
  if (!siteId) return;
  const st = loadCrmLocalState();
  const prev = st.siteExtensions[siteId] || emptySiteExtension();
  const nextCert = partial.certifications != null ? partial.certifications : prev.certifications;
  const nextSub = { ...prev.subsidy, ...(partial.subsidy || {}) };
  st.siteExtensions[siteId] = {
    ...prev,
    ...partial,
    certifications: Array.isArray(nextCert) ? nextCert : [],
    subsidy: nextSub,
    updatedAt: new Date().toISOString(),
  };
  saveCrmLocalState(st);
}

export function getLeads() {
  return loadCrmLocalState().leads || [];
}

export function setLeads(leads) {
  const st = loadCrmLocalState();
  st.leads = leads;
  saveCrmLocalState(st);
}

export function getSuppliers() {
  return loadCrmLocalState().suppliers || [];
}

export function setSuppliers(suppliers) {
  const st = loadCrmLocalState();
  st.suppliers = suppliers;
  saveCrmLocalState(st);
}

export function getPortfolio() {
  return loadCrmLocalState().portfolio || [];
}

export function setPortfolio(portfolio) {
  const st = loadCrmLocalState();
  st.portfolio = portfolio;
  saveCrmLocalState(st);
}

/** Certyfikaty wygasające w ciągu `days` dni. */
export function getExpiringCertifications(days = 90) {
  const st = loadCrmLocalState();
  const cutoff = Date.now() + days * 86400000;
  const out = [];
  for (const [siteId, ext] of Object.entries(st.siteExtensions || {})) {
    for (const c of ext.certifications || []) {
      const d = c.expiry_date ? Date.parse(c.expiry_date) : NaN;
      if (Number.isFinite(d) && d <= cutoff && d >= Date.now()) {
        out.push({ siteId, ...c });
      }
    }
  }
  return out;
}
