/**
 * Trwałe encje CRM (SQLite / Base44) z migracją z localStorage i zapasem offline.
 */
import { base44 } from "@/api/base44Client";
import { loadCrmLocalState, saveCrmLocalState, newLocalId } from "@/lib/crm-local-store";

const MIGRATION_KEY = "fakturowo_crm_entities_migrated_v2";

const ENTITY_KINDS = ["RefundClaim", "Lead", "SiteExtension", "AuditLog"];

function entityStoreEnabled() {
  if (import.meta.env.MODE === "test") return false;
  return ENTITY_KINDS.every(hasEntity);
}

function hasEntity(kind) {
  return Boolean(base44?.entities?.[kind]);
}

async function entityList(kind, sort = "-updated_at") {
  if (!hasEntity(kind)) return null;
  try {
    return await base44.entities[kind].list(sort);
  } catch {
    return null;
  }
}

async function entityCreate(kind, data) {
  if (!hasEntity(kind)) return null;
  try {
    return await base44.entities[kind].create(data);
  } catch {
    return null;
  }
}

async function entityUpdate(kind, id, patch) {
  if (!hasEntity(kind)) return null;
  try {
    return await base44.entities[kind].update(id, patch);
  } catch {
    return null;
  }
}

async function entityDelete(kind, id) {
  if (!hasEntity(kind)) return false;
  try {
    await base44.entities[kind].delete(id);
    return true;
  } catch {
    return false;
  }
}

async function entityFilter(kind, query, sort = "-updated_at") {
  if (!hasEntity(kind)) return null;
  try {
    return await base44.entities[kind].filter(query, sort);
  } catch {
    return null;
  }
}

function emptySiteExtensionPayload() {
  return {
    offer_segment: "",
    norms_note: "",
    certifications: [],
    subsidy: { program: "", stage: "", deadline: "", amount_pln: "", notes: "" },
  };
}

/** Jednorazowa migracja zwrotów, leadów i rozszerzeń projektów do encji SQL. */
export async function migrateCrmLocalStorageToEntities() {
  try {
    if (!entityStoreEnabled()) return;

    const st = loadCrmLocalState();

    for (const claim of st.refundClaims || []) {
      if (!claim?.id) continue;
      const existing = await entityFilter("RefundClaim", { id: claim.id });
      if (!existing?.length) await entityCreate("RefundClaim", { ...claim });
    }

    for (const lead of st.leads || []) {
      if (!lead?.id) continue;
      const existing = await entityFilter("Lead", { id: lead.id });
      if (!existing?.length) await entityCreate("Lead", { ...lead });
    }

    for (const [siteId, ext] of Object.entries(st.siteExtensions || {})) {
      const existing = await entityFilter("SiteExtension", { site_id: siteId });
      if (!existing?.length) {
        await entityCreate("SiteExtension", {
          id: newLocalId("ext"),
          site_id: siteId,
          ...emptySiteExtensionPayload(),
          ...ext,
          updated_at: ext.updatedAt || new Date().toISOString(),
        });
      }
    }

    localStorage.setItem(MIGRATION_KEY, "1");
  } catch {
    /* SQLite niedostępne (testy / offline) — zostaw dane w localStorage */
  }
}

// —— Zwroty ——

export async function listRefundClaims() {
  if (entityStoreEnabled()) {
    try {
      await migrateCrmLocalStorageToEntities();
      const rows = await entityList("RefundClaim");
      if (rows) return rows;
    } catch {
      /* SQLite niedostępne — zapas localStorage */
    }
  }
  return loadCrmLocalState().refundClaims || [];
}

export async function saveRefundClaimsAll(claims) {
  const list = claims || [];
  if (entityStoreEnabled()) {
    try {
      const fromEntity = await entityList("RefundClaim");
      if (fromEntity) {
        const ids = new Set(list.map((c) => c.id));
        for (const row of fromEntity) {
          if (!ids.has(row.id)) await entityDelete("RefundClaim", row.id);
        }
        for (const claim of list) {
          const found = fromEntity.find((r) => r.id === claim.id);
          if (found) await entityUpdate("RefundClaim", claim.id, claim);
          else await entityCreate("RefundClaim", claim);
        }
        return list;
      }
    } catch {
      /* zapas */
    }
  }
  const st = loadCrmLocalState();
  st.refundClaims = list;
  saveCrmLocalState(st);
  return list;
}

export async function upsertRefundClaimEntity(claim) {
  if (!claim?.id) return claim;
  if (entityStoreEnabled()) {
    try {
      await migrateCrmLocalStorageToEntities();
      const rows = await entityList("RefundClaim");
      if (rows) {
        const found = rows.find((r) => r.id === claim.id);
        if (found) await entityUpdate("RefundClaim", claim.id, claim);
        else await entityCreate("RefundClaim", claim);
        return claim;
      }
    } catch {
      /* zapas */
    }
  }
  const st = loadCrmLocalState();
  const list = st.refundClaims || [];
  const idx = list.findIndex((c) => c.id === claim.id);
  if (idx >= 0) list[idx] = claim;
  else list.unshift(claim);
  st.refundClaims = list;
  saveCrmLocalState(st);
  return claim;
}

