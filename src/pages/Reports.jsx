import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileCode, FileType, Trash2, Sparkles } from 'lucide-react';
import { AiReportModal } from '@/components/ai/AiReportModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Line } from 'recharts';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const normalizeContractorName = (name) => {
  if (!name) return name;
  return name
    .replace(/[-–]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.]+(?=\s|$)/g, '') // Usuń kropki na końcu lub przed spacją
    .trim()
    .toUpperCase();
};

const formatNumber = (num) => {
  if (!num && num !== 0) return '0,00';
  return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').replace('.', ',');
};

const normalizePayer = (payer) => {
   if (!payer) return payer;

   return payer
     .toUpperCase()
     .replace(/SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ/g, 'SP. Z O.O.')
     .replace(/SP\. Z O\.O\. SP\. K\.|SP Z O\.O SP\.K\.|SP\. Z O\.O SP\.K\./g, 'SP. Z O.O. SP.K.')
     .replace(/\s+/g, ' ')
     .trim();
 };

const linearRegression = (data, valueKey = 'total') => {
  const n = data.length;
  if (n < 2) return null;

  const x = data.map((_, i) => i);
  const y = data.map(d => d[valueKey]);

  const xMean = x.reduce((a, b) => a + b) / n;
  const yMean = y.reduce((a, b) => a + b) / n;

  const numerator = x.reduce((sum, xi, i) => sum + (xi - xMean) * (y[i] - yMean), 0);
  const denominator = x.reduce((sum, xi) => sum + Math.pow(xi - xMean, 2), 0);

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;

  return { slope, intercept };
};

const generateForecast = (data, periods = 3, valueKey = 'total') => {
  const regression = linearRegression(data, valueKey);
  if (!regression) return [];

  const lastIndex = data.length - 1;
  const forecast = [];

  for (let i = 1; i <= periods; i++) {
    const x = lastIndex + i;
    const predictedValue = Math.max(0, regression.slope * x + regression.intercept);
    forecast.push(predictedValue);
  }

  return forecast;
};

