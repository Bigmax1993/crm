import { initDB, toObjects, saveDB } from "./database.js";

// —— DASHBOARD KPI ——
export const getKPI = async () => {
  const db = await initDB();
  const result = db.exec(`
    SELECT
      (SELECT COUNT(*) FROM projekty
       WHERE status = 'w trakcie')
       AS aktywne_projekty,

      (SELECT COALESCE(SUM(kwota_pln), 0)
       FROM faktury
       WHERE typ = 'wystawiona'
       AND status = 'niezapłacona')
       AS naleznosci,

      (SELECT COALESCE(SUM(kwota_pln), 0)
       FROM faktury
       WHERE typ = 'otrzymana'
       AND status = 'niezapłacona')
       AS zobowiazania,

      (SELECT COUNT(*) FROM faktury
       WHERE status = 'przeterminowana')
       AS faktury_przeterminowane,

      (SELECT COALESCE(SUM(kwota_pln), 0)
       FROM faktury
       WHERE status = 'przeterminowana')
       AS kwota_przeterminowana,

      (SELECT COALESCE(SUM(budzet), 0)
       FROM projekty
       WHERE status = 'oferta')
       AS wartosc_pipeline
  `);
  const rows = toObjects(result);
  return rows[0] || {};
};

// —— BILANS ——
export const getBilans = async () => {
  const db = await initDB();

  const faktury = db.exec(`
    SELECT
      COALESCE(SUM(CASE
        WHEN typ='wystawiona'
        AND status='niezapłacona'
        THEN kwota_pln ELSE 0 END), 0)
        AS naleznosci,
      COALESCE(SUM(CASE
        WHEN typ='otrzymana'
        AND status='niezapłacona'
        THEN kwota_pln ELSE 0 END), 0)
        AS zobowiazania
    FROM faktury
  `);

  const majatek = db.exec(`
    SELECT COALESCE(SUM(wartosc), 0) AS wartosc
    FROM majatek
  `);

  const kapital = db.exec(`
    SELECT
      kapital_zakladowy,
      zyski_poprzednich_lat,
      zysk_biezacego_roku,
      kapital_zakladowy +
      zyski_poprzednich_lat +
      zysk_biezacego_roku AS kapital_wlasny
    FROM kapital WHERE id = 1
  `);

  const f = toObjects(faktury)[0] || { naleznosci: 0, zobowiazania: 0 };
  const m = toObjects(majatek)[0] || { wartosc: 0 };
  const k = toObjects(kapital)[0] || {
    kapital_zakladowy: 0,
    zyski_poprzednich_lat: 0,
    zysk_biezacego_roku: 0,
    kapital_wlasny: 0,
  };

  const aktywaTrwale = Number(m.wartosc) || 0;
  const sumaAktywow = (Number(f.naleznosci) || 0) + aktywaTrwale;
  const sumaPassywow = (Number(f.zobowiazania) || 0) + (Number(k.kapital_wlasny) || 0);

  return {
    aktywa: {
      trwale: aktywaTrwale,
      naleznosci: Number(f.naleznosci) || 0,
      suma: sumaAktywow,
    },
    pasywa: {
      zobowiazania: Number(f.zobowiazania) || 0,
      kapital: Number(k.kapital_wlasny) || 0,
      suma: sumaPassywow,
    },
    zbilansowany: Math.abs(sumaAktywow - sumaPassywow) < 0.01,
  };
};

// —— CASH FLOW miesięczny ——
export const getCashFlow = async () => {
  const db = await initDB();
  const result = db.exec(`
    SELECT
      SUBSTR(data_wystawienia, 1, 7) AS miesiac,
      COALESCE(SUM(CASE
        WHEN typ='wystawiona' AND status='zapłacona'
        THEN kwota_pln ELSE 0 END), 0) AS wplywy,
      COALESCE(SUM(CASE
        WHEN typ='otrzymana' AND status='zapłacona'
        THEN kwota_pln ELSE 0 END), 0) AS wydatki,
      COALESCE(SUM(CASE
        WHEN typ='wystawiona' AND status='zapłacona'
        THEN kwota_pln ELSE 0 END), 0) -
      COALESCE(SUM(CASE
        WHEN typ='otrzymana' AND status='zapłacona'
        THEN kwota_pln ELSE 0 END), 0) AS saldo
    FROM faktury
    WHERE data_wystawienia IS NOT NULL
    GROUP BY miesiac
    ORDER BY miesiac ASC
  `);

  const rows = toObjects(result);
  let narastajace = 0;
  return rows.map((row) => {
    narastajace += Number(row.saldo) || 0;
    return { ...row, narastajace };
  });
};

// —— RENTOWNOŚĆ per projekt ——
export const getRentownosc = async () => {
  const db = await initDB();
  const result = db.exec(`
    SELECT
      p.id,
      p.nazwa,
      p.typ_obiektu,
      p.budzet,
      p.status,
      p.marza_planowana_procent,
      p.marza_rzeczywista_procent,
      COALESCE(SUM(CASE
        WHEN f.typ='otrzymana'
        THEN f.kwota_netto ELSE 0 END), 0)
        AS koszty_rzeczywiste,
      COALESCE(SUM(CASE
        WHEN f.typ='wystawiona'
        THEN f.kwota_netto ELSE 0 END), 0)
        AS przychody,
      p.budzet - COALESCE(SUM(CASE
        WHEN f.typ='otrzymana'
        THEN f.kwota_netto ELSE 0 END), 0)
        AS zysk,
      CASE WHEN p.budzet > 0 THEN
        ROUND((p.budzet - COALESCE(SUM(CASE
          WHEN f.typ='otrzymana'
          THEN f.kwota_netto ELSE 0 END), 0))
          / p.budzet * 100, 2)
      ELSE 0 END AS marza_procent
    FROM projekty p
    LEFT JOIN faktury f ON f.projekt_id = p.id
    GROUP BY p.id
    ORDER BY marza_procent DESC
  `);
  return toObjects(result);
};