// —— Leady ——

export async function listLeads() {
  if (entityStoreEnabled()) {
    try {
      await migrateCrmLocalStorageToEntities();
      const rows = await entityList("Lead");
      if (rows) return rows;
    } catch {
      /* zapas */
    }
  }
  return loadCrmLocalState().leads || [];
}

export async function saveLeadsAll(leads) {
  const list = leads || [];
  if (entityStoreEnabled()) {
    try {
      const fromEntity = await entityList("Lead");
      if (fromEntity) {
        const ids = new Set(list.map((l) => l.id));
        for (const row of fromEntity) {
          if (!ids.has(row.id)) await entityDelete("Lead", row.id);
        }
        for (const lead of list) {
          const found = fromEntity.find((r) => r.id === lead.id);
          if (found) await entityUpdate("Lead", lead.id, lead);
          else await entityCreate("Lead", lead);
        }
        return list;
      }
    } catch {
      /* zapas */
    }
  }
  const st = loadCrmLocalState();
  st.leads = list;
  saveCrmLocalState(st);
  return list;
}

// —— Rozszerzenia projektu ——

export async function listSiteExtensions() {
  if (entityStoreEnabled()) {
    try {
      await migrateCrmLocalStorageToEntities();
      const rows = await entityList("SiteExtension");
      if (rows) return rows;
    } catch {
      /* zapas */
    }
  }
  const st = loadCrmLocalState();
  return Object.entries(st.siteExtensions || {}).map(([site_id, ext]) => ({
    site_id,
    ...emptySiteExtensionPayload(),
    ...ext,
  }));
}

export async function fetchSiteExtension(siteId) {
  if (!siteId) return { ...emptySiteExtensionPayload(), updatedAt: null };
  if (entityStoreEnabled()) {
    try {
      await migrateCrmLocalStorageToEntities();
      const filtered = await entityFilter("SiteExtension", { site_id: siteId });
      if (filtered?.length) {
        const row = filtered[0];
        return {
          offer_segment: row.offer_segment || "",
          norms_note: row.norms_note || "",
          certifications: row.certifications || [],
          subsidy: { ...emptySiteExtensionPayload().subsidy, ...(row.subsidy || {}) },
          updatedAt: row.updated_at || row.updatedAt || null,
        };
      }
    } catch {
      /* zapas */
    }
  }
  const st = loadCrmLocalState();
  return { ...emptySiteExtensionPayload(), ...(st.siteExtensions?.[siteId] || {}), updatedAt: st.siteExtensions?.[siteId]?.updatedAt || null };
}

export async function patchSiteExtensionEntity(siteId, partial) {
  if (!siteId) return;
  const prev = await fetchSiteExtension(siteId);
  const nextCert = partial.certifications != null ? partial.certifications : prev.certifications;
  const nextSub = { ...prev.subsidy, ...(partial.subsidy || {}) };
  const payload = {
    site_id: siteId,
    offer_segment: partial.offer_segment ?? prev.offer_segment,
    norms_note: partial.norms_note ?? prev.norms_note,
    certifications: Array.isArray(nextCert) ? nextCert : [],
    subsidy: nextSub,
    updated_at: new Date().toISOString(),
  };

  if (entityStoreEnabled()) {
    try {
      const filtered = await entityFilter("SiteExtension", { site_id: siteId });
      if (filtered?.length) {
        await entityUpdate("SiteExtension", filtered[0].id, payload);
        return;
      }
      await entityCreate("SiteExtension", { id: newLocalId("ext"), ...payload });
      return;
    } catch {
      /* zapas */
    }
  }
  const st = loadCrmLocalState();
  st.siteExtensions = st.siteExtensions || {};
  st.siteExtensions[siteId] = { ...prev, ...partial, certifications: payload.certifications, subsidy: nextSub, updatedAt: payload.updated_at };
  saveCrmLocalState(st);
}

export async function removeSiteExtensionEntity(siteId) {
  if (!siteId) return;
  if (entityStoreEnabled()) {
    try {
      const filtered = await entityFilter("SiteExtension", { site_id: siteId });
      if (filtered?.length) {
        await entityDelete("SiteExtension", filtered[0].id);
      }
    } catch {
      /* zapas */
    }
  }
  const st = loadCrmLocalState();
  delete st.siteExtensions?.[siteId];
  saveCrmLocalState(st);
}

export async function getExpiringCertificationsFromEntities(days = 90) {
  const extensions = await listSiteExtensions();
  const cutoff = Date.now() + days * 86400000;
  const out = [];
  for (const ext of extensions) {
    for (const c of ext.certifications || []) {
      const d = c.expiry_date ? Date.parse(c.expiry_date) : NaN;
      if (Number.isFinite(d) && d <= cutoff && d >= Date.now()) {
        out.push({ siteId: ext.site_id, ...c });
      }
    }
  }
  return out;
}
