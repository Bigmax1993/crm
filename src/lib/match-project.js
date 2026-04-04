/** NIP do porównań: tylko cyfry. */
export function invoiceNipDigits(nip) {
  return String(nip ?? "").replace(/\D/g, "");
}

/**
 * Dobór project_id dla faktury: NIP kontrahenta → domyślny projekt; słowa kluczowe na obiekcie;
 * potem heurystyka nazw / numery (jak wcześniej w imporcie).
 *
 * @param {Array<{ id: string, client_name?: string, object_name?: string, invoice_numbers?: string, project_match_keywords?: string }>} projects
 * @param {object} invoice
 * @param {{ contractors?: Array<{ nip?: string, default_project_id?: string }> }} [options]
 * @returns {string|null}
 */
export function matchProjectId(projects, invoice, options = {}) {
  const contractors = options.contractors || [];
  const sellerN = invoiceNipDigits(invoice.seller_nip);
  const buyerN = invoiceNipDigits(invoice.contractor_nip);

  for (const c of contractors) {
    const cn = invoiceNipDigits(c.nip);
    const pid = c.default_project_id;
    if (!cn || !pid) continue;
    if (cn === sellerN || cn === buyerN) return pid;
  }

  const haystack = `${invoice.position || ""} ${invoice.invoice_lines || ""} ${invoice.order_number || ""}`.toLowerCase();
  for (const p of projects) {
    const raw = p.project_match_keywords;
    if (!raw || typeof raw !== "string") continue;
    const parts = raw
      .split(/[,;\n]/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    for (const k of parts) {
      if (haystack.includes(k)) return p.id;
    }
  }

  const cn = (invoice.contractor_name || "").toLowerCase().trim();
  const sn = (invoice.seller_name || "").toLowerCase().trim();
  const order = (invoice.order_number || "").toLowerCase().trim();
  for (const p of projects) {
    const client = (p.client_name || "").toLowerCase().trim();
    if (
      client &&
      (cn.includes(client) || client.includes(cn) || sn.includes(client) || client.includes(sn))
    )
      return p.id;
    const oname = (p.object_name || "").toLowerCase().trim();
    if (oname && (cn.includes(oname) || oname.includes(cn) || sn.includes(oname) || oname.includes(sn)))
      return p.id;
    const nums = (p.invoice_numbers || "").toLowerCase();
    if (order && nums.includes(order)) return p.id;
    if (invoice.invoice_number && nums.includes(String(invoice.invoice_number).toLowerCase())) return p.id;
  }
  return null;
}
