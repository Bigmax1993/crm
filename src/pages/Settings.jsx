import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Settings as SettingsIcon, Home, Save, Banknote, Database, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { loadFxConfig, saveFxConfig } from '@/lib/fx-config-store';
import { seedMizarTestData } from '@/lib/seed-mizar-test-data';
import { resetDB } from '@/lib/database';

const FX_CODES = ['PLN', 'EUR', 'USD', 'GBP', 'CHF', 'CZK', 'NOK', 'SEK', 'DKK', 'HUF', 'RON', 'UAH'];

export default function Settings() {
  const queryClient = useQueryClient();
  const [homePage, setHomePage] = useState('CEODashboard');
  const [saved, setSaved] = useState(false);
  const [fxConfig, setFxConfig] = useState(loadFxConfig);

  const seedMutation = useMutation({
    mutationFn: () => seedMizarTestData(base44),
    onSuccess: (res) => {
      queryClient.invalidateQueries();
      toast.success(
        `Import zakończony: obiekty ${res.createdSites}, kontrahenci ${res.createdContractors}, faktury ${res.createdInvoices}`
      );
    },
    onError: (e) => {
      toast.error(e?.message || 'Błąd importu danych testowych');
    },
  });

  useEffect(() => {
    const savedHomePage = localStorage.getItem('app_home_page');
    if (savedHomePage) {
      setHomePage(savedHomePage);
    }
    setFxConfig(loadFxConfig());
  }, []);

  const handleSave = () => {
    localStorage.setItem('app_home_page', homePage);
    setSaved(true);
    toast.success('Ustawienia zapisane');
    setTimeout(() => setSaved(false), 2000);
  };

  const saveFx = () => {
    saveFxConfig(fxConfig);
    toast.success('Konfiguracja walut zapisana');
  };

  const toggleFxActive = (code) => {
    const set = new Set(fxConfig.activeCurrencies || []);
    if (set.has(code)) set.delete(code);
    else set.add(code);
    setFxConfig({ ...fxConfig, activeCurrencies: [...set] });
  };

  const setManualMid = (code, val) => {
    const n = val === '' ? undefined : parseFloat(val);
    const manualMid = { ...(fxConfig.manualMid || {}) };
    if (n == null || Number.isNaN(n)) delete manualMid[code];
    else manualMid[code] = n;
    setFxConfig({ ...fxConfig, manualMid });
  };

  const pages = [
    { value: 'MultiCurrencyDashboard', label: 'Waluty / NBP' },
    { value: 'CEODashboard', label: 'Dashboard CEO' },
    { value: 'Dashboard', label: 'Dashboard operacyjny' },
    { value: 'ProjectBalance', label: 'Bilans projektowy' },
    { value: 'CashFlow', label: 'Cash flow' },
    { value: 'IncomeStatement', label: 'Rachunek wyników' },
    { value: 'ProjectCostMonitoring', label: 'Monitoring kosztów' },
    { value: 'FinancialForecasts', label: 'Prognozy' },
    { value: 'ProjectsMap', label: 'Mapa obiektów' },
    { value: 'MizarExport', label: 'Eksport Excel/PDF' },
    { value: 'Invoices', label: 'Faktury' },
    { value: 'Contractors', label: 'Kontrahenci' },
    { value: 'Transfers', label: 'Przelewy' },
    { value: 'Reports', label: 'Raporty' },
    { value: 'Construction', label: 'Projekty / budowa' },
    { value: 'Employees', label: 'Pracownicy' },
    { value: 'Hotels', label: 'Hotele' },
    { value: 'Upload', label: 'Upload faktur' },
  ];

  return (
    <div className="w-full p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <SettingsIcon className="h-8 w-8 text-muted-foreground" />
            <h1 className="text-4xl font-bold text-foreground">Ustawienia</h1>
          </div>
          <p className="text-muted-foreground">Konfiguracja systemu MIZAR CRM</p>
        </div>

        <Card className="bg-white shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              Strona domowa
            </CardTitle>
            <CardDescription>
              Wybierz stronę, która będzie wyświetlana po zalogowaniu
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Strona początkowa</Label>
              <Select value={homePage} onValueChange={setHomePage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pages.map(page => (
                    <SelectItem key={page.value} value={page.value}>
                      {page.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Button 
              onClick={handleSave}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Save className="mr-2 h-4 w-4" />
              Zapisz ustawienia
            </Button>

            {saved && (
              <p className="text-sm text-green-600">✓ Ustawienia zostały zapisane</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white shadow-lg mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              Waluty i NBP
            </CardTitle>
            <CardDescription>
              Waluta bazowa (domyślnie PLN), aktywne waluty w przełączniku widoku oraz ręczne kursy zapasowe (PLN za 1 jednostkę), gdy API NBP jest niedostępne.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2 max-w-xs">
              <Label>Waluta bazowa systemu</Label>
              <Select
                value={fxConfig.baseCurrency || 'PLN'}
                onValueChange={(v) => setFxConfig({ ...fxConfig, baseCurrency: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FX_CODES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-3 block">Aktywne waluty (przełącznik + tabela kursów)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {FX_CODES.map((code) => (
                  <label key={code} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={(fxConfig.activeCurrencies || []).includes(code)}
                      onCheckedChange={() => toggleFxActive(code)}
                    />
                    {code}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Ręczne kursy zapasowe (średni NBP, PLN za 1 jednostkę)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {['EUR', 'USD', 'GBP', 'CHF', 'CZK'].map((code) => (
                  <div key={code}>
                    <Label className="text-xs text-muted-foreground">{code}</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      placeholder="np. 4.32"
                      value={fxConfig.manualMid?.[code] ?? ''}
                      onChange={(e) => setManualMid(code, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={saveFx} className="bg-blue-600 hover:bg-blue-700">
              <Save className="mr-2 h-4 w-4" />
              Zapisz konfigurację walut
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-white shadow-lg mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-emerald-600" />
              Lokalna baza SQL.js
            </CardTitle>
            <CardDescription>
              SQLite w przeglądarce (sql.js) — snapshot w <code className="text-xs bg-slate-100 px-1 rounded">localStorage</code> pod kluczem{' '}
              <code className="text-xs bg-slate-100 px-1 rounded">mizar_db</code>. Reset usuwa bazę; po przeładowaniu strony zostanie utworzona na
              nowo z <code className="text-xs bg-slate-100 px-1 rounded">mizar_data.json</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (
                  !window.confirm(
                    'Wyczyścić lokalną bazę SQL.js? Zostanie odtworzona z mizar_data.json przy następnym wczytaniu strony.'
                  )
                ) {
                  return;
                }
                resetDB();
                toast.success('Baza SQL zresetowana — przeładowanie…');
                window.location.reload();
              }}
            >
              Resetuj bazę SQL.js
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-white shadow-lg mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Dane testowe CRM
            </CardTitle>
            <CardDescription>
              Źródło: plik <code className="text-xs bg-slate-100 px-1 rounded">src/fixtures/mizar_data.json</code> —
              zestaw projektów, kontrahentów i faktur. Import dodaje brakujące rekordy; faktury o tym samym numerze są
              pomijane. Gdy masz nowszą wersję danych (np. <code className="text-xs bg-slate-100 px-1 rounded">mizar_data.json</code>{' '}
              z folderu <code className="text-xs bg-slate-100 px-1 rounded">mizar_data</code> lub Pobrane), nadpisz plik w{' '}
              <code className="text-xs bg-slate-100 px-1 rounded">fixtures</code> i zaimportuj ponownie.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              type="button"
              variant="secondary"
              disabled={seedMutation.isPending}
              onClick={() => seedMutation.mutate()}
              className="gap-2"
            >
              {seedMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              Importuj mizar_data do CRM
            </Button>
            <p className="text-sm text-muted-foreground">
              Kolejność: kontrahenci → obiekty budowy → faktury (z powiązaniami project_id i danymi PLN/NBP z pliku).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}