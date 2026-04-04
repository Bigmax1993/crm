/**
 * Ekstrakcja faktury z XML (heurystyka JPK-FA / struktury FA z prefiksami namespace).
 * Zwraca tablicę rekordów zgodnych z polami CRM lub pustą tablicę.
 */

function text(el) {
  return el?.textContent?.trim() || "";
}

function byLocalName(doc, name) {
  return Array.from(doc.getElementsByTagName("*")).filter((n) => n.localName === name);
}

function firstText(doc, names) {
  for (const n of names) {
    const els = byLocalName(doc, n);
    if (els[0]) return text(els[0]);
  }
  return "";
}

function parseNumberLoose(s) {
  if (!s) return 0;
  const normalized = String(s).replace(/\s/g, "").replace(",", ".");
  const v = parseFloat(normalized);
  return Number.isFinite(v) ? v : 0;
}

function parseLinesFromFa(faEl) {
  const lines = [];
  const rows = Array.from(faEl.getElementsByTagName("*")).filter((n) => n.localName === "FaWiersz" || n.localName === "Wiersz");
  for (const w of rows) {
    const name =
      text(Array.from(w.getElementsByTagName("*")).find((n) => ["P_7", "Nazwa", "P_7Nazwa"].includes(n.localName)));
    const qty = parseNumberLoose(text(Array.from(w.getElementsByTagName("*")).find((n) => ["P_8B", "Ilosc"].includes(n.localName))));
    const net = parseNumberLoose(text(Array.from(w.getElementsByTagName("*")).find((n) => ["P_11", "P_11Netto", "KwotaNetto"].includes(n.localName))));
    const vat = parseNumberLoose(text(Array.from(w.getElementsByTagName("*")).find((n) => ["P_12", "KwotaVAT"].includes(n.localName))));
    const gross = parseNumberLoose(text(Array.from(w.getElementsByTagName("*")).find((n) => ["P_11A", "KwotaBrutto"].includes(n.localName))));
    if (name || net || gross) {
      lines.push({ nazwa: name || "Pozycja", ilosc: qty || null, netto: net, vat, brutto: gross || net + vat });
    }
  }
  return lines;
}

export function parsePolishInvoiceXml(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Niepoprawny XML");
  }

  const root = doc.documentElement;
  const isJpk = root.localName === "JPK" || root.localName.includes("JPK");

  let faEl =
    Array.from(doc.getElementsByTagName("*")).find((n) => n.localName === "Fa" && n.parentElement === root) ||
    Array.from(doc.getElementsByTagName("*")).find((n) => n.localName === "Fa");

  const invoiceNumber = firstText(doc, ["P_1", "NrFa", "InvoiceNumber", "NumerFaktury"]);
  const issueDate = firstText(doc, ["P_6", "DataWystawienia", "IssueDate"]);
  const dueDate = firstText(doc, ["DataZaplaty", "TerminPlatnosci", "PlatnoscTermin", "P_21", "DueDate"]);
  const nipSeller = firstText(doc, ["NIP_1", "NIP", "SprzedawcaNIP", "Podmiot1NIP"]);
  const nipBuyer = firstText(doc, ["NIP_2", "NabywcaNIP", "Podmiot2NIP"]);

  const net = parseNumberLoose(firstText(doc, ["P_13_1", "P_13", "SumaNetto", "KwotaNetto"]));
  const vat = parseNumberLoose(firstText(doc, ["P_14_1", "P_14", "SumaVAT", "KwotaVAT"]));
  const gross = parseNumberLoose(firstText(doc, ["P_15", "KwotaBrutto", "DoZaplaty"]));

  /** Faktura zakupu w CRM: kontrahent = sprzedawca / wystawca (Podmiot1), nie nabywca. */
  const sellerName = firstText(doc, ["Nazwa_1", "SprzedawcaNazwa", "Podmiot1Nazwa", "SellerName"]);
  const buyerName = firstText(doc, ["Nazwa_2", "NabywcaNazwa", "Podmiot2Nazwa", "BuyerName"]);
  const contractor = sellerName || buyerName;

  const currency = firstText(doc, ["KodWaluty", "Currency", "Waluta"]) || "PLN";

  const lines = faEl ? parseLinesFromFa(faEl) : [];

  if (!invoiceNumber && !gross && !net) {
    return [];
  }

  const record = {
    invoice_number: invoiceNumber || `XML-${Date.now()}`,
    contractor_name: contractor || "Kontrahent (XML)",
    contractor_nip: nipSeller || nipBuyer || "",
    payer: buyerName || "",
    issue_date: issueDate ? issueDate.slice(0, 10) : "",
    payment_deadline: dueDate ? dueDate.slice(0, 10) : "",
    amount: gross || net + vat || net,
    net_amount: net || null,
    vat_amount: vat || null,
    currency: currency || "PLN",
    invoice_lines: lines.length ? JSON.stringify(lines) : "",
    position: lines.map((l) => l.nazwa).filter(Boolean).join("; ") || (isJpk ? "JPK-FA / e-faktura" : "Import XML"),
    category: "standard",
    _sourceXml: true,
  };

  return [record];
}
