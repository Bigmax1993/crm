import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl, createAbsolutePageHref } from "@/utils";
import {
  LayoutDashboard,
  Upload,
  FileText,
  CreditCard,
  BarChart3,
  Building2,
  Hotel,
  Users,
  HardHat,
  Menu,
  Settings as SettingsIcon,
  Scale,
  Waves,
  LineChart,
  Radar,
  MapPinned,
  FileSpreadsheet,
  TrendingUp,
  Banknote,
  Sparkles,
  Inbox,
  Package,
  Images,
  Truck,
  PanelLeft,
  ListChecks,
} from "lucide-react";
import { AppLogo } from "@/components/brand/AppLogo";
import { EXPORT_ADDRESS, EXPORT_WEB } from "@/lib/brand-brief";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { CurrencySwitcher } from "@/components/currency/CurrencySwitcher";
import { FinancialAiChat } from "@/components/ai/FinancialAiChat";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NAV_GROUP_ORDER, PAGE_TITLES, titleForPage } from "@/lib/business-nav";
import { canAccessPage } from "@/lib/auth-roles";

const PAGE_ICONS = {
  MultiCurrencyDashboard: Banknote,
  CEODashboard: LayoutDashboard,
  Dashboard: BarChart3,
  Reports: BarChart3,
  CashFlow: Waves,
  IncomeStatement: LineChart,
  ProjectBalance: Scale,
  ProjectCostMonitoring: Radar,
  FinancialForecasts: TrendingUp,
  ExportReports: FileSpreadsheet,
  Leads: Inbox,
  Suppliers: Package,
  Portfolio: Images,
  Contractors: Building2,
  Employees: Users,
  Construction: HardHat,
  Upload: Upload,
  Invoices: FileText,
  Transfers: CreditCard,
  Transport: Truck,
  Hotels: Hotel,
  ProjectsMap: MapPinned,
  SettingsAI: Sparkles,
  Roadmap: ListChecks,
  Settings: SettingsIcon,
};

const NAV_GROUPS = NAV_GROUP_ORDER.map((g) => ({
  ...g,
  items: g.pages
    .map((page) => ({
      page,
      name: PAGE_TITLES[page],
      icon: PAGE_ICONS[page],
    }))
    .filter((x) => x.icon && x.name && canAccessPage(x.page, null)),
})).filter((g) => g.items.length > 0);

/**
 * Klik w obszar treści (nie w sidebar): zwijamy rail tylko gdy nie trafiono w element interaktywny
 * (link, przycisk, pole, menu Radix itd.).
 */
function shouldCollapseRailOnCanvasPointerDown(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-rail-aside]")) return false;
  if (
    target.closest(
      [
        "a[href]",
        "button:not([disabled])",
        "input:not([disabled])",
        "textarea:not([disabled])",
        "select:not([disabled])",
        "option",
        "label",
        "summary",
        "[role='button']",
        "[role='menuitem']",
        "[role='menuitemcheckbox']",
        "[role='option']",
        "[role='combobox']",
        "[role='listbox']",
        "[role='tab']",
        "[role='switch']",
        "[role='checkbox']",
        "[role='radio']",
        "[role='slider']",
        "[role='searchbox']",
        "[role='spinbutton']",
        "[contenteditable='true']",
        "[data-rail-ignore-outside-click]",
      ].join(",")
    )
  ) {
    return false;
  }
  return true;
}

