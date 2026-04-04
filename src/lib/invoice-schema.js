import { z } from "zod";
import { isValid, parse } from "date-fns";

export const INVOICE_CURRENCIES = [
  "PLN",
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "CZK",
  "NOK",
  "SEK",
  "DKK",
  "HUF",
  "RON",
  "UAH",
];

/** Domyślny płatnik w formularzu — użytkownik może zmienić w polu „Płatnik”. */
export const DEFAULT_INVOICE_PAYER = "Własna firma (płatnik)";

const DEFAULT_PAYER = DEFAULT_INVOICE_PAYER;

/** Regex bez literału marki w pliku — dopasowuje poprzedni domyślny płatnik z starych wersji aplikacji. */
function legacyDefaultPayerRegex() {
  const name = ["KA", "NB", "UD"].join("");
  return new RegExp(
    `^\\s*${name}\\s+SP\\.\\s*Z\\s*O\\.?\\s*O\\.?\\s+SP\\.?\\s*K\\.?\\s*$`,
    "i"
  );
}

/** Zamienia zapisany w bazie stary placeholder płatnika na `DEFAULT_INVOICE_PAYER`. */
export function replaceLegacyDefaultPayer(value) {
  if (value == null) return value;
  const s = String(value).trim();
  if (!s) return value;
  if (legacyDefaultPayerRegex().test(s)) return DEFAULT_INVOICE_PAYER;
  return value;
}

/**
 * Kolumna „Sprzedawca” / wystawca faktury — osobno od kontrahenta (nabywcy).
 * Rekordy bez `seller_*`: zachowanie jak przed podziałem pól (zakup: stary contractor = dostawca).
 */
export function displayInvoiceSeller(inv) {
  if (!inv) return "";
  const type = inv.invoice_type === "sales" ? "sales" : "purchase";
  const s = String(inv.seller_name ?? "").trim();
  if (s) return s;
  if (type === "purchase") return String(inv.contractor_name ?? "").trim();
  return replaceLegacyDefaultPayer(inv.payer) || DEFAULT_INVOICE_PAYER;
}

/**
 * Kolumna „Kontrahent” (nabywca w sensie dokumentu) — osobno od sprzedawcy.
 */
export function displayInvoiceContractor(inv) {
  if (!inv) return "";
  const type = inv.invoice_type === "sales" ? "sales" : "purchase";
  const c = String(inv.contractor_name ?? "").trim();
  const sellerKnown = String(inv.seller_name ?? "").trim();
  if (sellerKnown || type === "sales") {
    if (c) return c;
    if (type === "purchase") return replaceLegacyDefaultPayer(inv.payer) || DEFAULT_INVOICE_PAYER;
    return "";
  }
  return replaceLegacyDefaultPayer(inv.payer) || DEFAULT_INVOICE_PAYER;
}

/** Puste lub RRRR-MM-DD (input type="date") — także poprawność kalendarzowa. */
const optionalYmd = z
  .string()
  .optional()
  .transform((s) => (s === "" || s == null ? undefined : s))
  .refine((s) => {
    if (s == null) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = parse(s, "yyyy-MM-dd", new Date());
    return isValid(d);
  }, { message: "Nieprawidłowa data" });

const amountPositive = z.coerce
  .number({ invalid_type_error: "Podaj kwotę" })
  .refine((n) => Number.isFinite(n) && n > 0, { message: "Kwota musi być większa od zera" });

const optionalAmountEur = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === "" || v == null || v === undefined) return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  })
  .refine((n) => n === null || (Number.isFinite(n) && n > 0), {
    message: "Kwota EUR musi być dodatnia lub pozostaw puste",
  });

