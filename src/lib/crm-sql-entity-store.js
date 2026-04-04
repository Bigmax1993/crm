import { initDB, saveDB } from "./database.js";

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * @param {import("sql.js").Database} db
 * @param {string} kind
 */
function selectAllByKind(db, kind) {
  const stmt = db.prepare(
    "SELECT id, payload, created_at, updated_at FROM crm_sql_entity WHERE kind = ? ORDER BY created_at DESC"
  );
  stmt.bind([kind]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function parsePayloadRow(row) {
  let data;
  try {
    data = JSON.parse(row.payload);
  } catch {
    data = {};
  }
  return {
    ...data,
    id: row.id,
    created_date: data.created_date || row.created_at,
    updated_at: row.updated_at,
  };
}

function sortRecords(records, sortSpec) {
  if (!sortSpec || typeof sortSpec !== "string") return records;
  const desc = sortSpec.startsWith("-");
  const field = desc ? sortSpec.slice(1) : sortSpec;
  const pick = (r) => {
    if (field === "created_date") return r.created_date || r.created_at || "";
    return r[field] ?? "";
  };
  return [...records].sort((a, b) => {
    const va = pick(a);
    const vb = pick(b);
    const na = typeof va === "number" ? va : String(va);
    const nb = typeof vb === "number" ? vb : String(vb);
    let c = 0;
    if (typeof na === "number" && typeof nb === "number") c = na - nb;
    else c = String(na).localeCompare(String(nb), undefined, { numeric: true });
    return desc ? -c : c;
  });
}

function matchesFilter(record, query) {
  if (!query || typeof query !== "object") return true;
  return Object.entries(query).every(([k, v]) => record[k] === v);
}

/**
 * @param {string} kind
 */
export async function crmSqlList(kind, sortSpec) {
  const db = await initDB();
  const raw = selectAllByKind(db, kind);
  const records = raw.map(parsePayloadRow);
  return sortRecords(records, sortSpec);
}

/**
 * @param {string} kind
 * @param {Record<string, unknown>} query
 * @param {string} [sortSpec]
 */
export async function crmSqlFilter(kind, query, sortSpec) {
  const all = await crmSqlList(kind, null);
  const filtered = all.filter((r) => matchesFilter(r, query));
  return sortRecords(filtered, sortSpec);
}

/**
 * @param {string} kind
 * @param {string} id
 */
export async function crmSqlGet(kind, id) {
  const db = await initDB();
  const stmt = db.prepare("SELECT id, payload, created_at, updated_at FROM crm_sql_entity WHERE kind = ? AND id = ?");
  stmt.bind([kind, id]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  return parsePayloadRow(row);
}

/**
 * @param {string} kind
 * @param {object} data
 */
export async function crmSqlCreate(kind, data) {
  const db = await initDB();
  const id = data.id && String(data.id).trim() ? String(data.id) : newId();
  const t = nowIso();
  const row = {
    ...data,
    id,
    created_date: data.created_date || t,
    updated_at: t,
  };
  const { id: _i, updated_at: _u, ...rest } = row;
  const payload = JSON.stringify(rest);
  db.run("INSERT INTO crm_sql_entity (kind, id, payload, created_at, updated_at) VALUES (?,?,?,?,?)", [
    kind,
    id,
    payload,
    row.created_date,
    t,
  ]);
  saveDB();
  return row;
}

/**
 * @param {string} kind
 * @param {string} id
 * @param {object} patch
 */
export async function crmSqlUpdate(kind, id, patch) {
  const db = await initDB();
  const prev = await crmSqlGet(kind, id);
  if (!prev) throw new Error(`Rekord ${kind}/${id} nie istnieje`);
  const t = nowIso();
  const next = { ...prev, ...patch, id, updated_at: t };
  const { id: rid, updated_at: _u, ...rest } = next;
  const payload = JSON.stringify(rest);
  db.run("UPDATE crm_sql_entity SET payload = ?, updated_at = ? WHERE kind = ? AND id = ?", [payload, t, kind, id]);
  saveDB();
  return next;
}

/**
 * @param {string} kind
 * @param {string} id
 */
export async function crmSqlDelete(kind, id) {
  const db = await initDB();
  db.run("DELETE FROM crm_sql_entity WHERE kind = ? AND id = ?", [kind, id]);
  saveDB();
}

/**
 * @param {string} kind
 * @param {object[]} rows
 */
export async function crmSqlBulkCreate(kind, rows) {
  for (const r of rows) {
    await crmSqlCreate(kind, r);
  }
}
