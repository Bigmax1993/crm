/**
 * Kanoniczne definicje metryk finansowych w CRM.
 * Funkcje w `finance.js` i `finance-pln.js` powinny być opisane tutaj;
 * w UI używaj `summary` pod wykresami / kartami.
 */
export const FINANCE_METRICS = {
  receivablesOpenPln: {
    summary:
      "Należności: FV sprzedaży niezapłacone lub przeterminowane; PLN wg kursu z daty wystawienia (lub zapisane amount_pln).",
    detail:
      "Filtrowanie: invoice_type === \"sales\", status unpaid/overdue. Kwota: getInvoicePlnAtIssue (NBP / amount_pln).",
  },
  payablesOpenPln: {
    summary:
      "Zobowiązania: FV zakupu niezapłacone lub przeterminowane; PLN jak przy należnościach.",
    detail:
      "Filtrowanie: invoice_type !== \"sales\", status unpaid/overdue. Kwota: getInvoicePlnAtIssue.",
  },
  revenueCostMonthlyAccrualPln: {
    summary:
      "Przychód vs koszt (miesiąc): data wystawienia; wszystkie FV (także nieopłacone); PLN z wystawienia.",
    detail:
      "monthlyRevenueVsCostPln — bez filtra paid; sales = przychód, purchase = koszt.",
  },
  cashflowMonthlyPaidPln: {
    summary:
      "Cash flow: tylko FV opłacone; miesiąc wg daty płatności; PLN preferencyjnie z kursu płatności.",
    detail:
      "monthlyCashFlowPaidPln — status paid, invoicePaidDate, getInvoicePlnForCashflow.",
  },
  resultGlobalPaidPln: {
    summary:
      "Wynik globalny (zapłacone): suma opłaconej sprzedaży minus opłacone zakupy w PLN.",
    detail: "globalPLPln — ten sam PLN co cash flow (getInvoicePlnForCashflow).",
  },
  resultGlobalPaidRawCurrency: {
    summary:
      "Wynik w jednej walucie surowej: tylko FV w tej walucie, pole amount; bez przeliczenia NBP.",
    detail: "globalPL(invoices, currency) — używane tam, gdzie nie ma jeszcze warstwy PLN.",
  },
  resultByProjectPaidPln: {
    summary:
      "Rachunek per projekt: tylko opłacone FV z project_id; PLN jak przy cash flow.",
    detail: "plByProjectPln — sales paid vs purchase paid.",
  },
  quarterlyTrendPaidPln: {
    summary: "Trend kwartalny: kwartał wg daty płatności, tylko opłacone, PLN jak cash flow.",
    detail: "quarterlyYoYTrendPln.",
  },
  projectCostAccruedPln: {
    summary:
      "Koszty na wykresie wg projektu: zakupy z project_id; PLN z wystawienia; bez wymogu zapłaty.",
    detail: "costByProjectPln — wyłącza sales, sumuje purchase po getInvoicePlnAtIssue.",
  },
  budgetUtilizationPln: {
    summary:
      "Alert budżetu: koszt = suma zakupów projektu (także nieopłaconych) w PLN z wystawienia vs budget_planned.",
    detail: "budgetAlertsPln / budgetCostPlnForProject.",
  },
  projectProfitabilityMixedPln: {
    summary:
      "Rentowność projektu: przychód = sprzedaż opłacona (PLN z płatności); koszty = wszystkie zakupy (PLN z wystawienia). Mieszana metoda — orientacyjnie.",
    detail:
      "projectProfitabilityPln — przychód tylko paid sales; koszty wszystkie purchase dla project_id. Nie jest pełnym P&L rachunkowym.",
  },
  receivablesPayablesRawSingleCurrency: {
    summary:
      "Należności / zobowiązania (jedna waluta): jak wyżej, ale tylko FV w wybranej walucie, kwota = amount.",
    detail: "sumReceivables / sumPayables w finance.js.",
  },
};

/** @param {string} key — klucz z {@link FINANCE_METRICS} */
export function financeMetricSummary(key) {
  return FINANCE_METRICS[key]?.summary ?? "";
}