// —— KOSZTY per projekt z alertami ——
export const getKosztyProjektow = async () => {
  const db = await initDB();
  const result = db.exec(`
    SELECT
      p.id,
      p.nazwa,
      p.budzet,
      p.status,
      p.typ_obiektu,
      COALESCE(SUM(f.kwota_pln), 0)
        AS koszty_rzeczywiste,
      CASE
        WHEN p.budzet IS NULL OR p.budzet <= 0 THEN NULL
        ELSE ROUND(COALESCE(SUM(f.kwota_pln), 0) * 100.0 / p.budzet, 2)
      END AS procent_budzetu,
      p.budzet - COALESCE(SUM(f.kwota_pln), 0)
        AS pozostalo,
      CASE
        WHEN p.budzet IS NULL OR p.budzet <= 0 THEN 'ok'
        WHEN COALESCE(SUM(f.kwota_pln), 0) / p.budzet > 1
          THEN 'przekroczony'
        WHEN COALESCE(SUM(f.kwota_pln), 0) / p.budzet > 0.8
          THEN 'ostrzezenie'
        ELSE 'ok'
      END AS alert
    FROM projekty p
    LEFT JOIN faktury f
      ON f.projekt_id = p.id
      AND f.typ = 'otrzymana'
    GROUP BY p.id
    ORDER BY procent_budzetu DESC
  `);
  return toObjects(result);
};

// —— FAKTURY z filtrowaniem (prepare — sql.js nie obsługuje parametrów w exec) ——
export const getFaktury = async (filtry = {}) => {
  const db = await initDB();
  const conditions = [];
  const params = [];

  if (filtry.status) {
    conditions.push("f.status = ?");
    params.push(filtry.status);
  }
  if (filtry.typ) {
    conditions.push("f.typ = ?");
    params.push(filtry.typ);
  }
  if (filtry.projekt_id) {
    conditions.push("f.projekt_id = ?");
    params.push(filtry.projekt_id);
  }
  if (filtry.waluta) {
    conditions.push("f.waluta = ?");
    params.push(filtry.waluta);
  }

  const whereExtra = conditions.length ? `AND ${conditions.join(" AND ")}` : "";
  const sql = `
    SELECT
      f.*,
      p.nazwa AS nazwa_projektu,
      k.nazwa AS nazwa_kontrahenta,
      k.nip AS nip_kontrahenta
    FROM faktury f
    LEFT JOIN projekty p ON p.id = f.projekt_id
    LEFT JOIN kontrahenci k ON k.id = f.kontrahent_id
    WHERE 1=1
    ${whereExtra}
    ORDER BY f.data_wystawienia DESC
  `;

  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
};

// —— RYZYKO WALUTOWE ——
export const getRyzykoWalutowe = async () => {
  const db = await initDB();
  const result = db.exec(`
    SELECT
      f.waluta,
      COUNT(*) AS liczba_faktur,
      COALESCE(SUM(f.kwota_brutto), 0)
        AS suma_waluta,
      COALESCE(SUM(f.kwota_pln), 0)
        AS suma_pln,
      AVG(f.kurs_nbp) AS sredni_kurs,
      k.nazwa AS kontrahent
    FROM faktury f
    LEFT JOIN kontrahenci k
      ON k.id = f.kontrahent_id
    WHERE f.waluta != 'PLN'
    AND f.status = 'niezapłacona'
    GROUP BY f.waluta, f.kontrahent_id
    ORDER BY suma_pln DESC
  `);
  return toObjects(result);
};

// —— DODAJ FAKTURĘ ——
export const addFaktura = async (faktura) => {
  const db = await initDB();
  db.run(
    `INSERT INTO faktury (
      id, numer, typ, projekt_id, kontrahent_id,
      data_wystawienia, termin_platnosci, data_zaplaty,
      kwota_netto, vat_procent, kwota_vat, kwota_brutto,
      waluta, kurs_nbp, kwota_pln, status, opis
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      faktura.id,
      faktura.numer,
      faktura.typ,
      faktura.projekt_id ?? null,
      faktura.kontrahent_id ?? null,
      faktura.data_wystawienia ?? null,
      faktura.termin_platnosci ?? null,
      faktura.data_zaplaty ?? null,
      faktura.kwota_netto ?? 0,
      faktura.vat_procent ?? 0,
      faktura.kwota_vat ?? 0,
      faktura.kwota_brutto ?? 0,
      faktura.waluta ?? "PLN",
      faktura.kurs_nbp ?? 1,
      faktura.kwota_pln ?? null,
      faktura.status ?? null,
      faktura.opis ?? null,
    ]
  );
  saveDB();
};

// —— ZAKTUALIZUJ STATUS FAKTURY ——
export const updateStatusFaktury = async (id, status) => {
  const db = await initDB();
  db.run(`UPDATE faktury SET status = ? WHERE id = ?`, [status, id]);
  saveDB();
};
