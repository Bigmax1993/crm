import mizarData from "@/fixtures/mizar_data.json";
import { computeMizarDashboardStats } from "@/lib/mizar-dashboard-stats";
import { buildEurExposure } from "@/lib/prognozy";
import { getMizarBrandBriefForPrompt } from "@/lib/mizar-brand-brief";
import {
  loadCrmLocalState,
  getSiteExtension,
  getExpiringCertifications,
} from "@/lib/mizar-crm-local-store";
import { offerSegmentLabel } from "@/lib/mizar-offer-segments";

/**
 * Zbiera snapshot CRM (fixture + live Base44) pod prompty AI.
 */
export async function buildCrmContextForAi(base44) {
  const dash = computeMizarDashboardStats(mizarData);
  const eur = buildEurExposure(mizarData);
  const local = loadCrmLocalState();

  let invoices = [];
  let sites = [];
  try {
    invoices = await base44.entities.Invoice.list();
  } catch {
    /* offline */
  }
  try {
    sites = await base44.entities.ConstructionSite.list();
  } catch {
    /* offline */
  }

  const sitesWithExtensions = sites.map((s) => {
    const ext = getSiteExtension(s.id);
    return {
      id: s.id,
      obiekt: s.object_name,
      miasto: s.city,
      budzet: s.budget_planned,
      workflow: s.workflow_status,
      status: s.status,
      segment_oferty: offerSegmentLabel(ext.offer_segment),
      normy_notatka: ext.norms_note || null,
      certyfikaty: (ext.certifications || []).slice(0, 12),
      dofinansowanie: ext.subsidy || null,
    };
  });

  return {
    generated_at: new Date().toISOString(),
    marka_mizar_sport: getMizarBrandBriefForPrompt(),
    leady_lokalne: {
      liczba: (local.leads || []).length,
      probka: (local.leads || []).slice(0, 25).map((l) => ({
        firma: l.company,
        kontakt: l.contact_name,
        status: l.status,
        zrodlo: l.source,
        przypisany: l.assigned_to,
      })),
    },
    dostawcy_lokalni: {
      liczba: (local.suppliers || []).length,
      probka: (local.suppliers || []).slice(0, 20).map((x) => ({
        nazwa: x.name,
        kategorie: x.categories,
      })),
    },
    portfolio_realizacji: {
      liczba: (local.portfolio || []).length,
      probka: (local.portfolio || []).slice(0, 15).map((p) => ({
        tytul: p.title,
        miasto: p.city,
        segment: offerSegmentLabel(p.offer_segment),
        wartosc_pln: p.contract_value_pln,
        rok: p.completed_year,
      })),
    },
    certyfikaty_wygasajace_90d: getExpiringCertifications(90).slice(0, 20),
    mizar_fixture: {
      projekty: (mizarData.projekty || []).length,
      faktury: (mizarData.faktury || []).length,
      saldo_konto_pln: mizarData.konto_bankowe?.saldo_pln,
    },
    kpi_z_mizar_data_json: dash,
    ekspozycja_eur_niezapłacone: eur.exposureEur,
    faktury_live: {
      liczba: invoices.length,
      probka: invoices.slice(0, 45).map((i) => ({
        numer: i.invoice_number,
        kontrahent: i.contractor_name,
        kwota: i.amount,
        waluta: i.currency,
        status: i.status,
        typ: i.invoice_type,
        data_wystawienia: i.issue_date,
        project_id: i.project_id,
      })),
    },
    obiekty_budowy_live: sitesWithExtensions.slice(0, 40),
  };
}

export function stringifyCrmContext(ctx) {
  try {
    return JSON.stringify(ctx).slice(0, 48000);
  } catch {
    return "{}";
  }
}
