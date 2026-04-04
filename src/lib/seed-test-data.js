import crmFixture from "@/fixtures/crm_fixture_data.json";
import { pickInvoiceApiPayload } from "@/lib/invoice-fx";
import { DEFAULT_INVOICE_PAYER } from "@/lib/invoice-schema";

/** Eksport surowych danych (np. testy, podgląd). */
export function getCrmFixture() {
  return crmFixture;
}

function mapInvoiceStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("zapłac") || s.includes("zaplac")) return "paid";
  if (s.includes("przetermin")) return "overdue";
  return "unpaid";
}

function mapSiteOperationalStatus(projStatus) {
  const s = String(projStatus || "").toLowerCase();
  if (s.includes("zakończ") || s.includes("zakoncz")) return "zakończony";
  return "aktywny";
}

function mapWorkflowStatus(projStatus) {
  const s = String(projStatus || "").toLowerCase();
  if (s.includes("oferta")) return "oferta";
  if (s.includes("zakończ") || s.includes("zakoncz")) return "odbior";
  return "realizacja";
}

/**
 * Importuje dane z crm_fixture_data.json do encji CRM (Base44):
 * ConstructionSite ← projekty, Contractor ← kontrahenci, Invoice ← faktury.
 *
 * @param {import('@/api/base44Client').base44} base44
 * @param {{ skipExisting?: boolean }} [options]
 * @returns {Promise<{ createdSites: number; createdContractors: number; createdInvoices: number; skippedInvoices: number; errors: string[] }>}
 */
export async function seedCrmTestData(base44, { skipExisting = true } = {}) {
  const data = crmFixture;
  const errors = [];

  const contractorsByOldId = {};
  const projectsByOldId = {};

  let contractorRows = [...(await base44.entities.Contractor.list())];
  let siteRows = [...(await base44.entities.ConstructionSite.list())];
  const existingInvoices = await base44.entities.Invoice.list();
  const invNums = new Set(existingInvoices.map((i) => i.invoice_number).filter(Boolean));

  const findContractor = (name) =>
    contractorRows.find((c) => c.name?.toLowerCase().trim() === String(name || "").toLowerCase().trim());

  const findSite = (objectName, city) =>
    siteRows.find(
      (s) =>
        (s.object_name || "").toLowerCase().trim() === String(objectName || "").toLowerCase().trim() &&
        (s.city || "").toLowerCase().trim() === String(city || "").toLowerCase().trim()
    );

  let createdContractors = 0;
  for (const k of data.kontrahenci || []) {
    try {
      const found = findContractor(k.nazwa);
      if (skipExisting && found) {
        contractorsByOldId[k.id] = found.id;
        continue;
      }
      const payload = {
        name: k.nazwa,
        nip: k.nip || "",
        address: k.adres || "",
        email: k.email || "",
        phone: k.telefon || "",
        type: "supplier",
        category: "other",
        status: "active",
        country: "Polska",
        payment_terms: k.termin_platnosci_dni ?? 14,
        notes: `fixture ${k.id} | ${k.specjalizacja || ""} | waluta: ${k.waluta_rozliczen || "PLN"}`,
      };
      const created = await base44.entities.Contractor.create(payload);
      contractorRows.push(created);
      contractorsByOldId[k.id] = created.id;
      createdContractors += 1;
    } catch (e) {
      errors.push(`Kontrahent ${k.id}: ${e?.message || e}`);
    }
  }

  let createdSites = 0;
  for (const p of data.projekty || []) {
    try {
      const city = p.lokalizacja?.miasto || "";
      const found = findSite(p.nazwa, city);
      if (skipExisting && found) {
        projectsByOldId[p.id] = found.id;
        continue;
      }
      const payload = {
        city,
        object_name: p.nazwa,
        postal_code: "",
        client_name: p.klient || "",
        budget_planned: p.budzet ?? null,
        latitude: p.lokalizacja?.lat ?? null,
        longitude: p.lokalizacja?.lng ?? null,
        status: mapSiteOperationalStatus(p.status),
        workflow_status: mapWorkflowStatus(p.status),
        notes: `fixture ${p.id} | NIP klienta: ${p.nip_klienta || ""} | ${p.typ_obiektu || ""}`,
      };
      const created = await base44.entities.ConstructionSite.create(payload);
      siteRows.push(created);
      projectsByOldId[p.id] = created.id;
      createdSites += 1;
    } catch (e) {
      errors.push(`Projekt ${p.id}: ${e?.message || e}`);
    }
  }

  const contractorNameByOldId = Object.fromEntries((data.kontrahenci || []).map((k) => [k.id, k.nazwa]));

  const invoicePayloads = [];
  let skippedInvoices = 0;

  for (const f of data.faktury || []) {
    if (skipExisting && invNums.has(f.numer)) {
      skippedInvoices += 1;
      continue;
    }
    const contractorName = contractorNameByOldId[f.kontrahent_id] || "—";
    const projectId = projectsByOldId[f.projekt_id] || undefined;
    const status = mapInvoiceStatus(f.status);
    const isPaid = status === "paid";

    const isSales = f.typ === "wystawiona";
    const inv = {
      invoice_number: f.numer,
      seller_name: isSales ? DEFAULT_INVOICE_PAYER : contractorName,
      contractor_name: isSales ? contractorName : DEFAULT_INVOICE_PAYER,
      amount: f.kwota_brutto,
      currency: f.waluta || "PLN",
      issue_date: f.data_wystawienia,
      payment_deadline: f.termin_platnosci,
      status,
      invoice_type: f.typ === "wystawiona" ? "sales" : "purchase",
      position: f.opis || "",
      notes: `fixture ${f.id}`,
      project_id: projectId,
      net_amount: f.kwota_netto,
      vat_amount: f.kwota_vat,
    };

    if (isPaid && f.data_zaplaty) {
      inv.paid_at = f.data_zaplaty;
    }

    const cur = String(f.waluta || "PLN").toUpperCase();
    if (cur === "PLN") {
      inv.amount_pln = f.kwota_pln;
      inv.nbp_mid_issue = 1;
      inv.nbp_table_date_issue = f.data_wystawienia;
      if (isPaid) {
        inv.amount_pln_at_payment = f.kwota_pln;
        inv.nbp_mid_paid = 1;
        inv.nbp_table_date_paid = f.data_zaplaty || f.data_wystawienia;
        inv.fx_difference_pln = 0;
      }
    } else {
      inv.amount_pln = f.kwota_pln;
      inv.nbp_mid_issue = f.kurs_nbp;
      inv.nbp_table_date_issue = f.data_wystawienia;
      if (isPaid && f.data_zaplaty) {
        inv.amount_pln_at_payment = f.kwota_pln;
        inv.nbp_mid_paid = f.kurs_nbp;
        inv.nbp_table_date_paid = f.data_zaplaty;
        inv.fx_difference_pln = 0;
      }
    }

    invoicePayloads.push(pickInvoiceApiPayload(inv));
  }

  let createdInvoices = 0;
  if (invoicePayloads.length > 0) {
    try {
      await base44.entities.Invoice.bulkCreate(invoicePayloads);
      createdInvoices = invoicePayloads.length;
    } catch (e) {
      errors.push(`bulkCreate faktury: ${e?.message || e}`);
      for (const payload of invoicePayloads) {
        try {
          await base44.entities.Invoice.create(payload);
          createdInvoices += 1;
        } catch (e2) {
          errors.push(`FV ${payload.invoice_number}: ${e2?.message || e2}`);
        }
      }
    }
  }

  return {
    createdSites,
    createdContractors,
    createdInvoices,
    skippedInvoices,
    errors,
  };
}