export default function Reports() {
   const [activeTab, setActiveTab] = useState('contractors');
   const [selectedPayer, setSelectedPayer] = useState('all');
   const [selectedSalesPayer, setSelectedSalesPayer] = useState('all');
   const [exportFormat, setExportFormat] = useState(null);
   const [exportMethod, setExportMethod] = useState(null);
   const [selectedInvoices, setSelectedInvoices] = useState([]);
   const [aiReportOpen, setAiReportOpen] = useState(false);
   
   const queryClient = useQueryClient();

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => base44.entities.Invoice.list(),
  });

  const { data: hotelStays = [] } = useQuery({
    queryKey: ['hotelStays'],
    queryFn: () => base44.entities.HotelStay.list(),
  });

  const deleteInvoicesMutation = useMutation({
    mutationFn: async (invoiceIds) => {
      await Promise.all(invoiceIds.map(id => base44.entities.Invoice.delete(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['invoices']);
      setSelectedInvoices([]);
    },
  });

  const normalizedInvoices = invoices.map(inv => ({
    ...inv,
    contractor_name: normalizeContractorName(inv.contractor_name)
  }));

  const allPayers = [...new Set(invoices.map(inv => normalizePayer(inv.payer)).filter(Boolean))].sort();

  const filteredInvoices = selectedPayer === 'all' 
    ? normalizedInvoices.filter(inv => inv.invoice_type !== 'sales')
    : normalizedInvoices.filter(inv => inv.invoice_type !== 'sales' && normalizePayer(inv.payer) === selectedPayer);

  const contractorSummary = filteredInvoices.reduce((acc, inv) => {
    const name = inv.contractor_name || 'Nieznany';
    if (!acc[name]) {
      acc[name] = { name, total: 0, count: 0, currency: inv.currency };
    }
    acc[name].total += inv.amount || 0;
    acc[name].count += 1;
    return acc;
  }, {});

  const contractorData = Object.values(contractorSummary).sort((a, b) => b.total - a.total);

  const monthlyDataWithHotels = useMemo(() => {
    const invoiceData = filteredInvoices.reduce((acc, inv) => {
      if (!inv.issue_date) return acc;
      const date = new Date(inv.issue_date);
      if (isNaN(date.getTime())) return acc;
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const currency = inv.currency || 'PLN';
      const contractor = inv.contractor_name || 'Nieznany';
      const key = `${month}_${currency}`;
      if (!acc[key]) {
        acc[key] = { month, currency, total: 0, contractors: {} };
      }
      acc[key].total += inv.amount || 0;
      acc[key].contractors[contractor] = (acc[key].contractors[contractor] || 0) + (inv.amount || 0);
      return acc;
    }, {});

    // Dodaj dane hotelowe
    hotelStays.forEach(stay => {
      if (!stay.check_in) return;
      const date = new Date(stay.check_in);
      if (isNaN(date.getTime())) return;
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const currency = stay.currency || 'PLN';
      const key = `${month}_${currency}`;
      if (!invoiceData[key]) {
        invoiceData[key] = { month, currency, total: 0, contractors: {} };
      }
      invoiceData[key].total += stay.amount || 0;
    });

    return invoiceData;
  }, [filteredInvoices, hotelStays]);

  const monthlyData = monthlyDataWithHotels;
  
  const oldMonthlyData = filteredInvoices.reduce((acc, inv) => {
    if (!inv.issue_date) return acc;
    const date = new Date(inv.issue_date);
    if (isNaN(date.getTime())) return acc;
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const currency = inv.currency || 'PLN';
    const contractor = inv.contractor_name || 'Nieznany';
    const key = `${month}_${currency}`;
    if (!acc[key]) {
      acc[key] = { month, currency, total: 0, contractors: {} };
    }
    acc[key].total += inv.amount || 0;
    acc[key].contractors[contractor] = (acc[key].contractors[contractor] || 0) + (inv.amount || 0);
    return acc;
  }, {});

  const monthlyChartData = Object.values(monthlyData).sort((a, b) => {
    const monthCompare = a.month.localeCompare(b.month);
    return monthCompare !== 0 ? monthCompare : a.currency.localeCompare(b.currency);
  });

  const statusData = [
    { name: 'Opłacone', value: filteredInvoices.filter(i => i.status === 'paid').length },
    { name: 'Nieopłacone', value: filteredInvoices.filter(i => i.status === 'unpaid').length },
    { name: 'Przeterminowane', value: filteredInvoices.filter(i => i.status === 'overdue').length },
  ];

  const COLORS = ['#10b981', '#f59e0b', '#ef4444'];

  // Dane roczne z kontrahentami
  const yearlyData = filteredInvoices.reduce((acc, inv) => {
    if (!inv.issue_date) return acc;
    const date = new Date(inv.issue_date);
    if (isNaN(date.getTime())) return acc;
    const year = date.getFullYear();
    const currency = inv.currency || 'PLN';
    const contractor = inv.contractor_name || 'Nieznany';
    const key = `${year}_${currency}`;
    if (!acc[key]) {
      acc[key] = { year: year.toString(), currency, total: 0, count: 0, contractors: {} };
    }
    acc[key].total += inv.amount || 0;
    acc[key].count += 1;
    acc[key].contractors[contractor] = (acc[key].contractors[contractor] || 0) + (inv.amount || 0);
    return acc;
  }, {});

  const yearlyChartData = Object.values(yearlyData).sort((a, b) => {
    const yearCompare = a.year.localeCompare(b.year);
    return yearCompare !== 0 ? yearCompare : a.currency.localeCompare(b.currency);
  });

  // Dane kwartalne
  const quarterlyData = filteredInvoices.reduce((acc, inv) => {
    if (!inv.payment_deadline) return acc;
    const date = new Date(inv.payment_deadline);
    if (isNaN(date.getTime())) return acc;
    const year = date.getFullYear();
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    const currency = inv.currency || 'PLN';
    const period = `${year}-Q${quarter}`;
    const key = `${period}_${currency}`;
    const contractor = inv.contractor_name || 'Nieznany';
    if (!acc[key]) {
      acc[key] = { period, currency, total: 0, count: 0, contractors: {} };
    }
    acc[key].total += inv.amount || 0;
    acc[key].count += 1;
    acc[key].contractors[contractor] = (acc[key].contractors[contractor] || 0) + (inv.amount || 0);
    return acc;
  }, {});

  const quarterlyChartData = Object.values(quarterlyData).sort((a, b) => {
    const periodCompare = a.period.localeCompare(b.period);
    return periodCompare !== 0 ? periodCompare : a.currency.localeCompare(b.currency);
  });

  // Dane hotelowe - miesięczne
  const hotelMonthlyData = hotelStays.reduce((acc, stay) => {
    if (!stay.check_in) return acc;
    const date = new Date(stay.check_in);
    if (isNaN(date.getTime())) return acc;
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[month]) {
      acc[month] = { month, total: 0, count: 0, persons: 0 };
    }
    acc[month].total += stay.amount || 0;
    acc[month].count += 1;
    acc[month].persons += stay.persons_count || 0;
    return acc;
  }, {});

  const hotelMonthlyChartData = Object.values(hotelMonthlyData).sort((a, b) => a.month.localeCompare(b.month));

  // Dane hotelowe - według hoteli
  const hotelSummary = hotelStays.reduce((acc, stay) => {
    const name = stay.hotel_name || 'Nieznany';
    if (!acc[name]) {
      acc[name] = { name, total: 0, count: 0, persons: 0 };
    }
    acc[name].total += stay.amount || 0;
    acc[name].count += 1;
    acc[name].persons += stay.persons_count || 0;
    return acc;
  }, {});

  const hotelData = Object.values(hotelSummary).sort((a, b) => b.total - a.total);

  // Dane sprzedażowe - rozbite na waluty
  const salesInvoices = normalizedInvoices.filter(inv => inv.invoice_type === 'sales' && (selectedSalesPayer === 'all' || normalizePayer(inv.payer) === selectedSalesPayer));

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedInvoices(salesInvoices.map(inv => inv.id));
    } else {
      setSelectedInvoices([]);
    }
  };

  const handleSelectInvoice = (invoiceId, checked) => {
    if (checked) {
      setSelectedInvoices([...selectedInvoices, invoiceId]);
    } else {
      setSelectedInvoices(selectedInvoices.filter(id => id !== invoiceId));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedInvoices.length === 0) return;
    if (confirm(`Czy na pewno chcesz usunąć ${selectedInvoices.length} faktur?`)) {
      deleteInvoicesMutation.mutate(selectedInvoices);
    }
  };

  const salesMonthlyData = salesInvoices.reduce((acc, inv) => {
    if (!inv.issue_date) return acc;
    const date = new Date(inv.issue_date);
    if (isNaN(date.getTime())) return acc;
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const currency = inv.currency || 'PLN';
    const key = `${month}_${currency}`;
    if (!acc[key]) {
      acc[key] = { month, currency, total: 0 };
    }
    acc[key].total += inv.amount || 0;
    return acc;
  }, {});

  const salesMonthlyChartDataPLN = Object.values(salesMonthlyData).filter(d => d.currency === 'PLN').sort((a, b) => a.month.localeCompare(b.month));
  const salesMonthlyChartDataEUR = Object.values(salesMonthlyData).filter(d => d.currency === 'EUR').sort((a, b) => a.month.localeCompare(b.month));

  const salesYearlyData = salesInvoices.reduce((acc, inv) => {
    if (!inv.issue_date) return acc;
    const date = new Date(inv.issue_date);
    if (isNaN(date.getTime())) return acc;
    const year = date.getFullYear();
    const currency = inv.currency || 'PLN';
    const key = `${year}_${currency}`;
    if (!acc[key]) {
      acc[key] = { year: year.toString(), currency, total: 0, count: 0 };
    }
    acc[key].total += inv.amount || 0;
    acc[key].count += 1;
    return acc;
  }, {});

  const salesYearlyChartDataPLN = Object.values(salesYearlyData).filter(d => d.currency === 'PLN').sort((a, b) => a.year.localeCompare(b.year));
  const salesYearlyChartDataEUR = Object.values(salesYearlyData).filter(d => d.currency === 'EUR').sort((a, b) => a.year.localeCompare(b.year));

  const salesQuarterlyData = salesInvoices.reduce((acc, inv) => {
    if (!inv.payment_deadline) return acc;
    const date = new Date(inv.payment_deadline);
    if (isNaN(date.getTime())) return acc;
    const year = date.getFullYear();
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    const currency = inv.currency || 'PLN';
    const period = `${year}-Q${quarter}`;
    const key = `${period}_${currency}`;
    if (!acc[key]) {
      acc[key] = { period, currency, total: 0, count: 0 };
    }
    acc[key].total += inv.amount || 0;
    acc[key].count += 1;
    return acc;
  }, {});

  const salesQuarterlyChartDataPLN = Object.values(salesQuarterlyData).filter(d => d.currency === 'PLN').sort((a, b) => a.period.localeCompare(b.period));
  const salesQuarterlyChartDataEUR = Object.values(salesQuarterlyData).filter(d => d.currency === 'EUR').sort((a, b) => a.period.localeCompare(b.period));

  const exportToCSV = (collective = true) => {
    if (!collective) {
      if (activeTab === 'contractors') {
        contractorData.forEach(item => {
          const csvContent = 'Kontrahent,Liczba faktur,Suma,Waluta\n' + 
            `${item.name},${item.count},${item.total.toFixed(2)},${item.currency}`;
          const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `kontrahent_${item.name}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
          link.click();
        });
      }
      return;
    }

    let headers, rows;

    if (activeTab === 'contractors') {
      headers = ['Kontrahent', 'Liczba faktur', 'Suma', 'Waluta'];
      rows = contractorData.map(item => [item.name, item.count, item.total.toFixed(2), item.currency]);
    } else if (activeTab === 'monthly') {
      headers = ['Miesiąc', 'Suma'];
      rows = monthlyChartData.map(item => [item.month, item.total.toFixed(2)]);
    } else if (activeTab === 'yearly') {
      headers = ['Rok', 'Liczba faktur', 'Suma'];
      rows = yearlyChartData.map(item => [item.year, item.count, item.total.toFixed(2)]);
    } else {
      headers = ['Status', 'Liczba'];
      rows = statusData.map(item => [item.name, item.value]);
    }

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `raport_${activeTab}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const exportToXML = (collective = true) => {
    if (!collective) {
      if (activeTab === 'contractors') {
        contractorData.forEach(item => {
          let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<contractor>\n';
          xml += `  <name>${item.name}</name>\n`;
          xml += `  <count>${item.count}</count>\n`;
          xml += `  <total>${item.total.toFixed(2)}</total>\n`;
          xml += `  <currency>${item.currency}</currency>\n`;
          xml += '</contractor>';
          const blob = new Blob([xml], { type: 'text/xml;charset=utf-8;' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `kontrahent_${item.name}_${format(new Date(), 'yyyy-MM-dd')}.xml`;
          link.click();
        });
      }
      return;
    }

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';

     if (activeTab === 'contractors') {
       xml += '<contractors>\n';
       contractorData.forEach(item => {
         xml += '  <contractor>\n';
         xml += `    <name>${item.name}</name>\n`;
         xml += `    <count>${item.count}</count>\n`;
         xml += `    <total>${item.total.toFixed(2)}</total>\n`;
         xml += `    <currency>${item.currency}</currency>\n`;
         xml += '  </contractor>\n';
       });
       xml += '</contractors>';
     } else if (activeTab === 'monthly') {
       xml += '<monthly>\n';
       monthlyChartData.forEach(item => {
         xml += '  <month>\n';
         xml += `    <period>${item.month}</period>\n`;
         xml += `    <total>${item.total.toFixed(2)}</total>\n`;
         xml += '  </month>\n';
       });
       xml += '</monthly>';
     } else if (activeTab === 'yearly') {
       xml += '<yearly>\n';
       yearlyChartData.forEach(item => {
         xml += '  <year>\n';
         xml += `    <period>${item.year}</period>\n`;
         xml += `    <count>${item.count}</count>\n`;
         xml += `    <total>${item.total.toFixed(2)}</total>\n`;
         xml += '  </year>\n';
       });
       xml += '</yearly>';
     } else {
       xml += '<status>\n';
       statusData.forEach(item => {
         xml += '  <item>\n';
         xml += `    <name>${item.name}</name>\n`;
         xml += `    <value>${item.value}</value>\n`;
         xml += '  </item>\n';
       });
       xml += '</status>';
     }

     const blob = new Blob([xml], { type: 'text/xml;charset=utf-8;' });
     const link = document.createElement('a');
     link.href = URL.createObjectURL(blob);
     link.download = `raport_${activeTab}_${format(new Date(), 'yyyy-MM-dd')}.xml`;
     link.click();
   };

  const exportToPDF = async () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageHeight = 280;
    const margin = 15;
    let currentY = 20;
    
    doc.setFontSize(18);
    doc.text(`Raport - ${activeTab}`, margin, currentY);
    currentY += 15;
    
    const tabContent = document.querySelector(`[data-state="active"]`);
    if (tabContent) {
      const sections = tabContent.querySelectorAll('[class*="Card"]');
      
      for (const section of sections) {
        const canvas = await html2canvas(section, {
          scale: 2,
          useCORS: true,
          logging: false,
          windowHeight: section.scrollHeight
        });
        
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = 180;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        if (currentY + imgHeight > pageHeight) {
          doc.addPage();
          currentY = margin;
        }
        
        doc.addImage(imgData, 'PNG', margin, currentY, imgWidth, imgHeight);
        currentY += imgHeight + 10;
      }
    }
    
    doc.save(`raport_${activeTab}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="w-full p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2">Raporty i zestawienia</h1>
              <p className="text-muted-foreground">Analizy i podsumowania faktur</p>
            </div>
          <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-amber-500/40 bg-amber-50/50 hover:bg-amber-100/80 dark:bg-amber-950/20"
            onClick={() => setAiReportOpen(true)}
          >
            <Sparkles className="mr-2 h-4 w-4 text-amber-600" />
            Generuj raport AI
          </Button>
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
               <DropdownMenuItem onClick={exportToPDF}>
                 <FileType className="mr-2 h-4 w-4" />
                 PDF
               </DropdownMenuItem>
             </DropdownMenuContent>
          </DropdownMenu>
          </div>
          </div>
          <div className="max-w-xs">
            <Label className="mb-2 block">Filtruj po płatniku</Label>
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
          </div>
          </div>

          <Dialog open={!!exportFormat} onOpenChange={(open) => { if (!open) setExportFormat(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Jak chcesz pobrać dane?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <Button 
                onClick={() => { setExportMethod('collective'); if (exportFormat === 'csv') exportToCSV(true); else if (exportFormat === 'xml') exportToXML(true); setExportFormat(null); }}
                variant="outline" 
                className="w-full text-left"
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Plik zbiorczy
              </Button>
              <Button 
                onClick={() => { setExportMethod('individual'); if (exportFormat === 'csv') exportToCSV(false); else if (exportFormat === 'xml') exportToXML(false); setExportFormat(null); }}
                variant="outline" 
                className="w-full text-left"
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Pliki pojedyncze
              </Button>
            </div>
          </DialogContent>
          </Dialog>

          <Tabs defaultValue="contractors" className="space-y-6" onValueChange={setActiveTab}>
          <TabsList className="bg-background">
            <TabsTrigger value="contractors">Kontrahenci</TabsTrigger>
            <TabsTrigger value="sales">Faktury sprzedażowe</TabsTrigger>
            <TabsTrigger value="sales-monthly">Sprzedaż - Miesięczne</TabsTrigger>
            <TabsTrigger value="monthly">Miesięczne</TabsTrigger>
            <TabsTrigger value="sales-yearly">Sprzedaż - Roczne</TabsTrigger>
            <TabsTrigger value="sales-quarterly">Sprzedaż - Kwartalne</TabsTrigger>
            <TabsTrigger value="quarterly">Kwartalne</TabsTrigger>
            <TabsTrigger value="yearly">Roczne</TabsTrigger>
            <TabsTrigger value="forecast">Prognoza</TabsTrigger>
            <TabsTrigger value="hotels">Hotele</TabsTrigger>
            <TabsTrigger value="status">Status</TabsTrigger>
          </TabsList>

          <TabsContent value="contractors" className="space-y-6">
            <Card className="bg-background shadow-lg">
              <CardHeader>
                <CardTitle>Podsumowanie według kontrahentów</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kontrahent</TableHead>
                        <TableHead>Liczba faktur</TableHead>
                        <TableHead>Suma</TableHead>
                        <TableHead>Waluta</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contractorData.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>{item.count}</TableCell>
                          <TableCell className="font-semibold">{item.total.toFixed(2)}</TableCell>
                          <TableCell>{item.currency}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sales" className="space-y-6">
            <Card className="bg-background shadow-lg mb-6">
              <CardHeader>
                <CardTitle>Filtry</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-w-xs">
                  <Label className="mb-2 block">Filtruj po płatniku</Label>
                  <Select value={selectedSalesPayer} onValueChange={setSelectedSalesPayer}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Wszyscy płatnicy</SelectItem>
                      {[...new Set(normalizedInvoices.filter(inv => inv.invoice_type === 'sales').map(inv => normalizePayer(inv.payer)).filter(Boolean))].sort().map(payer => (
                        <SelectItem key={payer} value={payer}>{payer}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-background shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Faktury sprzedażowe</CardTitle>
                {selectedInvoices.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteSelected}
                    disabled={deleteInvoicesMutation.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Usuń wybrane ({selectedInvoices.length})
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={salesInvoices.length > 0 && selectedInvoices.length === salesInvoices.length}
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Numer faktury</TableHead>
                        <TableHead>Nabywca</TableHead>
                        <TableHead>Płatnik</TableHead>
                        <TableHead>Data wystawienia</TableHead>
                        <TableHead>Kwota</TableHead>
                        <TableHead>Waluta</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesInvoices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan="8" className="text-center text-slate-500">
                            Brak faktur sprzedażowych
                          </TableCell>
                        </TableRow>
                      ) : (
                        salesInvoices.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedInvoices.includes(item.id)}
                                onCheckedChange={(checked) => handleSelectInvoice(item.id, checked)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{item.invoice_number}</TableCell>
                            <TableCell>{item.contractor_name}</TableCell>
                            <TableCell className="text-slate-600 text-sm">{normalizePayer(item.payer)}</TableCell>
                            <TableCell>{item.issue_date}</TableCell>
                            <TableCell className="font-semibold">{item.amount.toFixed(2)}</TableCell>
                            <TableCell>{item.currency}</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded text-sm ${
                                item.status === 'paid' ? 'bg-green-100 text-green-800' :
                                item.status === 'overdue' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {item.status === 'paid' ? 'Zapłacona' : item.status === 'overdue' ? 'Przeterminowana' : 'Nieopłacona'}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                </CardContent>
                </Card>
                <Card className="bg-background shadow-lg">
                <CardHeader>
                <CardTitle>Przychody sprzedażowe miesięczne {salesMonthlyChartDataPLN.length > 0 && salesMonthlyChartDataEUR.length > 0 ? '(PLN i EUR)' : salesMonthlyChartDataPLN.length > 0 ? '(PLN)' : '(EUR)'}</CardTitle>
                </CardHeader>
                <CardContent>
                {salesMonthlyChartDataPLN.length === 0 && salesMonthlyChartDataEUR.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">Brak danych</p>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <ComposedChart data={Object.values(salesMonthlyData).sort((a, b) => a.month.localeCompare(b.month))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      {salesMonthlyChartDataPLN.length > 0 && <YAxis yAxisId="left" label={{ value: 'PLN', angle: -90, position: 'insideLeft' }} />}
                      {salesMonthlyChartDataEUR.length > 0 && <YAxis yAxisId={salesMonthlyChartDataPLN.length > 0 ? "right" : "left"} orientation={salesMonthlyChartDataPLN.length > 0 ? "right" : "left"} label={{ value: 'EUR', angle: salesMonthlyChartDataPLN.length > 0 ? 90 : -90, position: salesMonthlyChartDataPLN.length > 0 ? 'insideRight' : 'insideLeft' }} />}
                      <Tooltip content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-background p-2 border rounded shadow-lg text-xs">
                              <p className="font-semibold">{data.month}</p>
                              <p>{payload[0].name}: {formatNumber(data.total)}</p>
                            </div>
                          );
                        }
                        return null;
                      }} />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      {salesMonthlyChartDataPLN.length > 0 && <Line yAxisId="left" type="monotone" dataKey="total" stroke="#8b5cf6" strokeWidth={2} name="Sprzedaż PLN" data={salesMonthlyChartDataPLN} />}
                      {salesMonthlyChartDataEUR.length > 0 && <Line yAxisId={salesMonthlyChartDataPLN.length > 0 ? "right" : "left"} type="monotone" dataKey="total" stroke="#06b6d4" strokeWidth={2} name="Sprzedaż EUR" data={salesMonthlyChartDataEUR} />}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
                </CardContent>
                </Card>
          </TabsContent>

          <TabsContent value="sales-monthly" className="space-y-6">
            <Card className="bg-background shadow-lg">
              <CardHeader>
                <CardTitle>Przychody sprzedażowe miesięczne {salesMonthlyChartDataPLN.length > 0 && salesMonthlyChartDataEUR.length > 0 ? '(PLN i EUR)' : salesMonthlyChartDataPLN.length > 0 ? '(PLN)' : '(EUR)'}</CardTitle>
              </CardHeader>
              <CardContent>
                {salesMonthlyChartDataPLN.length === 0 && salesMonthlyChartDataEUR.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">Brak danych</p>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <ComposedChart data={Object.values(salesMonthlyData).sort((a, b) => a.month.localeCompare(b.month))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      {salesMonthlyChartDataPLN.length > 0 && <YAxis yAxisId="left" label={{ value: 'PLN', angle: -90, position: 'insideLeft' }} />}
                      {salesMonthlyChartDataEUR.length > 0 && <YAxis yAxisId={salesMonthlyChartDataPLN.length > 0 ? "right" : "left"} orientation={salesMonthlyChartDataPLN.length > 0 ? "right" : "left"} label={{ value: 'EUR', angle: salesMonthlyChartDataPLN.length > 0 ? 90 : -90, position: salesMonthlyChartDataPLN.length > 0 ? 'insideRight' : 'insideLeft' }} />}
                      <Tooltip content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const month = payload[0]?.payload?.month;
                          const pln = salesMonthlyChartDataPLN.find(d => d.month === month);
                          const eur = salesMonthlyChartDataEUR.find(d => d.month === month);
                          return (
                            <div className="bg-background p-3 border rounded shadow-lg text-xs">
                              <p className="font-semibold mb-2">{month}</p>
                              {pln && <p>PLN: {formatNumber(pln.total)}</p>}
                              {eur && <p>EUR: {formatNumber(eur.total)}</p>}
                            </div>
                          );
                        }
                        return null;
                      }} />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      {salesMonthlyChartDataPLN.length > 0 && <Line yAxisId="left" type="monotone" dataKey="total" stroke="#8b5cf6" strokeWidth={2} name="Sprzedaż PLN" data={salesMonthlyChartDataPLN} />}
                      {salesMonthlyChartDataEUR.length > 0 && <Line yAxisId={salesMonthlyChartDataPLN.length > 0 ? "right" : "left"} type="monotone" dataKey="total" stroke="#06b6d4" strokeWidth={2} name="Sprzedaż EUR" data={salesMonthlyChartDataEUR} />}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="monthly" className="space-y-6">
          {(() => {
            const monthlyPLN = monthlyChartData.filter(d => d.currency === 'PLN');
            const monthlyEUR = monthlyChartData.filter(d => d.currency === 'EUR');

            // Połącz dane dla obu walut
            const allMonths = [...new Set([...monthlyPLN.map(d => d.month), ...monthlyEUR.map(d => d.month)])].sort();
            const combinedData = allMonths.map(month => {
              const plnData = monthlyPLN.find(d => d.month === month);
              const eurData = monthlyEUR.find(d => d.month === month);
              return {
                month,
                totalPLN: plnData?.total || null,
                totalEUR: eurData?.total || null
              };
            });

            return (
              <Card className="bg-background shadow-lg">
                <CardHeader>
                  <CardTitle>Wydatki miesięczne {monthlyPLN.length > 0 && monthlyEUR.length > 0 ? '(PLN i EUR)' : monthlyPLN.length > 0 ? '(PLN)' : monthlyEUR.length > 0 ? '(EUR)' : ''}</CardTitle>
                </CardHeader>
                <CardContent>
                  {monthlyChartData.length === 0 ? (
                    <p className="text-slate-500 text-center py-8">Brak danych</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={400}>
                      <ComposedChart data={combinedData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        {monthlyPLN.length > 0 && <YAxis yAxisId="left" label={{ value: 'PLN', angle: -90, position: 'insideLeft' }} />}
                        {monthlyEUR.length > 0 && <YAxis yAxisId={monthlyPLN.length > 0 ? "right" : "left"} orientation={monthlyPLN.length > 0 ? "right" : "left"} label={{ value: 'EUR', angle: monthlyPLN.length > 0 ? 90 : -90, position: monthlyPLN.length > 0 ? 'insideRight' : 'insideLeft' }} />}
                        <Tooltip content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-background p-3 border rounded shadow-lg text-xs">
                                <p className="font-semibold mb-2">{payload[0]?.payload?.month}</p>
                                {payload.map((entry, idx) => (
                                  <p key={idx}>{entry.name}: {entry.value ? formatNumber(entry.value) : 'Brak danych'}</p>
                                ))}
                              </div>
                            );
                          }
                          return null;
                        }} />
                        <Legend />
                        {monthlyPLN.length > 0 && <Line yAxisId="left" type="monotone" dataKey="totalPLN" stroke="#3b82f6" strokeWidth={2} name="PLN" connectNulls />}
                        {monthlyEUR.length > 0 && <Line yAxisId={monthlyPLN.length > 0 ? "right" : "left"} type="monotone" dataKey="totalEUR" stroke="#06b6d4" strokeWidth={2} name="EUR" connectNulls />}
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            );
          })()}
          </TabsContent>

            <TabsContent value="sales-yearly" className="space-y-6">
            <Card className="bg-background shadow-lg">
              <CardHeader>
                <CardTitle>Przychody sprzedażowe roczne {salesYearlyChartDataPLN.length > 0 && salesYearlyChartDataEUR.length > 0 ? '(PLN i EUR)' : salesYearlyChartDataPLN.length > 0 ? '(PLN)' : '(EUR)'}</CardTitle>
              </CardHeader>
              <CardContent>
                {salesYearlyChartDataPLN.length === 0 && salesYearlyChartDataEUR.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">Brak danych</p>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <ComposedChart data={Object.values(salesYearlyData).sort((a, b) => a.year.localeCompare(b.year))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="year" />
                      {salesYearlyChartDataPLN.length > 0 && <YAxis yAxisId="left" label={{ value: 'PLN', angle: -90, position: 'insideLeft' }} />}
                      {salesYearlyChartDataEUR.length > 0 && <YAxis yAxisId={salesYearlyChartDataPLN.length > 0 ? "right" : "left"} orientation={salesYearlyChartDataPLN.length > 0 ? "right" : "left"} label={{ value: 'EUR', angle: salesYearlyChartDataPLN.length > 0 ? 90 : -90, position: salesYearlyChartDataPLN.length > 0 ? 'insideRight' : 'insideLeft' }} />}
                      <Tooltip content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const year = payload[0]?.payload?.year;
                          const pln = salesYearlyChartDataPLN.find(d => d.year === year);
                          const eur = salesYearlyChartDataEUR.find(d => d.year === year);
                          return (
                            <div className="bg-background p-3 border rounded shadow-lg text-xs">
                              <p className="font-semibold mb-2">{year}</p>
                              {pln && <p>PLN: {formatNumber(pln.total)}</p>}
                              {eur && <p>EUR: {formatNumber(eur.total)}</p>}
                            </div>
                          );
                        }
                        return null;
                      }} />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      {salesYearlyChartDataPLN.length > 0 && <Bar yAxisId="left" dataKey="total" fill="#8b5cf6" name="Sprzedaż PLN" data={salesYearlyChartDataPLN} />}
                      {salesYearlyChartDataEUR.length > 0 && <Bar yAxisId={salesYearlyChartDataPLN.length > 0 ? "right" : "left"} dataKey="total" fill="#06b6d4" name="Sprzedaż EUR" data={salesYearlyChartDataEUR} />}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            </TabsContent>

            <TabsContent value="quarterly" className="space-y-6">
            {(() => {
              const quarterlyPLN = quarterlyChartData.filter(d => d.currency === 'PLN');
              const quarterlyEUR = quarterlyChartData.filter(d => d.currency === 'EUR');
              return (
                <>
                  <Card className="bg-background shadow-lg">
                    <CardHeader>
                      <CardTitle>Wydatki kwartalne (PLN)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {quarterlyPLN.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">Brak danych</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={400}>
                          <ComposedChart data={quarterlyPLN}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="period" />
                            <YAxis />
                            <Tooltip content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-background p-3 border rounded shadow-lg text-xs">
                                    <p className="font-semibold mb-2">{data.period}</p>
                                    <p>PLN: {formatNumber(data.total)}</p>
                                  </div>
                                );
                              }
                              return null;
                            }} />
                            <Legend />
                            <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} name="Suma" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="bg-background shadow-lg">
                    <CardHeader>
                      <CardTitle>Wydatki kwartalne (EUR)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {quarterlyEUR.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">Brak danych</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={400}>
                          <ComposedChart data={quarterlyEUR}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="period" />
                            <YAxis />
                            <Tooltip content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-background p-3 border rounded shadow-lg text-xs">
                                    <p className="font-semibold mb-2">{data.period}</p>
                                    <p>EUR: {formatNumber(data.total)}</p>
                                  </div>
                                );
                              }
                              return null;
                            }} />
                            <Legend />
                            <Line type="monotone" dataKey="total" stroke="#06b6d4" strokeWidth={2} name="Suma" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                </>
              );
            })()}

            <Card className="bg-background shadow-lg">
              <CardHeader>
                <CardTitle>Szczegóły kwartalne</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kwartał</TableHead>
                      <TableHead>Liczba faktur</TableHead>
                      <TableHead>Suma</TableHead>
                      <TableHead>Główny kontrahent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quarterlyChartData.map((item, idx) => {
                      const topContractor = Object.entries(item.contractors)
                        .sort((a, b) => b[1] - a[1])[0];
                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{item.period}</TableCell>
                          <TableCell>{item.count}</TableCell>
                          <TableCell className="font-semibold">{item.total.toFixed(2)} PLN</TableCell>
                          <TableCell className="text-slate-600">
                            {topContractor ? `${topContractor[0]} (${topContractor[1].toFixed(2)} PLN)` : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            </TabsContent>

            <TabsContent value="sales-quarterly" className="space-y-6">
            {(() => {
              // Połącz dane dla obu walut
              const allPeriods = [...new Set([...salesQuarterlyChartDataPLN.map(d => d.period), ...salesQuarterlyChartDataEUR.map(d => d.period)])].sort();
              const combinedData = allPeriods.map(period => {
                const plnData = salesQuarterlyChartDataPLN.find(d => d.period === period);
                const eurData = salesQuarterlyChartDataEUR.find(d => d.period === period);
                return {
                  period,
                  totalPLN: plnData?.total || null,
                  totalEUR: eurData?.total || null
                };
              });
              
              return (
                <Card className="bg-background shadow-lg">
                  <CardHeader>
                    <CardTitle>Przychody sprzedażowe kwartalne {salesQuarterlyChartDataPLN.length > 0 && salesQuarterlyChartDataEUR.length > 0 ? '(PLN i EUR)' : salesQuarterlyChartDataPLN.length > 0 ? '(PLN)' : '(EUR)'}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {salesQuarterlyChartDataPLN.length === 0 && salesQuarterlyChartDataEUR.length === 0 ? (
                      <p className="text-slate-500 text-center py-8">Brak danych</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={400}>
                        <ComposedChart data={combinedData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="period" />
                          {salesQuarterlyChartDataPLN.length > 0 && <YAxis yAxisId="left" label={{ value: 'PLN', angle: -90, position: 'insideLeft' }} />}
                          {salesQuarterlyChartDataEUR.length > 0 && <YAxis yAxisId={salesQuarterlyChartDataPLN.length > 0 ? "right" : "left"} orientation={salesQuarterlyChartDataPLN.length > 0 ? "right" : "left"} label={{ value: 'EUR', angle: salesQuarterlyChartDataPLN.length > 0 ? 90 : -90, position: salesQuarterlyChartDataPLN.length > 0 ? 'insideRight' : 'insideLeft' }} />}
                          <Tooltip content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-background p-3 border rounded shadow-lg text-xs">
                                  <p className="font-semibold mb-2">{payload[0]?.payload?.period}</p>
                                  {payload.map((entry, idx) => (
                                    <p key={idx}>{entry.name}: {entry.value ? formatNumber(entry.value) : 'Brak danych'}</p>
                                  ))}
                                </div>
                              );
                            }
                            return null;
                          }} />
                          <Legend wrapperStyle={{ paddingTop: '20px' }} />
                          {salesQuarterlyChartDataPLN.length > 0 && <Line yAxisId="left" type="monotone" dataKey="totalPLN" stroke="#8b5cf6" strokeWidth={2} name="Sprzedaż PLN" connectNulls />}
                          {salesQuarterlyChartDataEUR.length > 0 && <Line yAxisId={salesQuarterlyChartDataPLN.length > 0 ? "right" : "left"} type="monotone" dataKey="totalEUR" stroke="#06b6d4" strokeWidth={2} name="Sprzedaż EUR" connectNulls />}
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
            </TabsContent>

            <TabsContent value="yearly" className="space-y-6">
            {(() => {
              const yearlyPLN = yearlyChartData.filter(d => d.currency === 'PLN');
              const yearlyEUR = yearlyChartData.filter(d => d.currency === 'EUR');
              return (
                <>
                  <Card className="bg-background shadow-lg">
                    <CardHeader>
                      <CardTitle>Wydatki roczne (PLN)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {yearlyPLN.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">Brak danych</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={400}>
                          <ComposedChart data={yearlyPLN}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="year" />
                            <YAxis />
                            <Tooltip content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-background p-3 border rounded shadow-lg text-xs">
                                    <p className="font-semibold mb-2">{data.year}</p>
                                    <p>PLN: {formatNumber(data.total)}</p>
                                  </div>
                                );
                              }
                              return null;
                            }} />
                            <Legend />
                            <Line type="monotone" dataKey="total" stroke="#8b5cf6" strokeWidth={2} name="Suma" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="bg-background shadow-lg">
                    <CardHeader>
                      <CardTitle>Wydatki roczne (EUR)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {yearlyEUR.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">Brak danych</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={400}>
                          <ComposedChart data={yearlyEUR}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="year" />
                            <YAxis />
                            <Tooltip content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-background p-3 border rounded shadow-lg text-xs">
                                    <p className="font-semibold mb-2">{data.year}</p>
                                    <p>EUR: {formatNumber(data.total)}</p>
                                  </div>
                                );
                              }
                              return null;
                            }} />
                            <Legend />
                            <Line type="monotone" dataKey="total" stroke="#06b6d4" strokeWidth={2} name="Suma" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                </>
              );
            })()}

            <Card className="bg-background shadow-lg">
              <CardHeader>
                <CardTitle>Szczegóły roczne</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rok</TableHead>
                      <TableHead>Liczba faktur</TableHead>
                      <TableHead>Suma</TableHead>
                      <TableHead>Główny kontrahent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yearlyChartData.map((item, idx) => {
                      const topContractor = Object.entries(item.contractors)
                        .sort((a, b) => b[1] - a[1])[0];
                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{item.year}</TableCell>
                          <TableCell>{item.count}</TableCell>
                          <TableCell className="font-semibold">{item.total.toFixed(2)} PLN</TableCell>
                          <TableCell className="text-slate-600">
                            {topContractor ? `${topContractor[0]} (${topContractor[1].toFixed(2)} PLN)` : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hotels" className="space-y-6">
            <Card className="bg-background shadow-lg">
              <CardHeader>
                <CardTitle>Wydatki hotelowe miesięczne</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart data={hotelMonthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => `${value.toFixed(2)} PLN`} />
                    <Legend />
                    <Line type="monotone" dataKey="total" stroke="#ec4899" strokeWidth={2} name="Suma (PLN)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-background shadow-lg">
              <CardHeader>
                <CardTitle>Podsumowanie według hoteli</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <ResponsiveContainer width="100%" height={400}>
                    <ComposedChart data={hotelData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                      <YAxis />
                      <Tooltip formatter={(value) => `${value.toFixed(2)} PLN`} />
                      <Legend />
                      <Line type="monotone" dataKey="total" stroke="#ec4899" strokeWidth={2} name="Suma (PLN)" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nazwa hotelu</TableHead>
                        <TableHead>Liczba pobytów</TableHead>
                        <TableHead>Liczba osób</TableHead>
                        <TableHead>Suma</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {hotelData.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>{item.count}</TableCell>
                          <TableCell>{item.persons}</TableCell>
                          <TableCell className="font-semibold">{item.total.toFixed(2)} PLN</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="forecast" className="space-y-6">
            {(() => {
              const monthlyPLN = monthlyChartData.filter(d => d.currency === 'PLN');
              const monthlyEUR = monthlyChartData.filter(d => d.currency === 'EUR');
              const forecastMonthsPLN = generateForecast(monthlyPLN, 6);
              const forecastMonthsEUR = generateForecast(monthlyEUR, 6);

              const quarterlyPLN = quarterlyChartData.filter(d => d.currency === 'PLN');
              const quarterlyEUR = quarterlyChartData.filter(d => d.currency === 'EUR');
              const forecastQuartersPLN = generateForecast(quarterlyPLN, 4);
              const forecastQuartersEUR = generateForecast(quarterlyEUR, 4);

              const yearlyPLN = yearlyChartData.filter(d => d.currency === 'PLN');
              const yearlyEUR = yearlyChartData.filter(d => d.currency === 'EUR');
              const forecastYearsPLN = generateForecast(yearlyPLN, 3);
              const forecastYearsEUR = generateForecast(yearlyEUR, 3);

              return (
                <>
                  <Card className="bg-background shadow-lg">
                    <CardHeader>
                      <CardTitle>Prognoza wydatków miesięcznych (PLN)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {monthlyPLN.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">Brak danych</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={400}>
                          <ComposedChart data={[...monthlyPLN, ...monthlyPLN.slice(-1).map((_, i) => ({
                            month: `Prognoza ${i + 1}`,
                            total: forecastMonthsPLN[i],
                            currency: 'PLN',
                            isForecast: true
                          })).slice(0, Math.min(6, forecastMonthsPLN.length))]}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip formatter={(value) => `${formatNumber(value)} PLN`} />
                            <Legend />
                            <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} name="Wydatki" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="bg-background shadow-lg">
                    <CardHeader>
                      <CardTitle>Prognoza wydatków miesięcznych (EUR)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {monthlyEUR.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">Brak danych</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={400}>
                          <ComposedChart data={[...monthlyEUR, ...monthlyEUR.slice(-1).map((_, i) => ({
                            month: `Prognoza ${i + 1}`,
                            total: forecastMonthsEUR[i],
                            currency: 'EUR',
                            isForecast: true
                          })).slice(0, Math.min(6, forecastMonthsEUR.length))]}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip formatter={(value) => `${formatNumber(value)} EUR`} />
                            <Legend />
                            <Line type="monotone" dataKey="total" stroke="#06b6d4" strokeWidth={2} name="Wydatki" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="bg-background shadow-lg">
                    <CardHeader>
                      <CardTitle>Prognoza wydatków kwartalnych (PLN)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {quarterlyPLN.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">Brak danych</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={400}>
                          <ComposedChart data={[...quarterlyPLN, ...quarterlyPLN.slice(-1).map((_, i) => ({
                            period: `Prognoza Q${i + 1}`,
                            total: forecastQuartersPLN[i],
                            currency: 'PLN',
                            isForecast: true
                          })).slice(0, Math.min(4, forecastQuartersPLN.length))]}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="period" />
                            <YAxis />
                            <Tooltip formatter={(value) => `${formatNumber(value)} PLN`} />
                            <Legend />
                            <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} name="Wydatki" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="bg-background shadow-lg">
                    <CardHeader>
                      <CardTitle>Prognoza wydatków kwartalnych (EUR)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {quarterlyEUR.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">Brak danych</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={400}>
                          <ComposedChart data={[...quarterlyEUR, ...quarterlyEUR.slice(-1).map((_, i) => ({
                            period: `Prognoza Q${i + 1}`,
                            total: forecastQuartersEUR[i],
                            currency: 'EUR',
                            isForecast: true
                          })).slice(0, Math.min(4, forecastQuartersEUR.length))]}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="period" />
                            <YAxis />
                            <Tooltip formatter={(value) => `${formatNumber(value)} EUR`} />
                            <Legend />
                            <Line type="monotone" dataKey="total" stroke="#06b6d4" strokeWidth={2} name="Wydatki" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="bg-background shadow-lg">
                    <CardHeader>
                      <CardTitle>Prognoza wydatków rocznych (PLN)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {yearlyPLN.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">Brak danych</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={400}>
                          <ComposedChart data={[...yearlyPLN, ...yearlyPLN.slice(-1).map((_, i) => ({
                            year: `Prognoza ${new Date().getFullYear() + i + 1}`,
                            total: forecastYearsPLN[i],
                            currency: 'PLN',
                            isForecast: true
                          })).slice(0, Math.min(3, forecastYearsPLN.length))]}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="year" />
                            <YAxis />
                            <Tooltip formatter={(value) => `${formatNumber(value)} PLN`} />
                            <Legend />
                            <Line type="monotone" dataKey="total" stroke="#8b5cf6" strokeWidth={2} name="Wydatki" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="bg-background shadow-lg">
                    <CardHeader>
                      <CardTitle>Prognoza wydatków rocznych (EUR)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {yearlyEUR.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">Brak danych</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={400}>
                          <ComposedChart data={[...yearlyEUR, ...yearlyEUR.slice(-1).map((_, i) => ({
                            year: `Prognoza ${new Date().getFullYear() + i + 1}`,
                            total: forecastYearsEUR[i],
                            currency: 'EUR',
                            isForecast: true
                          })).slice(0, Math.min(3, forecastYearsEUR.length))]}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="year" />
                            <YAxis />
                            <Tooltip formatter={(value) => `${formatNumber(value)} EUR`} />
                            <Legend />
                            <Line type="monotone" dataKey="total" stroke="#06b6d4" strokeWidth={2} name="Wydatki" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                </>
              );
            })()}
          </TabsContent>

          <TabsContent value="status" className="space-y-6">
            <Card className="bg-background shadow-lg">
              <CardHeader>
                <CardTitle>Status płatności</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
          </Tabs>
          <AiReportModal open={aiReportOpen} onOpenChange={setAiReportOpen} />
      </div>
    </div>
  );
}