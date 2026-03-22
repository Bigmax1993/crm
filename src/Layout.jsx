import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
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
  Truck,
  Menu,
  X,
  LogOut,
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
} from 'lucide-react';
import { MizarSportLogo } from '@/components/brand/MizarSportLogo';
import { MIZAR_EXPORT_ADDRESS, MIZAR_EXPORT_WEB } from '@/lib/mizar-brand-brief';
import { Button } from '@/components/ui/button';
import { ModeToggle } from '@/components/mode-toggle';
import { CurrencySwitcher } from '@/components/currency/CurrencySwitcher';
import { FinancialAiChat } from '@/components/ai/FinancialAiChat';

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  React.useEffect(() => {
    const homePage = localStorage.getItem('app_home_page');
    if (homePage && currentPageName === 'Home' && homePage !== 'Home') {
      window.location.href = createPageUrl(homePage);
    }
  }, [currentPageName]);

  const handleLogout = async () => {
    const { base44 } = await import('@/api/base44Client');
    await base44.auth.logout();
  };

  const navigation = [
    { name: 'Waluty / NBP', page: 'MultiCurrencyDashboard', icon: Banknote },
    { name: 'Dashboard CEO', page: 'CEODashboard', icon: LayoutDashboard },
    { name: 'Dashboard (operacyjny)', page: 'Dashboard', icon: BarChart3 },
    { name: 'Bilans projektowy', page: 'ProjectBalance', icon: Scale },
    { name: 'Cash flow', page: 'CashFlow', icon: Waves },
    { name: 'Rachunek wyników', page: 'IncomeStatement', icon: LineChart },
    { name: 'Monitoring kosztów', page: 'ProjectCostMonitoring', icon: Radar },
    { name: 'Prognozy', page: 'FinancialForecasts', icon: TrendingUp },
    { name: 'Mapa obiektów', page: 'ProjectsMap', icon: MapPinned },
    { name: 'Eksport Excel/PDF', page: 'MizarExport', icon: FileSpreadsheet },
    { name: 'Leady', page: 'Leads', icon: Inbox },
    { name: 'Dostawcy', page: 'Suppliers', icon: Package },
    { name: 'Realizacje (portfolio)', page: 'Portfolio', icon: Images },
    { name: 'Kontrahenci', page: 'Contractors', icon: Building2 },
    { name: 'Pracownicy', page: 'Employees', icon: Users },
    { name: 'Projekty / budowa', page: 'Construction', icon: HardHat },
    { name: 'Upload faktur', page: 'Upload', icon: Upload },
    { name: 'Faktury', page: 'Invoices', icon: FileText },
    { name: 'Przelewy', page: 'Transfers', icon: CreditCard },
    { name: 'Transport', page: 'Transport', icon: Truck },
    { name: 'Hotele', page: 'Hotels', icon: Hotel },
    { name: 'Raporty', page: 'Reports', icon: BarChart3 },
    { name: 'Ustawienia AI', page: 'SettingsAI', icon: Sparkles },
    { name: 'Ustawienia', page: 'Settings', icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MizarSportLogo size="sm" />
          <h1 className="font-bold text-lg text-foreground truncate">MIZAR CRM</h1>
        </div>
        <div className="flex items-center gap-1">
          <CurrencySwitcher />
          <ModeToggle className="text-foreground" />
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border transform transition-transform duration-200 ease-in-out lg:translate-x-0 flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
            MS
          </div>
          <h1 className="text-xl font-bold text-sidebar-foreground mb-1">MIZAR Sp. z o.o.</h1>
          <p className="text-sidebar-foreground/55 text-sm">CRM — obiekty sportowe</p>
        </div>
        <nav className="px-3 space-y-0.5 flex-1 overflow-y-auto pb-4">
          {navigation.map((item) => {
            const isActive = currentPageName === item.page;
            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="leading-tight">{item.name}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-3 pb-4 space-y-2 border-t border-sidebar-border pt-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-sidebar-foreground/50">Motyw</span>
            <ModeToggle className="text-sidebar-foreground/80 hover:text-sidebar-foreground" />
          </div>
          <Button
            onClick={handleLogout}
            variant="ghost"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-5 w-5" />
            Wyloguj się
          </Button>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="lg:pl-64 pt-16 lg:pt-0 flex flex-col min-h-screen">
        <div className="hidden lg:flex justify-end items-center gap-2 px-4 py-2 border-b border-border bg-background/90 backdrop-blur-sm sticky top-0 z-20">
          <CurrencySwitcher />
        </div>
        <div className="flex-1">{children}</div>
        <footer className="border-t bg-muted/30 px-4 py-4 text-center text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground/80">Mizar Sport — {MIZAR_EXPORT_ADDRESS}</p>
          <p>
            <a href={MIZAR_EXPORT_WEB} className="text-primary hover:underline" target="_blank" rel="noreferrer">
              {MIZAR_EXPORT_WEB}
            </a>
          </p>
        </footer>
        <FinancialAiChat />
      </main>
    </div>
  );
}
