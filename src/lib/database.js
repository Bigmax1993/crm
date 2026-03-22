import initSqlJs from "sql.js";
import mizarData from "@/fixtures/mizar_data.json";

/** URL WASM z katalogu public (Vite serwuje /sql-wasm.wasm lokalnie). */
const SQL_WASM_URL = "/sql-wasm.wasm";

let db = null;
let initPromise = null;

export const initDB = async () => {
  if (db) return db;
  if (!initPromise) {
    initPromise = (async () => {
      const SQL = await initSqlJs({
        locateFile: (file) => (file.endsWith(".wasm") ? SQL_WASM_URL : file),
      });

      const saved = localStorage.getItem("mizar_db");

      if (saved) {
        try {
          const buffer = Uint8Array.from(JSON.parse(saved));
          db = new SQL.Database(buffer);
          db.run("PRAGMA foreign_keys = ON;");
           
          console.log("✅ Baza wczytana z localStorage");
        } catch (e) {
           
          console.warn("Błąd wczytywania mizar_db — tworzę od nowa:", e);
          localStorage.removeItem("mizar_db");
          db = new SQL.Database();
          db.run("PRAGMA foreign_keys = ON;");
          applySchema(db);
          applySeed(db, mizarData);
          saveDB();
           
          console.log("✅ Nowa baza utworzona z mizar_data.json");
        }
      } else {
        db = new SQL.Database();
        db.run("PRAGMA foreign_keys = ON;");
        applySchema(db);
        applySeed(db, mizarData);
        saveDB();
         
        console.log("✅ Nowa baza utworzona z mizar_data.json");
      }
    })();
  }
  await initPromise;
  return db;
};

export const saveDB = () => {
  if (!db) return;
  try {
    const data = db.export();
    localStorage.setItem("mizar_db", JSON.stringify(Array.from(data)));
  } catch (e) {
     
    console.error("saveDB / localStorage:", e);
    throw e;
  }
};

export const resetDB = () => {
  localStorage.removeItem("mizar_db");
  db = null;
  initPromise = null;
   
  console.log("🔄 Baza zresetowana");
};

/**
 * Nowa baza w pamięci (Node / Vitest) — WASM z node_modules, ten sam schemat i seed co w przeglądarce.
 * Nie używa localStorage ani singletonu aplikacji.
 */
export async function createSeededMemoryDatabase(data = mizarData) {
  const { default: initSqlJsMod } = await import("sql.js");
  const { join } = await import("node:path");
  const dist = join(process.cwd(), "node_modules", "sql.js", "dist");
  const SQL = await initSqlJsMod({
    locateFile: (file) => join(dist, file),
  });
  const database = new SQL.Database();
  database.run("PRAGMA foreign_keys = ON;");
  applySchema(database);
  applySeed(database, data);
  return database;
}

