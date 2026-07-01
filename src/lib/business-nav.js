/**

 * Nawigacja „Power BI”: grupy + mapowanie strona → tytuł na pasku narzędzi.

 */



export const PAGE_TITLES = {

  MultiCurrencyDashboard: "Waluty / NBP",

  CEODashboard: "Pulpit CEO",

  Dashboard: "Pulpit operacyjny",

  Reports: "Raporty",

  CashFlow: "Przepływy pieniężne",

  IncomeStatement: "Rachunek wyników",

  ProjectBalance: "Bilans projektowy",

  ProjectCostMonitoring: "Monitoring kosztów",

  FinancialForecasts: "Prognozy",

  ExportReports: "Eksport Excel / PDF",

  Leads: "Leady",

  Suppliers: "Dostawcy",

  Portfolio: "Realizacje",

  Contractors: "Kontrahenci",

  Employees: "Pracownicy",

  Construction: "Projekty / budowa",

  Upload: "Import faktur",

  UploadWZ: "Import WZ",

  MaterialDeliveries: "Dostawy WZ",

  UploadLV: "Import kosztorysu LV",

  UploadPlan: "Import planów budowy",

  ProjectBoQ: "Kosztorysy LV",

  ConstructionPlans: "Plany budowy",

  Invoices: "Faktury",

  Transfers: "Przelewy",

  ExpectedRefunds: "Oczekiwane zwroty",

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

    id: "dokumenty",

    label: "Dokumenty",

    pages: ["Upload", "UploadWZ", "MaterialDeliveries", "UploadLV", "ProjectBoQ", "UploadPlan", "ConstructionPlans"],

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

      "Invoices",

      "Transfers",

      "ExpectedRefunds",

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

  return PAGE_TITLES[pageName] ?? "Strona";

}


