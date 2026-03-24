/**
 * Nawigacja „Power BI”: grupy + mapowanie strona → tytuł na pasku narzędzi.
 */

export const PAGE_TITLES = {
  MultiCurrencyDashboard: "Waluty / NBP",
  CEODashboard: "Dashboard CEO",
  Dashboard: "Dashboard operacyjny",
  Reports: "Raporty",
  CashFlow: "Cash flow",
  IncomeStatement: "Rachunek wyników",
  ProjectBalance: "Bilans projektowy",
  ProjectCostMonitoring: "Monitoring kosztów",
  FinancialForecasts: "Prognozy",
  ExportReports: "Eksport Excel / PDF",
  Leads: "Leady",
  Suppliers: "Dostawcy",
  Portfolio: "Realizacje (portfolio)",
  Contractors: "Kontrahenci",
  Employees: "Pracownicy",
  Construction: "Projekty / budowa",
  Upload: "Upload faktur",
  Invoices: "Faktury",
  Transfers: "Przelewy",
  Transport: "Transport",
  Hotels: "Hotele",
  ProjectsMap: "Mapa obiektów",
  SettingsAI: "Ustawienia AI",
  Roadmap: "Plan rozwoju",
  Settings: "Ustawienia",
  ContractorDetails: "Kontrahent",
};

/**
 * @typedef {{ name: string, page: string, icon: import('react').ComponentType<{ className?: string }> }} NavItem
 * @typedef {{ id: string, label: string, items: NavItem[] }} NavGroup
 */

/** Ikony przypisywane w Layout.jsx — tutaj tylko kolejność i grupy. */
export const NAV_GROUP_ORDER = [
  {
    id: "pulpity",
    label: "Pulpity",
    pages: ["MultiCurrencyDashboard", "CEODashboard", "Dashboard", "Reports"],
  },
  {
    id: "finanse",
    label: "Finanse",
    pages: [
      "CashFlow",
      "IncomeStatement",
      "ProjectBalance",
      "ProjectCostMonitoring",
      "FinancialForecasts",
      "ExportReports",
    ],
  },
  {
    id: "operacje",
    label: "Operacje",
    pages: [
      "Leads",
      "Suppliers",
      "Portfolio",
      "Contractors",
      "Employees",
      "Construction",
      "Upload",
      "Invoices",
      "Transfers",
      "Transport",
      "Hotels",
      "ProjectsMap",
    ],
  },
  {
    id: "system",
    label: "System",
    pages: ["SettingsAI", "Roadmap", "Settings"],
  },
];

export function titleForPage(pageName) {
  if (pageName == null || pageName === "") return "Fakturowo";
  const fromCamel = pageName.replace(/([A-Z])/g, " $1").trim() || "Fakturowo";
  return PAGE_TITLES[pageName] ?? fromCamel;
}