function applySchema(database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS projekty (
      id TEXT PRIMARY KEY,
      nazwa TEXT NOT NULL,
      klient TEXT,
      nip_klienta TEXT,
      budzet REAL,
      waluta TEXT DEFAULT 'PLN',
      data_rozpoczecia TEXT,
      data_zakonczenia TEXT,
      status TEXT,
      typ_obiektu TEXT,
      powierzchnia_m2 INTEGER,
      miasto TEXT,
      lat REAL,
      lng REAL,
      marza_planowana_procent REAL,
      marza_rzeczywista_procent REAL
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS kontrahenci (
      id TEXT PRIMARY KEY,
      nazwa TEXT NOT NULL,
      nip TEXT,
      typ TEXT,
      specjalizacja TEXT,
      adres TEXT,
      email TEXT,
      telefon TEXT,
      waluta_rozliczen TEXT DEFAULT 'PLN',
      termin_platnosci_dni INTEGER DEFAULT 30
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS faktury (
      id TEXT PRIMARY KEY,
      numer TEXT NOT NULL,
      typ TEXT NOT NULL,
      projekt_id TEXT,
      kontrahent_id TEXT,
      data_wystawienia TEXT,
      termin_platnosci TEXT,
      data_zaplaty TEXT,
      kwota_netto REAL,
      vat_procent REAL,
      kwota_vat REAL,
      kwota_brutto REAL,
      waluta TEXT DEFAULT 'PLN',
      kurs_nbp REAL DEFAULT 1,
      kwota_pln REAL,
      status TEXT,
      opis TEXT,
      FOREIGN KEY (projekt_id) REFERENCES projekty(id),
      FOREIGN KEY (kontrahent_id) REFERENCES kontrahenci(id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS etapy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projekt_id TEXT,
      nazwa TEXT,
      wartosc REAL,
      status TEXT,
      termin TEXT,
      FOREIGN KEY (projekt_id) REFERENCES projekty(id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS majatek (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nazwa TEXT,
      wartosc REAL
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS kapital (
      id INTEGER PRIMARY KEY,
      kapital_zakladowy REAL,
      zyski_poprzednich_lat REAL,
      zysk_biezacego_roku REAL
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS kursy_walut (
      waluta TEXT PRIMARY KEY,
      kurs REAL,
      data_aktualizacji TEXT
    )
  `);
};

function applySeed(database, data) {
  const projekty = data.projekty || [];
  for (const p of projekty) {
    const loc = p.lokalizacja || {};
    database.run(
      `INSERT OR IGNORE INTO projekty VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        p.id,
        p.nazwa ?? "",
        p.klient ?? null,
        p.nip_klienta ?? null,
        p.budzet ?? null,
        p.waluta ?? "PLN",
        p.data_rozpoczecia ?? null,
        p.data_zakonczenia ?? null,
        p.status ?? null,
        p.typ_obiektu ?? null,
        p.powierzchnia_m2 ?? null,
        loc.miasto ?? null,
        loc.lat ?? null,
        loc.lng ?? null,
        p.marza_planowana_procent ?? null,
        p.marza_rzeczywista_procent ?? null,
      ]
    );

    for (const e of p.etapy || []) {
      database.run(
        `INSERT INTO etapy (projekt_id, nazwa, wartosc, status, termin) VALUES (?,?,?,?,?)`,
        [p.id, e.nazwa ?? "", e.wartosc ?? 0, e.status ?? null, e.termin ?? null]
      );
    }
  }

  for (const k of data.kontrahenci || []) {
    database.run(
      `INSERT OR IGNORE INTO kontrahenci VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        k.id,
        k.nazwa ?? "",
        k.nip ?? null,
        k.typ ?? null,
        k.specjalizacja ?? null,
        k.adres ?? null,
        k.email ?? null,
        k.telefon ?? null,
        k.waluta_rozliczen ?? "PLN",
        k.termin_platnosci_dni ?? 30,
      ]
    );
  }

  for (const f of data.faktury || []) {
    database.run(
      `INSERT OR IGNORE INTO faktury VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        f.id,
        f.numer ?? "",
        f.typ ?? "",
        f.projekt_id ?? null,
        f.kontrahent_id ?? null,
        f.data_wystawienia ?? null,
        f.termin_platnosci ?? null,
        f.data_zaplaty ?? null,
        f.kwota_netto ?? 0,
        f.vat_procent ?? 0,
        f.kwota_vat ?? 0,
        f.kwota_brutto ?? 0,
        f.waluta ?? "PLN",
        f.kurs_nbp ?? 1,
        f.kwota_pln ?? null,
        f.status ?? null,
        f.opis ?? null,
      ]
    );
  }

  for (const m of data.majatek_trwaly || []) {
    database.run(`INSERT INTO majatek (nazwa, wartosc) VALUES (?,?)`, [m.nazwa ?? "", m.wartosc ?? 0]);
  }

  const k = data.kapital;
  if (k) {
    database.run(`INSERT OR IGNORE INTO kapital VALUES (1,?,?,?)`, [
      k.kapital_zakladowy ?? 0,
      k.zyski_poprzednich_lat ?? 0,
      k.zysk_biezacego_roku ?? 0,
    ]);
  }
};

/** Wynik db.exec → tablica obiektów { kolumna: wartość } */
export const toObjects = (result) => {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  if (!values || values.length === 0) return [];
  return values.map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
};
