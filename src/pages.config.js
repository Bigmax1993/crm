/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import CashFlow from './pages/CashFlow';
import CEODashboard from './pages/CEODashboard';
import Construction from './pages/Construction';
import ContractorDetails from './pages/ContractorDetails';
import Contractors from './pages/Contractors';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import FinancialForecasts from './pages/FinancialForecasts';
import Hotels from './pages/Hotels';
import IncomeStatement from './pages/IncomeStatement';
import Invoices from './pages/Invoices';
import Leads from './pages/Leads';
import ExportReports from './pages/ExportReports';
import Portfolio from './pages/Portfolio';
import MultiCurrencyDashboard from './pages/MultiCurrencyDashboard';
import ProjectBalance from './pages/ProjectBalance';
import ProjectCostMonitoring from './pages/ProjectCostMonitoring';
import ProjectsMap from './pages/ProjectsMap';
import Reports from './pages/Reports';
import Roadmap from './pages/Roadmap';
import Settings from './pages/Settings';
import SettingsAI from './pages/SettingsAI';
import Suppliers from './pages/Suppliers';
import Transfers from './pages/Transfers';
import Transport from './pages/Transport';
import Upload from './pages/Upload';
import __Layout from './Layout.jsx';


export const PAGES = {
    "CashFlow": CashFlow,
    "CEODashboard": CEODashboard,
    "Construction": Construction,
    "ContractorDetails": ContractorDetails,
    "Contractors": Contractors,
    "Dashboard": Dashboard,
    "Employees": Employees,
    "FinancialForecasts": FinancialForecasts,
    "Hotels": Hotels,
    "IncomeStatement": IncomeStatement,
    "Invoices": Invoices,
    "Leads": Leads,
    "ExportReports": ExportReports,
    "Portfolio": Portfolio,
    "MultiCurrencyDashboard": MultiCurrencyDashboard,
    "ProjectBalance": ProjectBalance,
    "ProjectCostMonitoring": ProjectCostMonitoring,
    "ProjectsMap": ProjectsMap,
    "Reports": Reports,
    "Roadmap": Roadmap,
    "Settings": Settings,
    "SettingsAI": SettingsAI,
    "Suppliers": Suppliers,
    "Transfers": Transfers,
    "Transport": Transport,
    "Upload": Upload,
}

export const pagesConfig = {
    mainPage: "CEODashboard",
    Pages: PAGES,
    Layout: __Layout,
};