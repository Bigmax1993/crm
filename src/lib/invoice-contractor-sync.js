import { invoiceNipDigits } from "@/lib/match-project";
import { DEFAULT_INVOICE_PAYER, replaceLegacyDefaultPayer } from "@/lib/invoice-schema";

function isPlaceholderContractorName(name) {
  const t = String(name ?? "").trim();
  if (!t) return true;
  const normalized = replaceLegacyDefaultPayer(t);
  return normalized === DEFAULT_INVOICE_PAYER;
}

function findContractor(existing, name, nip) {
  const nl = String(name || "").toLowerCase().trim();
  const nd = invoiceNipDigits(nip);
  if (nd.length === 10) {
    const hit = existing.find((c) => invoiceNipDigits(c.nip) === nd);
    if (hit) return hit;
  }
  if (!nl) return null;
  return existing.find((c) => String(c.name || "").toLowerCase().trim() === nl) ?? null;
}

/**
 * Po zapisie faktury ręcznej (lub edycji): dopisuje brakujących kontrahentów do encji Contractor,
 * żeby pojawiali się w zakładce Kontrahenci (jak po imporcie z Upload).
 *
 * - FV sprzedaży: nabywca → typ client
 * - FV zakupu: sprzedawca → supplier; nabywca (jeśli nie placeholder) → client
 *
 * @param {{ entities: { Contractor: { list: Function, create: Function } } }} base44
 * @param {object} invoice — pola m.in. invoice_type, seller_*, contractor_*
 */
export async function ensureContractorsForInvoice(base44, invoice) {
  if (!invoice || !base44?.entities?.Contractor) return;

  const isSales = invoice.invoice_type === "sales";
  /** @type {{ name: string, nip: string, type: string }[]} */
  const candidates = [];

  if (isSales) {
    const name = String(invoice.contractor_name || "").trim();
    const nip = String(invoice.contractor_nip || "").trim();
    if (!isPlaceholderContractorName(name)) {
      candidates.push({ name, nip, type: "client" });
    }
  } else {
    const seller = String(invoice.seller_name || "").trim();
    const sellerNip = String(invoice.seller_nip || "").trim();
    if (seller) {
      candidates.push({ name: seller, nip: sellerNip, type: "supplier" });
    }
    const buyer = String(invoice.contractor_name || "").trim();
    const buyerNip = String(invoice.contractor_nip || "").trim();
    if (!isPlaceholderContractorName(buyer)) {
      candidates.push({ name: buyer, nip: buyerNip, type: "client" });
    }
  }

  if (candidates.length === 0) return;

  const existing = await base44.entities.Contractor.list();
  const seen = new Set();

  for (const { name, nip, type } of candidates) {
    if (!String(name).trim()) continue;
    const key = `${type}:${name.toLowerCase().trim()}:${invoiceNipDigits(nip)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (findContractor(existing, name, nip)) continue;

    const created = await base44.entities.Contractor.create({
      name,
      nip: nip || "",
      type,
      status: "active",
      category: "other",
    });
    if (created && created.id) {
      existing.push(created);
    }
  }
}
