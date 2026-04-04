import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { AlertCircle, Download, FileSpreadsheet, FileCode, FileType, Hotel, Building2, Wallet, Activity, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { escapeCSV } from '@/components/utils/normalize';
import crmFixtureData from '@/fixtures/crm_fixture_data.json';
import { computeDashboardStats } from '@/lib/dashboard-stats';
import { Progress } from '@/components/ui/progress';
import { AiDashboardAlerts } from '@/components/ai/AiDashboardAlerts';
import { SqlLocalPanel } from '@/components/dashboard/SqlLocalPanel';
import { displayInvoiceSeller } from '@/lib/invoice-schema';

export default function Dashboard() {
  const [selectedYears, setSelectedYears] = useState([]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [selectedQuarters, setSelectedQuarters] = useState([]);
  const [selectedPayer, setSelectedPayer] = useState('all');
  const [selectedContractors, setSelectedContractors] = useState([]);
  const [contractorSearch, setContractorSearch] = useState('');
  const [contractorStatsSearch, setContractorStatsSearch] = useState('');
  const [expandedFilters, setExpandedFilters] = useState({ years: true, quarters: false, months: false, payer: false, contractors: false });
  const [exportFormat, setExportFormat] = useState(null);
  const [exportMethod, setExportMethod] = useState(null);

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => base44.entities.Invoice.list(),
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ['transfers'],
    queryFn: () => base44.entities.Transfer.list(),
  });

  const { data: hotelStays = [] } = useQuery({
    queryKey: ['hotelStays'],
    queryFn: () => base44.entities.HotelStay.list(),
  });

  // Połącz statusy HotelStay z aktualnymi statusami faktur hotelowych
  const hotelStaysWithInvoiceStatus = useMemo(() => {
    return hotelStays.map(stay => {
      if (stay.invoice_id) {
        const relatedInvoice = invoices.find(inv => inv.id === stay.invoice_id);
        if (relatedInvoice) {
          return { ...stay, status: relatedInvoice.status };
        }
      }
      // Sprawdź też po numerze faktury
      if (stay.invoice_number) {
        const relatedInvoice = invoices.find(inv => inv.invoice_number === stay.invoice_number);
        if (relatedInvoice) {
          return { ...stay, status: relatedInvoice.status };
        }
      }
      return stay;
    });
  }, [hotelStays, invoices]);

  const dashStats = useMemo(() => computeDashboardStats(crmFixtureData), []);

  const stats = useMemo(() => {
    const currencies = {};
    const salesCurrencies = {};
    const purchaseInvoices = invoices.filter(inv => inv.invoice_type !== 'sales');
    const salesInvoices = invoices.filter(inv => inv.invoice_type === 'sales');
    
    purchaseInvoices.forEach(inv => {
      const currency = inv.currency || 'PLN';
      if (!currencies[currency]) {
        currencies[currency] = {
          total: 0,
          paid: 0,
          unpaid: 0
        };
      }
      
      currencies[currency].total += inv.amount || 0;
      if (inv.status === 'paid') {
        currencies[currency].paid += inv.amount || 0;
      } else {
        currencies[currency].unpaid += inv.amount || 0;
      }
    });
    
    salesInvoices.forEach(inv => {
      const currency = inv.currency || 'PLN';
      if (!salesCurrencies[currency]) {
        salesCurrencies[currency] = {
          total: 0,
          paid: 0,
          unpaid: 0
        };
      }
      
      salesCurrencies[currency].total += inv.amount || 0;
      if (inv.status === 'paid') {
        salesCurrencies[currency].paid += inv.amount || 0;
      } else {
        salesCurrencies[currency].unpaid += inv.amount || 0;
      }
    });
    
    return {
      total: purchaseInvoices.length,
      unpaid: purchaseInvoices.filter(i => i.status === 'unpaid').length,
      paid: purchaseInvoices.filter(i => i.status === 'paid').length,
      overdue: purchaseInvoices.filter(i => i.status === 'overdue').length,
      currencies,
      salesCurrencies
    };
  }, [invoices]);

  const hotelStats = useMemo(() => {
    const currencies = {};
    
    hotelStaysWithInvoiceStatus.forEach(stay => {
      const currency = stay.currency || 'PLN';
      if (!currencies[currency]) {
        currencies[currency] = {
          total: 0,
          paid: 0,
          unpaid: 0
        };
      }
      
      currencies[currency].total += stay.amount || 0;
      if (stay.status === 'paid') {
        currencies[currency].paid += stay.amount || 0;
      } else {
        currencies[currency].unpaid += stay.amount || 0;
      }
    });
    
    return currencies;
  }, [hotelStays]);

  // Dostępne lata i miesiące
  const availableYears = useMemo(() => {
    const purchaseInvoices = invoices.filter(inv => inv.invoice_type !== 'sales');
    const years = new Set(purchaseInvoices.map(inv => {
      if (!inv.payment_deadline) return null;
      const date = new Date(inv.payment_deadline);
      return !isNaN(date.getTime()) ? date.getFullYear() : null;
    }).filter(Boolean));
    return ['all', ...Array.from(years).sort((a, b) => b - a)];
  }, [invoices]);

  const monthNames = {
    '01': 'Styczeń', '02': 'Luty', '03': 'Marzec', '04': 'Kwiecień',
    '05': 'Maj', '06': 'Czerwiec', '07': 'Lipiec', '08': 'Sierpień',
    '09': 'Wrzesień', '10': 'Październik', '11': 'Listopad', '12': 'Grudzień'
  };

  const availableMonths = useMemo(() => {
    const purchaseInvoices = invoices.filter(inv => inv.invoice_type !== 'sales');
    const months = new Set(purchaseInvoices
      .filter(inv => inv.payment_deadline && !isNaN(new Date(inv.payment_deadline).getTime()))
      .map(inv => format(new Date(inv.payment_deadline), 'MM'))
    );
    return [
      { value: 'all', label: 'Wszystkie' },
      ...Array.from(months).sort().map(m => ({ value: m, label: monthNames[m] }))
    ];
  }, [invoices]);

  const normalizePayer = (payer) => {
    if (!payer) return '';
    
    // Usuń tylko NIPy i znormalizuj białe znaki
    let normalized = payer
      .trim()
      // Usuń NIP z początku lub z dowolnego miejsca
      .replace(/^NIP[:\s]*/i, '')
      .replace(/NIP[:\s]*\d{10}/gi, '')
      .replace(/^\d{10}[\s,;]*/g, '')
      // Normalizuj białe znaki
      .replace(/\s+/g, ' ')
      .trim();
    
    return normalized;
  };
  
  const normalizePayerForComparison = (payer) => {
    if (!payer) return '';
    
    return normalizePayer(payer)
      .toUpperCase()
      // Usuń wszystkie kropki i spacje dla porównania
      .replace(/\./g, '')
      .replace(/\s+/g, '')
      .trim();
  };

  // Wszystkie kontrahenci i płatnicy
   const allContractors = useMemo(() => {
     const purchaseInvoices = invoices.filter(inv => inv.invoice_type !== 'sales');
     return [...new Set(purchaseInvoices.map((inv) => displayInvoiceSeller(inv)).filter(Boolean))].sort();
   }, [invoices]);

   const allPayers = useMemo(() => {
     const purchaseInvoices = invoices.filter(inv => inv.invoice_type !== 'sales');
     const uniquePayers = new Map();
     
     purchaseInvoices.forEach(inv => {
       const normalized = normalizePayer(inv.payer);
       if (normalized && !/^\d{10}$/.test(normalized)) {
         // Użyj znormalizowanej formy jako klucza, ale zachowaj pierwszą oryginalną formę
         const key = normalizePayerForComparison(inv.payer);
         if (!uniquePayers.has(key)) {
           uniquePayers.set(key, normalized);
         }
       }
     });
     
     return Array.from(uniquePayers.values()).sort();
   }, [invoices]);

  // Filtrowane faktury
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (inv.invoice_type === 'sales') return false;
      if (!inv.payment_deadline) return false;

      const date = new Date(inv.payment_deadline);
      if (isNaN(date.getTime())) return false;

      const year = date.getFullYear().toString();
      const month = format(date, 'MM');
      const quarter = Math.floor((date.getMonth() / 3)) + 1;

      // Jeśli nic nie wybrano, pokaż wszystko
      if (selectedYears.length > 0 && !selectedYears.includes(year)) return false;
      if (selectedMonths.length > 0 && !selectedMonths.includes(month)) return false;
      if (selectedQuarters.length > 0 && !selectedQuarters.includes(quarter.toString())) return false;
      if (selectedPayer !== 'all' && normalizePayerForComparison(inv.payer) !== normalizePayerForComparison(selectedPayer)) return false;

      return true;
    });
  }, [invoices, selectedYears, selectedMonths, selectedQuarters, selectedPayer]);

  // Miesięczne wydatki po kontrahentach z walutami
  const monthlyByContractor = useMemo(() => {
    const byMonth = {};
    const currencies = {};

    filteredInvoices.forEach(inv => {
      const supplier = displayInvoiceSeller(inv);
      if (!inv.issue_date || !supplier) return;

      const date = new Date(inv.issue_date);
      if (isNaN(date.getTime())) return;

      const month = format(date, 'yyyy-MM');
      if (!byMonth[month]) byMonth[month] = {};
      
      const contractor = supplier;
      const currency = inv.currency || 'PLN';
      
      // Zapisz walutę dla kontrahenta
      if (!currencies[contractor]) {
        currencies[contractor] = currency;
      }
      
      byMonth[month][contractor] = (byMonth[month][contractor] || 0) + (inv.amount || 0);
    });
    
    return { byMonth, currencies };
  }, [filteredInvoices]);

  const displayContractors = selectedContractors.length > 0 ? selectedContractors : allContractors.slice(0, 5);

  const contractorChartData = useMemo(() => {
    return Object.keys(monthlyByContractor.byMonth)
      .sort()
      .slice(-12)
      .map(month => ({
        month: format(new Date(month + '-01'), 'MM/yyyy'),
        ...monthlyByContractor.byMonth[month]
      }));
  }, [monthlyByContractor]);

  // Dynamiczne kontrahenci - tylko ci, którzy mają dane na wykresie
  const activeContractors = useMemo(() => {
    const active = new Set();
    contractorChartData.forEach(month => {
      displayContractors.forEach(contractor => {
        if (month[contractor]) {
          active.add(contractor);
        }
      });
    });
    return Array.from(active);
  }, [contractorChartData, displayContractors]);
  const contractorColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  const toggleContractor = (contractor) => {
    setSelectedContractors(prev => 
      prev.includes(contractor) 
        ? prev.filter(c => c !== contractor)
        : [...prev, contractor]
    );
  };

  const toggleYear = (year) => {
    setSelectedYears(prev => 
      prev.includes(year) 
        ? prev.filter(y => y !== year)
        : [...prev, year]
    );
  };

  const toggleAllContractors = () => {
    if (selectedContractors.length === allContractors.length) {
      setSelectedContractors([]);
    } else {
      setSelectedContractors(allContractors);
    }
  };

  const filteredDisplayContractors = allContractors.filter(contractor =>
    contractor.toLowerCase().includes(contractorSearch.toLowerCase())
  );

  const toggleMonth = (month) => {
    setSelectedMonths(prev => 
      prev.includes(month) 
        ? prev.filter(m => m !== month)
        : [...prev, month]
    );
  };

  const toggleQuarter = (quarter) => {
    setSelectedQuarters(prev => 
      prev.includes(quarter) 
        ? prev.filter(q => q !== quarter)
        : [...prev, quarter]
    );
  };

  const buildInvoiceCSVRows = (invoiceList) => {
    const headers = [
      'Nr faktury', 'Kontrahent', 'Waluta', 'Kwota', 'Status',
      'Płatnik', 'Data wystawienia', 'Termin płatności', 'Pozycja', 'Kategoria'
    ];
    const rows = invoiceList.map(inv => [
      escapeCSV(inv.invoice_number),
      escapeCSV(displayInvoiceSeller(inv)),
      escapeCSV(inv.currency || 'PLN'),
      inv.amount != null ? inv.amount : 0,                           // liczba
      escapeCSV(inv.status),
      escapeCSV(inv.payer),
      inv.issue_date ? format(new Date(inv.issue_date), 'yyyy-MM-dd') : '',       // data ISO
      inv.payment_deadline ? format(new Date(inv.payment_deadline), 'yyyy-MM-dd') : '', // data ISO
      escapeCSV(inv.position),
      escapeCSV(inv.category)
    ]);
    return [headers, ...rows];
  };

  const exportDashboardToCSV = (collective = true) => {
    const sep = '\n';

    if (collective) {
      // Sekcja 1: Podsumowanie per kontrahent
      const summaryHeaders = ['Kontrahent', 'Waluta', 'Liczba faktur', 'Kwota całkowita', 'Zapłacono', 'Do zapłaty'];
      const summaryRows = contractorStats.map(stat => [
        escapeCSV(stat.name),
        escapeCSV(stat.currency),
        stat.invoiceCount,           // liczba całkowita
        stat.totalAmount,            // liczba
        stat.paidAmount,             // liczba
        stat.remainingAmount         // liczba
      ]);

      // Sekcja 2: Szczegóły faktur pogrupowanych wg kontrahenta
      const groupedRows = [];
      const groups = {};
      filteredInvoices.forEach(inv => {
        const key = `${displayInvoiceSeller(inv)}__${inv.currency || 'PLN'}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(inv);
      });

      const invoiceDetailHeaders = [
        'Nr faktury', 'Kontrahent', 'Waluta', 'Kwota', 'Status',
        'Płatnik', 'Data wystawienia', 'Termin płatności', 'Pozycja', 'Kategoria'
      ];

      Object.entries(groups).forEach(([key, invoiceList]) => {
        const [contractorName, currency] = key.split('__');
        // Nagłówek grupy
        groupedRows.push([`### ${escapeCSV(contractorName)} (${currency}) ###`]);
        groupedRows.push(invoiceDetailHeaders);
        invoiceList.forEach(inv => {
          groupedRows.push([
            escapeCSV(inv.invoice_number),
            escapeCSV(displayInvoiceSeller(inv)),
            escapeCSV(inv.currency || 'PLN'),
            inv.amount != null ? inv.amount : 0,
            escapeCSV(inv.status),
            escapeCSV(inv.payer),
            inv.issue_date ? format(new Date(inv.issue_date), 'yyyy-MM-dd') : '',
            inv.payment_deadline ? format(new Date(inv.payment_deadline), 'yyyy-MM-dd') : '',
            escapeCSV(inv.position),
            escapeCSV(inv.category)
          ]);
        });
        groupedRows.push([]); // pusta linia między grupami
      });

      const csvContent = [
        ['=== PODSUMOWANIE PER KONTRAHENT ==='],
        summaryHeaders,
        ...summaryRows,
        [],
        ['=== SZCZEGÓŁY FAKTUR WEDŁUG KONTRAHENTA ==='],
        ...groupedRows
      ].map(row => row.join(';')).join(sep);

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `dashboard_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      link.click();
    } else {
      // Indywidualne pliki per kontrahent — surowe faktury
      const groups = {};
      filteredInvoices.forEach(inv => {
        const key = `${displayInvoiceSeller(inv)}__${inv.currency || 'PLN'}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(inv);
      });

      Object.entries(groups).forEach(([key, invoiceList]) => {
        const [contractorName, currency] = key.split('__');
        const stat = contractorStats.find(s => s.name === contractorName && s.currency === currency);

        const summaryBlock = [
          ['Kontrahent', escapeCSV(contractorName)],
          ['Waluta', currency],
          ['Liczba faktur', stat ? stat.invoiceCount : invoiceList.length],
          ['Kwota całkowita', stat ? stat.totalAmount : 0],
          ['Zapłacono', stat ? stat.paidAmount : 0],
          ['Do zapłaty', stat ? stat.remainingAmount : 0],
          []
        ];

        const detailRows = buildInvoiceCSVRows(invoiceList);

        const csvContent = [
          ['=== PODSUMOWANIE ==='],
          ...summaryBlock,
          ['=== FAKTURY ==='],
          ...detailRows
        ].map(row => row.join(';')).join(sep);

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `dashboard_${contractorName}_${currency}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
        link.click();
      });
    }
    setExportFormat(null);
    setExportMethod(null);
  };

  const exportDashboardToXML = (collective = true) => {
     const escapeXML = (str) => {
       if (!str) return '';
       return String(str).replace(/[<>&'"]/g, (c) => ({
         '<': '&lt;',
         '>': '&gt;',
         '&': '&amp;',
         "'": '&apos;',
         '"': '&quot;'
       }[c]));
     };

     if (collective) {
       let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<dashboard>\n';
       xml += '  <summary>\n';
       xml += `    <total_invoices>${stats.total}</total_invoices>\n`;
       xml += `    <unpaid>${stats.unpaid}</unpaid>\n`;
       xml += `    <paid>${stats.paid}</paid>\n`;
       xml += '  </summary>\n';
       xml += '  <contractors>\n';
       contractorStats.forEach(stat => {
         xml += '    <contractor>\n';
         xml += `      <name>${escapeXML(stat.name)}</name>\n`;
         xml += `      <currency>${escapeXML(stat.currency)}</currency>\n`;
         xml += `      <invoice_count>${escapeXML(stat.invoiceCount)}</invoice_count>\n`;
         xml += `      <total_amount>${escapeXML(stat.totalAmount.toFixed(2))}</total_amount>\n`;
         xml += `      <paid_amount>${escapeXML(stat.paidAmount.toFixed(2))}</paid_amount>\n`;
         xml += `      <remaining_amount>${escapeXML(stat.remainingAmount.toFixed(2))}</remaining_amount>\n`;
         xml += '    </contractor>\n';
       });
       xml += '  </contractors>\n';
       xml += '</dashboard>';

       const blob = new Blob([xml], { type: 'text/xml;charset=utf-8;' });
       const link = document.createElement('a');
       link.href = URL.createObjectURL(blob);
       link.download = `dashboard_${format(new Date(), 'yyyy-MM-dd')}.xml`;
       link.click();
     } else {
       contractorStats.forEach(stat => {
         let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<contractor>\n';
         xml += `  <name>${escapeXML(stat.name)}</name>\n`;
         xml += `  <currency>${escapeXML(stat.currency)}</currency>\n`;
         xml += `  <invoice_count>${escapeXML(stat.invoiceCount)}</invoice_count>\n`;
         xml += `  <total_amount>${escapeXML(stat.totalAmount.toFixed(2))}</total_amount>\n`;
         xml += `  <paid_amount>${escapeXML(stat.paidAmount.toFixed(2))}</paid_amount>\n`;
         xml += `  <remaining_amount>${escapeXML(stat.remainingAmount.toFixed(2))}</remaining_amount>\n`;
         xml += '</contractor>';

         const blob = new Blob([xml], { type: 'text/xml;charset=utf-8;' });
         const link = document.createElement('a');
         link.href = URL.createObjectURL(blob);
         link.download = `dashboard_${stat.name}_${stat.currency}_${format(new Date(), 'yyyy-MM-dd')}.xml`;
         link.click();
       });
     }
     setExportFormat(null);
     setExportMethod(null);
   };

  const exportDashboardToPDF = async () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageHeight = 280;
    const margin = 15;
    let currentY = margin;
    
    // Selektuj tylko wykresy i karty z wykresami
    const chartSelectors = [
      '.dashboard-content > .mb-8:nth-child(2)', // Miesięczne wydatki
    ];
    
    // Dodaj wykresy dla każdej waluty
    const currencyCharts = document.querySelectorAll('.dashboard-content > .mb-8:not(:nth-child(2)):not(:last-child)');
    
    try {
      // Eksportuj główny wykres
      const mainChart = document.querySelector('.dashboard-content > .mb-8:nth-child(2)');
      if (mainChart) {
        const canvas = await html2canvas(mainChart, {
          scale: 2,
          useCORS: true,
          logging: false,
          windowHeight: mainChart.scrollHeight
        });
        
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = 180;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        if (currentY + imgHeight > pageHeight) {
          doc.addPage();
          currentY = margin;
        }
        
        doc.addImage(imgData, 'PNG', margin, currentY, imgWidth, imgHeight);
        currentY += imgHeight + 15;
      }
      
      // Eksportuj wykresy dla walut
      currencyCharts.forEach(async (chart) => {
        const canvas = await html2canvas(chart, {
          scale: 2,
          useCORS: true,
          logging: false,
          windowHeight: chart.scrollHeight
        });
        
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = 180;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        if (currentY + imgHeight > pageHeight) {
          doc.addPage();
          currentY = margin;
        }
        
        doc.addImage(imgData, 'PNG', margin, currentY, imgWidth, imgHeight);
        currentY += imgHeight + 15;
      });
      
      doc.save(`dashboard_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } catch (error) {
      console.error('Błąd przy eksporcie PDF:', error);
    }
  };

  // Statystyki per kontrahent z walutami
  const contractorStats = useMemo(() => {
    const stats = {};
    
    filteredInvoices.forEach(inv => {
      const contractor = displayInvoiceSeller(inv);
      const currency = inv.currency || 'PLN';
      if (!contractor) return;
      if (inv.invoice_type === 'sales') return;
      
      const key = `${contractor}_${currency}`;
      const amount = parseFloat(inv.amount) || 0;
      
      if (!stats[key]) {
        stats[key] = {
          name: contractor,
          currency: currency,
          invoiceCount: 0,
          totalAmount: 0,
          paidAmount: 0,
          remainingAmount: 0
        };
      }
      
      stats[key].invoiceCount++;
      stats[key].totalAmount += amount;
      
      if (inv.status === 'paid') {
        stats[key].paidAmount += amount;
      } else {
        stats[key].remainingAmount += amount;
      }
    });
    
    return Object.values(stats)
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredInvoices]);

  return (
    <div className="w-full p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">Dashboard operacyjny</h1>
            <p className="text-base text-muted-foreground leading-relaxed max-w-3xl">
              Obiekty sportowe — KPI z danych lokalnych (JSON / SQL.js) oraz moduł faktur
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Download className="mr-2 h-4 w-4" />
                Eksportuj
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => { setExportFormat('csv'); setExportMethod(null); }}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setExportFormat('xml'); setExportMethod(null); }}>
                <FileCode className="mr-2 h-4 w-4" />
                XML
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportDashboardToPDF}>
                <FileType className="mr-2 h-4 w-4" />
                PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {exportFormat && (
          <Dialog open={Boolean(exportFormat)} onOpenChange={() => setExportFormat(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Wybierz format eksportu</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <p className="text-sm text-slate-600">Pobierz plik zbiorczy czy indywidualne pliki dla każdego kontrahenta?</p>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setExportFormat(null)}
                >
                  Anuluj
                </Button>
                <Button
                  onClick={() => {
                    if (exportFormat === 'csv') {
                      exportDashboardToCSV(false);
                    } else if (exportFormat === 'xml') {
                      exportDashboardToXML(false);
                    }
                  }}
                  variant="outline"
                >
                  Pliki indywidualne
                </Button>
                <Button
                  onClick={() => {
                    if (exportFormat === 'csv') {
                      exportDashboardToCSV(true);
                    } else if (exportFormat === 'xml') {
                      exportDashboardToXML(true);
                    }
                  }}
                >
                  Plik zbiorczy
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}
        </div>

        <AiDashboardAlerts />

        <SqlLocalPanel />

        <div className="dashboard-content">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-l-4 border-l-slate-400">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold text-foreground">Aktywne projekty</CardTitle>
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums text-foreground">{dashStats.activeCount}</div>
              <p className="text-sm text-muted-foreground mt-2 leading-snug">Łączna wartość budżetów</p>
              <p className="text-lg font-semibold tabular-nums text-foreground mt-1">
                {dashStats.activeValue.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} PLN
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-primary">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold text-foreground">Należności do odbioru</CardTitle>
              <Wallet className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-primary">
                {dashStats.naleznosciSum.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN
              </div>
              <p className="text-sm text-muted-foreground mt-2 leading-snug">
                {dashStats.naleznosciCount} faktur wystawionych (nieopłaconych)
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-slate-400">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold text-foreground">Cash flow — bieżący miesiąc</CardTitle>
              <Activity className={`h-5 w-5 ${dashStats.cfMc >= 0 ? 'text-[#059669]' : 'text-destructive'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold tabular-nums ${dashStats.cfMc >= 0 ? 'text-[#059669]' : 'text-destructive'}`}>
                {dashStats.cfMc >= 0 ? '+' : ''}
                {dashStats.cfMc.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN
              </div>
              <p className="text-sm text-muted-foreground mt-2 leading-snug">
                Wpływy: {dashStats.wplywyMc.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} · Wydatki:{' '}
                {dashStats.wydatkiMc.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} (wg dat zapłaty, dane lokalne)
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-destructive">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold text-foreground">Faktury przeterminowane</CardTitle>
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums text-destructive">{dashStats.przeterminowaneCount}</div>
              <p className="text-lg font-semibold tabular-nums text-destructive mt-2">
                {dashStats.przeterminowaneSum.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="bg-background shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Cash flow — ostatnie 6 miesięcy</CardTitle>
              <p className="text-sm text-slate-600 leading-relaxed mt-1">
                Netto wg dat zapłaty (wystawione − otrzymane), PLN — dane lokalne
              </p>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dashStats.last6Months} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#475569" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#475569" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v) => [`${Number(v).toLocaleString('pl-PL', { maximumFractionDigits: 0 })} PLN`, 'Netto']}
                    contentStyle={{ background: 'hsl(40 7% 96%)', border: '1px solid #e2e8f0' }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="netto" name="Cash flow netto" stroke="#2563eb" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-background shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Top 5 projektów wg wartości (budżet)</CardTitle>
              <p className="text-sm text-slate-600 leading-relaxed mt-1">
                Wykorzystanie = suma kosztów (FV otrzymanych) / budżet
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {dashStats.top5ByValue.map((row) => (
                <div key={row.id} className="space-y-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-900 line-clamp-2">{row.nazwa}</span>
                    <span className="text-slate-600 shrink-0">{row.pctReal.toFixed(1)}%</span>
                  </div>
                  <Progress value={row.pctBar} className="h-2 bg-slate-200 [&>div]:bg-blue-600" />
                  <div className="flex justify-between text-sm text-slate-600 tabular-nums">
                    <span>
                      {row.spent.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} /{' '}
                      {row.budzet.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} PLN
                    </span>
                    {row.miasto ? <span>{row.miasto}</span> : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-background shadow-lg border border-amber-200/80 mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Alerty budżetu (≥ 80% wykorzystania)
            </CardTitle>
            <p className="text-xs text-slate-500">Koszty z faktur otrzymanych (dane lokalne) vs budżet projektu</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashStats.budgetAlerts.length === 0 ? (
              <p className="text-base text-slate-600 leading-relaxed">Brak projektów przekraczających próg 80%.</p>
            ) : (
              dashStats.budgetAlerts.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm"
                >
                  <span className="font-medium text-slate-900">{a.nazwa}</span>
                  <span className="text-amber-900 font-semibold">
                    {(a.ratio * 100).toFixed(1)}% —{' '}
                    {a.spent.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} /{' '}
                    {a.budzet.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} PLN
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-background shadow-lg mb-8">
          <CardHeader>
            <CardTitle>Miesięczne wydatki według kontrahentów</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 space-y-2">
              <Collapsible open={expandedFilters.years} onOpenChange={(open) => setExpandedFilters({...expandedFilters, years: open})}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 hover:bg-foreground/5 rounded-lg">
                  <ChevronDown className={`h-5 w-5 transition-transform ${expandedFilters.years ? 'rotate-180' : ''}`} />
                  <Label className="font-semibold cursor-pointer">Lata</Label>
                </CollapsibleTrigger>
                <CollapsibleContent className="p-3 pt-0">
                  <div className="flex flex-wrap gap-2">
                    {availableYears.filter(y => y !== 'all').map(year => (
                      <div
                        key={year}
                        onClick={() => toggleYear(year.toString())}
                        className={`px-4 py-2 rounded-lg border-2 transition-all cursor-pointer ${
                          selectedYears.includes(year.toString())
                            ? 'border-blue-600 bg-blue-50 text-blue-900 font-medium'
                            : 'border-slate-200 bg-background text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox 
                            checked={selectedYears.includes(year.toString())} 
                            onCheckedChange={() => {}}
                            className="pointer-events-none"
                          />
                          {year}
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Collapsible open={expandedFilters.quarters} onOpenChange={(open) => setExpandedFilters({...expandedFilters, quarters: open})}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 hover:bg-foreground/5 rounded-lg">
                  <ChevronDown className={`h-5 w-5 transition-transform ${expandedFilters.quarters ? 'rotate-180' : ''}`} />
                  <Label className="font-semibold cursor-pointer">Kwartały</Label>
                </CollapsibleTrigger>
                <CollapsibleContent className="p-3 pt-0">
                  <div className="flex flex-wrap gap-2">
                    {['1', '2', '3', '4'].map(q => (
                      <div
                        key={q}
                        onClick={() => toggleQuarter(q)}
                        className={`px-4 py-2 rounded-lg border-2 transition-all cursor-pointer ${
                          selectedQuarters.includes(q)
                            ? 'border-blue-600 bg-blue-50 text-blue-900 font-medium'
                            : 'border-slate-200 bg-background text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox 
                            checked={selectedQuarters.includes(q)} 
                            onCheckedChange={() => {}}
                            className="pointer-events-none"
                          />
                          Q{q}
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Collapsible open={expandedFilters.months} onOpenChange={(open) => setExpandedFilters({...expandedFilters, months: open})}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 hover:bg-foreground/5 rounded-lg">
                  <ChevronDown className={`h-5 w-5 transition-transform ${expandedFilters.months ? 'rotate-180' : ''}`} />
                  <Label className="font-semibold cursor-pointer">Miesiące</Label>
                </CollapsibleTrigger>
                <CollapsibleContent className="p-3 pt-0">
                  <div className="flex flex-wrap gap-2">
                    {availableMonths.filter(m => m.value !== 'all').map(m => (
                      <div
                        key={m.value}
                        onClick={() => toggleMonth(m.value)}
                        className={`px-4 py-2 rounded-lg border-2 transition-all text-sm cursor-pointer ${
                          selectedMonths.includes(m.value)
                            ? 'border-blue-600 bg-blue-50 text-blue-900 font-medium'
                            : 'border-slate-200 bg-background text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox 
                            checked={selectedMonths.includes(m.value)} 
                            onCheckedChange={() => {}}
                            className="pointer-events-none"
                          />
                          {m.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Collapsible open={expandedFilters.payer} onOpenChange={(open) => setExpandedFilters({...expandedFilters, payer: open})}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 hover:bg-foreground/5 rounded-lg">
                  <ChevronDown className={`h-5 w-5 transition-transform ${expandedFilters.payer ? 'rotate-180' : ''}`} />
                  <Label className="font-semibold cursor-pointer">Płatnik</Label>
                </CollapsibleTrigger>
                <CollapsibleContent className="p-3 pt-0">
                  <Select value={selectedPayer} onValueChange={setSelectedPayer}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Wszyscy płatnicy</SelectItem>
                      {allPayers.map(payer => (
                        <SelectItem key={payer} value={payer}>{payer}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CollapsibleContent>
              </Collapsible>
            </div>

            <Collapsible open={expandedFilters.contractors} onOpenChange={(open) => setExpandedFilters({...expandedFilters, contractors: open})}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 hover:bg-foreground/5 rounded-lg">
                <ChevronDown className={`h-5 w-5 transition-transform ${expandedFilters.contractors ? 'rotate-180' : ''}`} />
                <Label className="font-semibold cursor-pointer">Porównaj kontrahentów (wybierz do 8)</Label>
              </CollapsibleTrigger>
              <CollapsibleContent className="p-3 pt-0">
                <div className="mb-3 space-y-2">
                  <Input
                    placeholder="Szukaj kontrahenta..."
                    value={contractorSearch}
                    onChange={(e) => setContractorSearch(e.target.value)}
                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setSelectedContractors(allContractors)}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      Wybierz wszystko
                    </Button>
                    <Button
                      onClick={() => setSelectedContractors([])}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      Odznacz wszystko
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-48 overflow-y-auto p-2 border rounded-lg bg-background">
                  {filteredDisplayContractors.map(contractor => (
                    <div key={contractor} className="flex items-center space-x-2">
                      <Checkbox
                        id={contractor}
                        checked={selectedContractors.includes(contractor)}
                        onCheckedChange={() => toggleContractor(contractor)}
                        disabled={!selectedContractors.includes(contractor) && selectedContractors.length >= 8}
                      />
                      <label
                        htmlFor={contractor}
                        className="text-sm font-medium leading-none cursor-pointer"
                      >
                        {contractor}
                      </label>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={contractorChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip 
                  formatter={(value, name) => {
                    const currency = monthlyByContractor.currencies[name] || 'PLN';
                    return [
                      value.toLocaleString('pl-PL', { minimumFractionDigits: 2 }) + ' ' + currency,
                      name
                    ];
                  }}
                />
                {activeContractors.length > 0 && <Legend />}
                {activeContractors.map((contractor, idx) => {
                  const contractorIndex = displayContractors.indexOf(contractor);
                  return (
                    <Bar 
                      key={contractor} 
                      dataKey={contractor} 
                      fill={contractorColors[contractorIndex % contractorColors.length]} 
                    />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {['PLN', 'EUR'].map((currency) => {
          const amounts = stats.currencies[currency] || { total: 0, paid: 0, unpaid: 0 };
          const hotelAmounts = hotelStats[currency];
          const totalWithHotels = (amounts.total || 0) + (hotelAmounts?.total || 0);
          const paidWithHotels = (amounts.paid || 0) + (hotelAmounts?.paid || 0);
          const unpaidWithHotels = (amounts.unpaid || 0) + (hotelAmounts?.unpaid || 0);

          return (
          <div key={currency} className="mb-8">
            <h3 className="text-xl font-bold text-foreground mb-4">Przegląd płatności - {currency}</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-background shadow-lg">
                <CardHeader>
                  <CardTitle>Przegląd płatności ({currency})</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={[
                      { name: 'Kwota całkowita', value: totalWithHotels },
                      { name: 'Zapłacono', value: paidWithHotels },
                      { name: 'Do zapłaty', value: unpaidWithHotels }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip 
                        formatter={(value) => value.toLocaleString('pl-PL', { minimumFractionDigits: 2 }) + ' ' + currency}
                        labelFormatter={(label) => label}
                      />
                      <Legend />
                      <Bar dataKey="value" fill="#3b82f6" name="Kwota" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-background shadow-lg">
                <CardHeader>
                  <CardTitle>Podział płatności ({currency})</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Zapłacono', value: paidWithHotels },
                          { name: 'Do zapłaty', value: unpaidWithHotels }
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry) => `${entry.name}: ${entry.value.toLocaleString('pl-PL', { minimumFractionDigits: 0 })} ${currency}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Tooltip formatter={(value) => value.toLocaleString('pl-PL', { minimumFractionDigits: 2 }) + ' ' + currency} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>
          );
        })}

        {Object.keys(hotelStats).length > 0 && (
          <div className="mb-8">
            <h3 className="text-xl font-bold text-foreground mb-4">Przegląd płatności hoteli</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {Object.entries(hotelStats).map(([currency, amounts]) => (
                <div key={currency}>
                  <Card className="bg-background shadow-lg">
                    <CardHeader>
                      <CardTitle>Przegląd płatności hoteli ({currency})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={[
                          { name: 'Kwota całkowita', value: amounts.total },
                          { name: 'Zapłacono', value: amounts.paid },
                          { name: 'Do zapłaty', value: amounts.unpaid }
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip 
                            formatter={(value) => value.toLocaleString('pl-PL', { minimumFractionDigits: 2 }) + ' ' + currency}
                            labelFormatter={(label) => label}
                          />
                          <Legend />
                          <Bar dataKey="value" fill="#ec4899" name="Kwota" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        )}

        <Card className="bg-background shadow-lg mb-8">
          <CardHeader>
            <CardTitle>Statystyki kontrahentów</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Input
                placeholder="Szukaj kontrahenta..."
                value={contractorStatsSearch}
                onChange={(e) => setContractorStatsSearch(e.target.value)}
                className="max-w-md"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 text-sm font-semibold text-slate-600">Kontrahent</th>
                    <th className="text-center py-3 px-2 text-sm font-semibold text-slate-600">Ilość faktur</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-slate-600">Kwota całkowita</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-slate-600">Zapłacono</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-slate-600">Do zapłaty</th>
                  </tr>
                </thead>
                <tbody>
                  {contractorStats
                    .filter(stat => stat.name.toLowerCase().includes(contractorStatsSearch.toLowerCase()))
                    .map((stat, idx) => (
                    <tr key={`${stat.name}_${stat.currency}_${idx}`} className="border-b hover:bg-foreground/5">
                      <td className="py-3 px-2 font-medium text-slate-900">
                        {stat.name}
                        <span className="ml-2 text-xs text-slate-500">({stat.currency})</span>
                      </td>
                      <td className="py-3 px-2 text-center text-slate-700">{stat.invoiceCount}</td>
                      <td className="py-3 px-2 text-right font-semibold text-slate-900">
                        {stat.totalAmount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {stat.currency}
                      </td>
                      <td className="py-3 px-2 text-right text-green-600 font-medium">
                        {stat.paidAmount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {stat.currency}
                      </td>
                      <td className="py-3 px-2 text-right text-red-600 font-medium">
                        {stat.remainingAmount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {stat.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="bg-background shadow-lg">
            <CardHeader>
              <CardTitle>Szybkie akcje</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link to={createPageUrl('Upload')}>
                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-medium transition-colors">
                  📄 Przetwórz nową fakturę
                </button>
              </Link>
              <Link to={createPageUrl('Invoices')}>
                <button className="w-full bg-slate-600 hover:bg-slate-700 text-white py-3 px-4 rounded-lg font-medium transition-colors">
                  📋 Zobacz wszystkie faktury
                </button>
              </Link>
              <Link to={createPageUrl('Transfers')}>
                <button className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-lg font-medium transition-colors">
                  💳 Potwierdzenia płatności
                </button>
              </Link>
              <Link to={createPageUrl('Reports')}>
                <button className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 px-4 rounded-lg font-medium transition-colors">
                  📊 Raporty i zestawienia
                </button>
              </Link>
            </CardContent>
          </Card>

          <Card className="bg-background shadow-lg">
            <CardHeader>
              <CardTitle>Ostatnie faktury</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {invoices.slice(0, 5).map(inv => (
                  <div key={inv.id} className="flex justify-between items-center border-b pb-2">
                    <div>
                      <p className="font-medium text-slate-900">{inv.invoice_number}</p>
                      <p className="text-sm text-slate-500">{displayInvoiceSeller(inv)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">{inv.amount?.toFixed(2)} {inv.currency}</p>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        inv.status === 'paid' ? 'bg-green-100 text-green-800' :
                        inv.status === 'overdue' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {inv.status === 'paid' ? 'Opłacono' : 
                         inv.status === 'overdue' ? 'Przeterminowano' : 'Nieopłacono'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-background shadow-lg mb-8">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Ostatnie pobyty hotelowe</CardTitle>
            <Hotel className="h-5 w-5 text-pink-500" />
          </CardHeader>
          <CardContent>
            {hotelStays.length === 0 ? (
              <p className="text-slate-500 text-center py-4">Brak pobytów hotelowych</p>
            ) : (
              <div className="space-y-3">
                {hotelStaysWithInvoiceStatus.slice(0, 8).map(stay => (
                  <div key={stay.id} className="flex justify-between items-center border-b pb-2">
                    <div>
                      <p className="font-medium text-slate-900">{stay.hotel_name}</p>
                      <p className="text-sm text-slate-500">
                        {stay.city} • {stay.persons_count} osób
                        {stay.check_in && stay.check_in.toString().length > 0 && ` • ${new Date(stay.check_in).toLocaleDateString('pl-PL')}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">
                        {stay.amount?.toFixed(2)} {stay.currency || 'PLN'}
                      </p>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        stay.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {stay.status === 'paid' ? 'Opłacono' : 'Nieopłacono'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}