/**
 * Parsowanie CSV wyciągów / eksportów pod stronę Potwierdzenia płatności (Transfers).
 * Używane w UI i w testach jednostkowych.
 */

export function extractInvoiceNumber(text) {
  if (!text) return "";
  const patterns = [
    /[A-Z]{1,5}\/\d{1,4}\/\d{2,4}/i,
    /\d{1,4}\/\d{2,4}/,
    /FV[- ]?\d{1,10}/i,
    /F[- ]?\d{1,10}/i,
    /\d{5,10}/,
    /FAKTURA[- ]?NR[- ]?\d{1,6}\/\d{4}/i,
    /INV[- ]?\d{4}[- ]?\d{1,6}/i,
    /#\d{5,10}/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return "";
}

export function parseCSV(text) {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 1) return [];

  const firstLine = lines[0];
  const isBankStatement =
    firstLine.includes("EUR;") ||
    firstLine.includes("PLN;") ||
    (firstLine.split(";").length >= 5 && !firstLine.toLowerCase().includes("kontrahent"));

  if (isBankStatement) {
    const results = [];

    for (const line of lines) {
      const parts = line.split(";");
      if (parts.length < 5) continue;

      if (line.includes("PROWIZJA") || line.includes("Opłata za prowadzenie")) continue;

      let date = parts[0]?.trim();
      const description = parts[1]?.trim() || "";
      let contractor = "";
      let accountNumber = "";
      let amount = 0;
      let currency = "PLN";

      if (line.includes("EUR")) currency = "EUR";

      const descParts = description.split(";");
      for (let i = 0; i < descParts.length; i++) {
        const part = descParts[i].trim();

        if (part.match(/[A-Z][a-z]+.*(?:sp\.|S\.A\.|GmbH|Poland|POLAND)/i)) {
          contractor = part;
        }

        if (part.match(/[A-Z]{2}\d{2}|^\d{2}\s?\d{4}/)) {
          accountNumber = part;
        }
      }

      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i].replace(/\s/g, "");
        if (part.match(/^-?\d+[,.]?\d*$/)) {
          const value = parseFloat(part.replace(",", "."));
          if (value < 0) {
            amount = Math.abs(value);
            break;
          }
        }
      }

      if (date && date.match(/\d{2}\.\d{2}\.\d{4}/)) {
        const [day, month, year] = date.split(".");
        date = `${year}-${month}-${day}`;
      }

      if (amount > 0 && contractor) {
        results.push({
          contractor_name: contractor,
          amount,
          currency,
          transfer_date: date || "",
          title: description,
          account_number: accountNumber,
          payer: "KANBUD Sp. z o.o. Sp.k.",
          invoice_number: extractInvoiceNumber(description),
        });
      }
    }

    return results;
  }

  if (lines.length < 2) return [];
  const headers = lines[0].split(";").map((h) => h.trim().replace(/"/g, ""));
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(";").map((v) => v.trim().replace(/"/g, ""));
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });

    const transfer = {
      contractor_name:
        row["Kontrahent"] || row["Nazwa kontrahenta"] || row["Kontrahent"] || "",
      amount: Math.abs(
        parseFloat(
          (row["Kwota"] || row["Kwota przelewu"] || "0").replace(",", ".").replace(/[^\d.-]/g, "")
        )
      ),
      currency: row["Waluta"] || row["Waluta przelewu"] || "PLN",
      transfer_date: row["Data"] || row["Data przelewu"] || "",
      title:
        row["Tytul"] ||
        row["Tytuł przelewu"] ||
        row["Tytuł płatności"] ||
        row["Opis"] ||
        "",
      account_number: row["Numer konta"] || row["Nr konta"] || "",
      payer: "KANBUD Sp. z o.o. Sp.k.",
    };

    transfer.invoice_number =
      row["Numer faktury"] || row["Faktura"] || extractInvoiceNumber(transfer.title);

    if (transfer.amount > 0) {
      results.push(transfer);
    }
  }

  return results;
}