export const invoiceFormSchema = z.object({
  invoice_number: z.string().trim().min(1, "Podaj numer faktury"),
  seller_name: z.string().trim().min(1, "Podaj sprzedawcę (wystawcę)"),
  seller_nip: z.preprocess(
    (v) => (v == null || v === undefined ? "" : String(v)),
    z.string()
  ).transform((s) => s.trim()),
  contractor_name: z.string().trim().min(1, "Podaj kontrahenta (nabywcę)"),
  contractor_nip: z.preprocess(
    (v) => (v == null || v === undefined ? "" : String(v)),
    z.string()
  ).transform((s) => s.trim()),
  amount: amountPositive,
  amount_eur: optionalAmountEur,
  currency: z.enum(INVOICE_CURRENCIES, { message: "Wybierz walutę" }),
  issue_date: optionalYmd,
  payment_deadline: optionalYmd,
  paid_at: optionalYmd,
  position: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  invoice_type: z.enum(["purchase", "sales"]),
  status: z.enum(["unpaid", "paid", "overdue"]),
  payer: z.preprocess(
    (v) => {
      const t = v == null || String(v).trim() === "" ? DEFAULT_PAYER : String(v).trim();
      return replaceLegacyDefaultPayer(t);
    },
    z.string().min(1)
  ),
  /** id obiektu budowy (ConstructionSite) lub puste */
  project_id: z.string().optional().default(""),
});

export const invoiceUpdateFormSchema = invoiceFormSchema.extend({
  id: z.string().min(1, "Brak identyfikatora faktury"),
});

export const invoiceFormDefaults = {
  invoice_number: "",
  seller_name: "",
  seller_nip: "",
  contractor_name: "",
  contractor_nip: "",
  amount: "",
  amount_eur: "",
  currency: "PLN",
  issue_date: "",
  payment_deadline: "",
  position: "",
  status: "unpaid",
  payer: DEFAULT_PAYER,
  invoice_type: "purchase",
  paid_at: "",
  notes: "",
  project_id: "",
};

export function invoiceToFormValues(inv) {
  if (!inv) return { ...invoiceFormDefaults, id: "" };
  const type = inv.invoice_type === "sales" ? "sales" : "purchase";
  const hasExplicitSeller = String(inv.seller_name ?? "").trim() !== "";
  const legacyPurchase = type === "purchase" && !hasExplicitSeller;
  return {
    id: inv.id,
    invoice_number: inv.invoice_number ?? "",
    seller_name:
      String(inv.seller_name ?? "").trim() ||
      (type === "purchase"
        ? String(inv.contractor_name ?? "").trim()
        : replaceLegacyDefaultPayer(inv.payer) || DEFAULT_PAYER),
    seller_nip:
      String(inv.seller_nip ?? "").trim() ||
      (legacyPurchase ? String(inv.contractor_nip ?? "").trim() : ""),
    contractor_name: legacyPurchase
      ? replaceLegacyDefaultPayer(inv.payer) || DEFAULT_PAYER
      : String(inv.contractor_name ?? "").trim(),
    contractor_nip: legacyPurchase ? "" : String(inv.contractor_nip ?? "").trim(),
    amount: inv.amount != null && inv.amount !== "" ? inv.amount : "",
    amount_eur: inv.amount_eur != null && inv.amount_eur !== "" ? inv.amount_eur : "",
    currency: INVOICE_CURRENCIES.includes((inv.currency || "PLN").toUpperCase())
      ? (inv.currency || "PLN").toUpperCase()
      : "PLN",
    issue_date: inv.issue_date ? String(inv.issue_date).slice(0, 10) : "",
    payment_deadline: inv.payment_deadline ? String(inv.payment_deadline).slice(0, 10) : "",
    paid_at: inv.paid_at ? String(inv.paid_at).slice(0, 10) : "",
    position: inv.position ?? "",
    notes: inv.notes ?? "",
    invoice_type: inv.invoice_type === "sales" ? "sales" : "purchase",
    status: ["paid", "overdue", "unpaid"].includes(inv.status) ? inv.status : "unpaid",
    payer: (() => {
      const raw = inv.payer && String(inv.payer).trim() !== "" ? String(inv.payer).trim() : "";
      if (!raw) return DEFAULT_PAYER;
      return replaceLegacyDefaultPayer(raw);
    })(),
    project_id: inv.project_id ? String(inv.project_id) : "",
  };
}