function NavRailLink({ item, isActive, expanded }) {
  const Icon = item.icon;
  const link = (
    <Link
      to={createPageUrl(item.page)}
      aria-label={item.name}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
        expanded
          ? "min-h-10 w-full gap-3 px-3 py-2 text-sm font-medium"
          : "h-11 w-11 justify-center",
        isActive
          ? "bg-slate-800 text-white shadow-sm ring-1 ring-slate-600/80"
          : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-100"
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {expanded ? <span className="min-w-0 truncate">{item.name}</span> : null}
    </Link>
  );

  if (expanded) return link;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs border-slate-700 bg-slate-900 text-slate-100">
        <p className="text-xs font-medium">{item.name}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function MobileNavList({ currentPageName, onItemClick, groups = NAV_GROUPS }) {
  return (
    <nav className="flex flex-col gap-6 pb-8 pt-2">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const isActive = currentPageName === item.page;
              const Icon = item.icon;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  onClick={onItemClick}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-90" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  /** Desktop: zwinięty rail (ikony); klik w sidebar rozwija; zwija się po kliknięciu w „puste” miejsce treści. */
  const [railExpanded, setRailExpanded] = React.useState(false);

  React.useEffect(() => {
    const homePage = localStorage.getItem("app_home_page");
    if (homePage && currentPageName === "Home" && homePage !== "Home") {
      window.location.href = createAbsolutePageHref(homePage);
    }
  }, [currentPageName]);

  /** Po przejściu w menu (inna strona) — widok od góry, żeby nie zostawać w połowie scrolla. */
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);


  const pageTitle = titleForPage(currentPageName);
  const closeMobile = () => setMobileOpen(false);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen overflow-x-hidden bg-[hsl(40_7%_93%)] text-foreground dark:bg-background">
        {/* Mobile top bar */}
        <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => setMobileOpen(true)}
              aria-label="Menu nawigacji"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">{pageTitle}</p>
              <p className="truncate text-[11px] text-muted-foreground">Fakturowo</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <CurrencySwitcher />
            <ModeToggle />
          </div>
        </header>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[min(100%,20rem)] overflow-y-auto p-0 sm:max-w-md">
            <div className="border-b border-border px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                  FW
                </div>
                <div>
                  <p className="font-semibold leading-tight">Fakturowo CRM</p>
                  <p className="text-xs text-muted-foreground">Analiza i operacje</p>
                </div>
              </div>
            </div>
            <div className="px-3 py-4">
              <MobileNavList currentPageName={currentPageName} onItemClick={closeMobile} groups={NAV_GROUPS} />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-h-screen min-w-0 overflow-x-hidden">
          {/* Desktop: rail — klik rozwija; zwinięcie tylko z obszaru treści (patrz canvas onPointerDown) */}
          <aside
            role="navigation"
            aria-label="Menu główne"
            data-rail-aside
            data-rail-expanded={railExpanded ? "true" : "false"}
            onClick={() => setRailExpanded(true)}
            className={cn(
              "relative z-30 hidden shrink-0 flex-col overflow-hidden border-r border-slate-800/90 bg-slate-950 text-slate-200 transition-[width] duration-200 ease-out lg:flex",
              railExpanded ? "w-[min(100vw,17.5rem)]" : "w-[72px]"
            )}
          >
            <div
              className={cn(
                "border-b border-slate-800/90 py-4",
                railExpanded ? "flex flex-row items-center gap-2 px-3" : "flex flex-col items-center px-2"
              )}
            >
              <Link
                to={createPageUrl("CEODashboard")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-sm font-bold text-white ring-1 ring-slate-700 transition hover:bg-slate-700"
                title="Start — Dashboard CEO"
              >
                FW
              </Link>
              {railExpanded ? (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight text-slate-100">Fakturowo</p>
                  <p className="truncate text-[11px] text-slate-500">CRM</p>
                </div>
              ) : null}
            </div>
            <nav
              className={cn(
                "flex flex-1 flex-col gap-1 overflow-x-hidden px-2.5 py-3",
                railExpanded ? "rail-nav-scrollbar min-h-0 overflow-y-auto" : "overflow-y-auto"
              )}
            >
              {NAV_GROUPS.map((group, gi) => (
                <div key={group.id} className="flex flex-col gap-1">
                  {gi > 0 ? (
                    railExpanded ? (
                      <div className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {group.label}
                      </div>
                    ) : (
                      <div className="mx-auto my-1 h-px w-8 bg-slate-800" aria-hidden />
                    )
                  ) : null}
                  {gi === 0 && railExpanded ? (
                    <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      {group.label}
                    </div>
                  ) : null}
                  {group.items.map((item) => (
                    <NavRailLink
                      key={item.page}
                      item={item}
                      isActive={currentPageName === item.page}
                      expanded={railExpanded}
                    />
                  ))}
                </div>
              ))}
            </nav>
            <div
              className={cn(
                "border-t border-slate-800/90 py-3",
                railExpanded ? "flex flex-col gap-1 px-2" : "flex flex-col items-center gap-2 px-2"
              )}
            >
              {railExpanded ? (
                <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-slate-400 hover:bg-slate-800/50">
                  <span className="text-xs text-slate-500">Motyw</span>
                  <ModeToggle className="text-slate-300 hover:text-white [&_svg]:h-5 [&_svg]:w-5" />
                </div>
              ) : (
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <div>
                      <ModeToggle className="text-slate-400 hover:text-white [&_svg]:h-5 [&_svg]:w-5" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="border-slate-700 bg-slate-900 text-slate-100">
                    Motyw jasny / ciemny
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </aside>

          {/* Canvas + toolbar — klik w nieinteraktywne tło zamyka rozwinięty rail */}
          <div
            className="flex min-w-0 flex-1 flex-col overflow-x-hidden"
            onPointerDown={(e) => {
              if (!railExpanded) return;
              if (!shouldCollapseRailOnCanvasPointerDown(e.target)) return;
              setRailExpanded(false);
            }}
          >
            <header className="sticky top-0 z-20 hidden border-b border-border/80 bg-background/90 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/75 lg:flex lg:h-14 lg:items-center lg:justify-between lg:px-6">
              <div className="flex min-w-0 items-baseline gap-3">
                <div className="hidden text-muted-foreground lg:block" aria-hidden>
                  <PanelLeft className="h-4 w-4 opacity-50" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">{pageTitle}</h1>
                  <p className="text-xs text-muted-foreground">Fakturowo · workspace</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AppLogo size="sm" className="hidden opacity-80 xl:flex" />
                <CurrencySwitcher />
              </div>
            </header>

            {/* Toolbar mobile: placeholder spacing — real bar is fixed above */}
            <div className="h-14 shrink-0 lg:hidden" aria-hidden />

            <main className="min-w-0 flex-1 overflow-x-hidden">
              <div className="mx-auto w-full min-w-0 max-w-[1600px] px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
                {children}
              </div>
            </main>

            <footer className="border-t border-border/80 bg-background/80 px-4 py-3 text-center text-xs text-muted-foreground">
              {EXPORT_ADDRESS ? <p className="font-medium text-foreground/80">{EXPORT_ADDRESS}</p> : null}
              {EXPORT_WEB ? (
                <p>
                  <a href={EXPORT_WEB} className="text-primary hover:underline" target="_blank" rel="noreferrer">
                    {EXPORT_WEB}
                  </a>
                </p>
              ) : null}
            </footer>

            <FinancialAiChat />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
