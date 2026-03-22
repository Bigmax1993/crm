/**
 * Zapytania z lib/queries.js względem tej samej bazy co produkcja (initDB → mock na pamięć + seed).
 */
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";

vi.mock("@/lib/database", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    initDB: vi.fn(),
    saveDB: vi.fn(),
  };
});

import * as database from "@/lib/database";
import {
  getKPI,
  getBilans,
  getCashFlow,
  getFaktury,
  addFaktura,
  updateStatusFaktury,
  getRentownosc,
  getKosztyProjektow,
  getRyzykoWalutowe,
} from "@/lib/queries";

describe("sql-queries (integracja sql.js)", { timeout: 30000 }, () => {
  let sharedMem;

  beforeAll(async () => {
    sharedMem = await database.createSeededMemoryDatabase();
    vi.mocked(database.initDB).mockResolvedValue(sharedMem);
  });

  afterAll(() => {
    try {
      sharedMem?.close?.();
    } catch {
      /* ignore */
    }
  });

  it("getKPI zwraca liczniki i sumy", async () => {
    const kpi = await getKPI();
    expect(kpi).toHaveProperty("aktywne_projekty");
    expect(kpi).toHaveProperty("naleznosci");
    expect(kpi).toHaveProperty("zobowiazania");
    expect(Number(kpi.aktywne_projekty)).toBeGreaterThanOrEqual(0);
  });

  it("getBilans zwraca strukturę aktywa/pasywa", async () => {
    const b = await getBilans();
    expect(b.aktywa).toHaveProperty("suma");
    expect(b.pasywa).toHaveProperty("suma");
    expect(typeof b.zbilansowany).toBe("boolean");
  });

  it("getCashFlow zwraca wiersze z narastającym saldem", async () => {
    const rows = await getCashFlow();
    expect(Array.isArray(rows)).toBe(true);
    if (rows.length > 0) {
      expect(rows[0]).toHaveProperty("miesiac");
      expect(rows[0]).toHaveProperty("narastajace");
    }
  });

  it("getFaktury filtruje po statusie (prepare + bind)", async () => {
    const przeterm = await getFaktury({ status: "przeterminowana" });
    expect(Array.isArray(przeterm)).toBe(true);
    for (const f of przeterm) {
      expect(f.status).toBe("przeterminowana");
    }
  });

  it("getRentownosc zwraca projekty z marżą", async () => {
    const rows = await getRentownosc();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("id");
    expect(rows[0]).toHaveProperty("marza_procent");
  });

  it("getKosztyProjektow zwraca alert i procent budżetu", async () => {
    const rows = await getKosztyProjektow();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("alert");
    expect(["ok", "ostrzezenie", "przekroczony"]).toContain(rows[0].alert);
  });

  it("getRyzykoWalutowe zwraca tablicę (może być pusta)", async () => {
    const rows = await getRyzykoWalutowe();
    expect(Array.isArray(rows)).toBe(true);
  });

  it("addFaktura i updateStatusFaktury (saveDB zmockowane)", async () => {
    const mem = await database.createSeededMemoryDatabase();
    vi.mocked(database.initDB).mockResolvedValue(mem);

    await addFaktura({
      id: "TEST-FV-001",
      numer: "FV/TEST/1",
      typ: "otrzymana",
      projekt_id: "PRJ-001",
      kontrahent_id: "KON-001",
      data_wystawienia: "2025-01-01",
      termin_platnosci: "2025-02-01",
      data_zaplaty: null,
      kwota_netto: 100,
      vat_procent: 23,
      kwota_vat: 23,
      kwota_brutto: 123,
      waluta: "PLN",
      kurs_nbp: 1,
      kwota_pln: 123,
      status: "niezapłacona",
      opis: "test",
    });

    const found = await getFaktury({ typ: "otrzymana" });
    const mine = found.find((f) => f.id === "TEST-FV-001");
    expect(mine).toBeDefined();
    expect(mine.numer).toBe("FV/TEST/1");

    await updateStatusFaktury("TEST-FV-001", "zapłacona");
    const after = (await getFaktury({})).find((f) => f.id === "TEST-FV-001");
    expect(after.status).toBe("zapłacona");
    mem.close();
  });
});
