import React, { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, FileText, ExternalLink, Trash2, Download, FileSpreadsheet, FileCode, FileType, Edit2, Upload, Plus } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import { escapeCSV } from '@/components/utils/normalize';
import { MoneyValue } from '@/components/currency/MoneyValue';
import { useClientEnrichedInvoices } from '@/hooks/useClientEnrichedInvoices';
import { getInvoicePlnAtIssue } from '@/lib/finance-pln';
import { enrichInvoiceForSave, pickInvoiceApiPayload } from '@/lib/invoice-fx';
import { Form } from '@/components/ui/form';
import { InvoiceDialogFormFields } from '@/components/invoices/InvoiceDialogFormFields';
import {
  invoiceFormSchema,
  invoiceUpdateFormSchema,
  invoiceFormDefaults,
  invoiceToFormValues,
  DEFAULT_INVOICE_PAYER,
  replaceLegacyDefaultPayer,
} from '@/lib/invoice-schema';
import { toast } from 'sonner';
import { findInvoiceNumberConflict } from '@/lib/duplicate-detection';
import { getUploadFilePublicUrl } from '@/lib/upload-file-url';

const MONTHS_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];

export default function Invoices() {
   const [activeTab, setActiveTab] = useState('all');
   const [activeMonthTab, setActiveMonthTab] = useState('all_months');
   const [search, setSearch] = useState('');
   const [statusFilter, setStatusFilter] = useState('all');
   const [selectedInvoices, setSelectedInvoices] = useState([]);
   const [editingInvoice, setEditingInvoice] = useState(null);
   const [editDialogOpen, setEditDialogOpen] = useState(false);
   const [addDialogOpen, setAddDialogOpen] = useState(false);
   const [exportFormat, setExportFormat] = useState(null);
   const [exportMethod, setExportMethod] = useState(null);
   const [uploadingInvoiceId, setUploadingInvoiceId] = useState(null);
   const [uploadingFile, setUploadingFile] = useState(null);
   const queryClient = useQueryClient();

   const addForm = useForm({
     resolver: zodResolver(invoiceFormSchema),
     defaultValues: invoiceFormDefaults,
   });

   const editForm = useForm({
     resolver: zodResolver(invoiceUpdateFormSchema),
     defaultValues: { ...invoiceFormDefaults, id: '' },
   });

   useEffect(() => {
     if (addDialogOpen) addForm.reset(invoiceFormDefaults);
   }, [addDialogOpen, addForm]);

   useEffect(() => {
     if (editDialogOpen && editingInvoice) {
       editForm.reset(invoiceToFormValues(editingInvoice));
     }
   }, [editDialogOpen, editingInvoice, editForm]);
   const topScrollRef = useRef(null);
   const tableScrollRef = useRef(null);
   const stickyScrollRef = useRef(null);
   const cardRef = useRef(null);
   const [showStickyScroll, setShowStickyScroll] = useState(false);

   useEffect(() => {
     const handleScroll = () => {
       if (!cardRef.current) return;
       const rect = cardRef.current.getBoundingClientRect();
       const windowHeight = window.innerHeight;
       // Pokaż sticky scrollbar gdy tabela jest widoczna ale jej dolna krawędź jest poza ekranem
       setShowStickyScroll(rect.top < windowHeight && rect.bottom > windowHeight);
     };
     window.addEventListener('scroll', handleScroll, { passive: true });
     handleScroll();
     return () => window.removeEventListener('scroll', handleScroll);
   }, []);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => base44.entities.Invoice.list('-created_date'),
  });
  const enrichedInvoices = useClientEnrichedInvoices(invoices);
  const enrichedById = React.useMemo(
    () => Object.fromEntries(enrichedInvoices.map((i) => [i.id, i])),
    [enrichedInvoices]
  );

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Invoice.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['invoices']);
      setSelectedInvoices([]);
    },
  });

  const deleteMultipleMutation = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) {
        await base44.entities.Invoice.delete(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['invoices']);
      setSelectedInvoices([]);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, invoice }) => {
      if (status === 'paid' && invoice) {
        const paid_at = invoice.paid_at || format(new Date(), 'yyyy-MM-dd');
        const next = { ...invoice, status: 'paid', paid_at };
        const enriched = await enrichInvoiceForSave(next, { recomputePaid: true });
        await base44.entities.Invoice.update(id, pickInvoiceApiPayload(enriched));
      } else {
        await base44.entities.Invoice.update(id, { status });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['invoices']);
    },
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: async (data) => {
      const enriched = await enrichInvoiceForSave(
        { ...data },
        { recomputePaid: data.status === 'paid' }
      );
      await base44.entities.Invoice.update(data.id, pickInvoiceApiPayload(enriched));
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['invoices']);
      setEditDialogOpen(false);
      setEditingInvoice(null);
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (data) => {
      const enriched = await enrichInvoiceForSave(data, { recomputePaid: data.status === 'paid' });
      return base44.entities.Invoice.create(pickInvoiceApiPayload(enriched));
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['invoices']);
      setAddDialogOpen(false);
      addForm.reset(invoiceFormDefaults);
    },
  });

  const uploadTransferMutation = useMutation({
    mutationFn: async ({ invoiceId, file }) => {
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const url = getUploadFilePublicUrl(uploadRes);
      if (!url) throw new Error("Upload nie zwrócił adresu pliku.");
      await base44.entities.Invoice.update(invoiceId, { transfer_confirmation_url: url });
      return url;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['invoices']);
      setUploadingInvoiceId(null);
      setUploadingFile(null);
    },
  });

  const isValidDate = (dateString) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  };

  // Dostępne miesiące wg terminu płatności (dla sales i purchase)
  const getAvailableMonths = (type) => {
    return [...new Set(
      invoices
        .filter(inv => inv.invoice_type === type && inv.payment_deadline && !isNaN(new Date(inv.payment_deadline)))
        .map(inv => {
          const d = new Date(inv.payment_deadline);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        })
    )].sort().reverse();
  };
  const availableMonths = getAvailableMonths(activeTab);

  const filteredInvoices = invoices
    .filter(inv => {
      const matchesSearch = search === '' || 
        (inv.invoice_number && inv.invoice_number.toLowerCase().includes(search.toLowerCase())) ||
        (inv.contractor_name && inv.contractor_name.toLowerCase().includes(search.toLowerCase())) ||
        (inv.position && inv.position.toLowerCase().includes(search.toLowerCase()));

      const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
      const matchesType = activeTab === 'all' || inv.invoice_type === activeTab;

      let matchesMonth = true;
      if ((activeTab === 'sales' || activeTab === 'purchase') && activeMonthTab !== 'all_months') {
        const [year, month] = activeMonthTab.split('-');
        if (inv.payment_deadline && !isNaN(new Date(inv.payment_deadline))) {
          const d = new Date(inv.payment_deadline);
          matchesMonth = d.getFullYear() === parseInt(year) && (d.getMonth() + 1) === parseInt(month);
        } else {
          matchesMonth = false;
        }
      }

      return matchesSearch && matchesStatus && matchesType && matchesMonth;
    });

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedInvoices(filteredInvoices.map(inv => inv.id));
    } else {
      setSelectedInvoices([]);
    }
  };

  const handleSelectInvoice = (id, checked) => {
    if (checked) {
      setSelectedInvoices([...selectedInvoices, id]);
    } else {
      setSelectedInvoices(selectedInvoices.filter(invId => invId !== id));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedInvoices.length === 0) return;
    if (confirm(`Czy na pewno chcesz usunąć ${selectedInvoices.length} faktur?`)) {
      deleteMultipleMutation.mutate(selectedInvoices);
    }
  };

  const exportToCSV = (collective = true) => {
    if (collective) {
      const headers = ['Numer faktury', 'Kontrahent', 'Pozycja', 'Kwota', 'Waluta', 'Data wystawienia', 'Termin płatności', 'Status'];
      const rows = filteredInvoices.map(inv => [
        escapeCSV(inv.invoice_number || ''),
        escapeCSV(inv.contractor_name || ''),
        escapeCSV(inv.position || ''),
        escapeCSV(inv.amount || ''),
        escapeCSV(inv.currency || ''),
        escapeCSV(inv.issue_date && isValidDate(inv.issue_date) ? format(new Date(inv.issue_date), 'dd.MM.yyyy') : ''),
        escapeCSV(inv.payment_deadline && isValidDate(inv.payment_deadline) ? format(new Date(inv.payment_deadline), 'dd.MM.yyyy') : ''),
        escapeCSV(inv.status === 'paid' ? 'Opłacono' : inv.status === 'overdue' ? 'Przeterminowano' : 'Nieopłacono')
      ]);

      const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `faktury_zbiorczy_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      link.click();
    } else {
      filteredInvoices.forEach(inv => {
        const headers = ['Pole', 'Wartość'];
        const rows = [
          ['Numer faktury', escapeCSV(inv.invoice_number || '')],
          ['Kontrahent', escapeCSV(inv.contractor_name || '')],
          ['Kwota', escapeCSV(inv.amount || '')],
          ['Waluta', escapeCSV(inv.currency || '')],
          ['Data wystawienia', escapeCSV(inv.issue_date && isValidDate(inv.issue_date) ? format(new Date(inv.issue_date), 'dd.MM.yyyy') : '')],
          ['Termin płatności', escapeCSV(inv.payment_deadline && isValidDate(inv.payment_deadline) ? format(new Date(inv.payment_deadline), 'dd.MM.yyyy') : '')],
          ['Status', escapeCSV(inv.status === 'paid' ? 'Opłacono' : inv.status === 'overdue' ? 'Przeterminowano' : 'Nieopłacono')]
        ];
        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `faktura_${inv.invoice_number || inv.id}.csv`;
        link.click();
      });
    }
  };

  const exportToXML = (collective = true) => {
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
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<invoices>\n';
      filteredInvoices.forEach(inv => {
        xml += '  <invoice>\n';
        xml += `    <invoice_number>${escapeXML(inv.invoice_number)}</invoice_number>\n`;
        xml += `    <contractor_name>${escapeXML(inv.contractor_name)}</contractor_name>\n`;
        xml += `    <amount>${escapeXML(inv.amount)}</amount>\n`;
        xml += `    <currency>${escapeXML(inv.currency)}</currency>\n`;
        xml += `    <issue_date>${escapeXML(inv.issue_date)}</issue_date>\n`;
        xml += `    <payment_deadline>${escapeXML(inv.payment_deadline)}</payment_deadline>\n`;
        xml += `    <status>${escapeXML(inv.status)}</status>\n`;
        xml += '  </invoice>\n';
      });
      xml += '</invoices>';

      const blob = new Blob([xml], { type: 'text/xml;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `faktury_zbiorczy_${format(new Date(), 'yyyy-MM-dd')}.xml`;
      link.click();
    } else {
      filteredInvoices.forEach(inv => {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<invoice>\n';
        xml += `  <invoice_number>${escapeXML(inv.invoice_number)}</invoice_number>\n`;
        xml += `  <contractor_name>${escapeXML(inv.contractor_name)}</contractor_name>\n`;
        xml += `  <amount>${escapeXML(inv.amount)}</amount>\n`;
        xml += `  <currency>${escapeXML(inv.currency)}</currency>\n`;
        xml += `  <issue_date>${escapeXML(inv.issue_date)}</issue_date>\n`;
        xml += `  <payment_deadline>${escapeXML(inv.payment_deadline)}</payment_deadline>\n`;
        xml += `  <status>${escapeXML(inv.status)}</status>\n`;
        xml += '</invoice>';

        const blob = new Blob([xml], { type: 'text/xml;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `faktura_${inv.invoice_number || inv.id}.xml`;
        link.click();
      });
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Lista faktur', 14, 20);
    
    doc.setFontSize(10);
    let y = 35;
    
    filteredInvoices.forEach((inv, index) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      
      doc.text(`Numer: ${inv.invoice_number || '-'}`, 14, y);
      doc.text(`Kontrahent: ${inv.contractor_name || '-'}`, 14, y + 5);
      doc.text(`Kwota: ${inv.amount?.toFixed(2) || '-'} ${inv.currency || ''}`, 14, y + 10);
      doc.text(`Status: ${inv.status === 'paid' ? 'Opłacono' : inv.status === 'overdue' ? 'Przeterminowano' : 'Nieopłacono'}`, 14, y + 15);
      
      y += 25;
    });
    
    doc.save(`faktury_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };



  return (
    <div className="w-full p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Faktury</h1>
            <p className="text-muted-foreground">Zarządzaj wszystkimi fakturami w systemie</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setAddDialogOpen(true)} className="bg-green-600 hover:bg-green-700">
              <Plus className="mr-2 h-4 w-4" />
              Dodaj fakturę
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
                  PDF - Plik zbiorczy
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Card className="bg-background shadow-lg mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Łącznie faktur w systemie:</p>
                <p className="text-2xl font-bold text-slate-900">{invoices.length}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Wyniki po filtrach:</p>
                <p className="text-2xl font-bold text-blue-600">{filteredInvoices.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="all" className="mb-4" onValueChange={(val) => { setActiveTab(val); setActiveMonthTab('all_months'); }}>
          <TabsList className="bg-background">
            <TabsTrigger value="all">Wszystkie faktury</TabsTrigger>
            <TabsTrigger value="purchase">Faktury zakupowe</TabsTrigger>
            <TabsTrigger value="sales">Faktury sprzedażowe</TabsTrigger>
          </TabsList>
        </Tabs>

        {(activeTab === 'sales' || activeTab === 'purchase') && availableMonths.length > 0 && (
          <div className="mb-6 overflow-x-auto">
            <div className="flex gap-2 pb-1">
              <button
                onClick={() => setActiveMonthTab('all_months')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeMonthTab === 'all_months' ? 'bg-blue-600 text-white' : 'bg-background text-slate-600 border border-slate-200 hover:bg-foreground/5'}`}
              >
                Wszystkie miesiące
              </button>
              {availableMonths.map(ym => {
                const [year, month] = ym.split('-');
                const label = `${MONTHS_PL[parseInt(month) - 1]} ${year}`;
                return (
                  <button
                    key={ym}
                    onClick={() => setActiveMonthTab(ym)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeMonthTab === ym ? 'bg-blue-600 text-white' : 'bg-background text-slate-600 border border-slate-200 hover:bg-foreground/5'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <Card className="bg-background shadow-lg mb-6">
          <CardHeader>
            <CardTitle>Filtry</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 flex-wrap items-center">
              <div className="flex-1 min-w-64">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Szukaj po numerze lub kontrahenta..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  <SelectItem value="unpaid">Nieopłacone</SelectItem>
                  <SelectItem value="paid">Opłacone</SelectItem>
                  <SelectItem value="overdue">Przeterminowane</SelectItem>
                </SelectContent>
              </Select>
              {selectedInvoices.length > 0 && (
                <Button
                  onClick={handleDeleteSelected}
                  variant="destructive"
                  disabled={deleteMultipleMutation.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Usuń zaznaczone ({selectedInvoices.length})
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-background shadow-lg" ref={cardRef}>
          <CardContent className="p-0">
            <div
              ref={tableScrollRef}
              onScroll={() => {
                if (topScrollRef.current) topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
                if (stickyScrollRef.current) stickyScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
              }}
              className="overflow-x-auto"
            >
              <Table style={{minWidth: '1580px'}}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedInvoices.length === filteredInvoices.length && filteredInvoices.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Numer faktury</TableHead>
                    <TableHead>Sprzedawca</TableHead>
                    <TableHead>Kontrahent</TableHead>
                    <TableHead>Pozycja</TableHead>
                    <TableHead>Kwota dokumentu</TableHead>
                    <TableHead>Kwota EUR</TableHead>
                    <TableHead>PLN (NBP)</TableHead>
                    <TableHead>Data wystawienia</TableHead>
                     <TableHead>Termin płatności</TableHead>
                     <TableHead>Status</TableHead>
                     <TableHead>Przelewy</TableHead>
                     <TableHead>Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-8 text-slate-500">
                        Ładowanie...
                      </TableCell>
                    </TableRow>
                  ) : filteredInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-8 text-slate-500">
                        Brak faktur
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredInvoices.map(inv => {
                    const ei = enrichedById[inv.id] || inv;
                    return (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedInvoices.includes(inv.id)}
                            onCheckedChange={(checked) => handleSelectInvoice(inv.id, checked)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {inv.invoice_number || <span className="text-red-500 italic">Brak numeru</span>}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => {
                                setEditingInvoice(inv);
                                setEditDialogOpen(true);
                              }}
                              title="Edytuj fakturę"
                            >
                              <Edit2 className="h-3 w-3 text-blue-500" />
                            </Button>
                          </div>
                        </TableCell>
                         <TableCell>
                           {inv.invoice_type === 'sales'
                             ? replaceLegacyDefaultPayer(inv.payer) || DEFAULT_INVOICE_PAYER
                             : inv.contractor_name}
                         </TableCell>
                         <TableCell>
                           {inv.invoice_type === 'sales'
                             ? inv.contractor_name
                             : replaceLegacyDefaultPayer(inv.payer) || DEFAULT_INVOICE_PAYER}
                         </TableCell>
                         <TableCell className="text-slate-600 text-sm">{inv.position || '-'}</TableCell>
                         <TableCell className="whitespace-nowrap">
                           {inv.amount != null ? inv.amount.toFixed(2) : '-'} {inv.currency || 'PLN'}
                         </TableCell>
                         <TableCell>
                           {inv.amount_eur ? `${inv.amount_eur.toFixed(2)} EUR` : (inv.currency === 'EUR' ? `${inv.amount?.toFixed(2)} EUR` : '-')}
                         </TableCell>
                         <TableCell>
                           <MoneyValue
                             plnAmount={getInvoicePlnAtIssue(ei)}
                             originalAmount={inv.amount}
                             originalCurrency={inv.currency}
                             nbpMidIssue={ei.nbp_mid_issue}
                             nbpDateIssue={ei.nbp_table_date_issue}
                             nbpMidPaid={ei.nbp_mid_paid}
                             nbpDatePaid={ei.nbp_table_date_paid}
                             fxDiff={ei.fx_difference_pln}
                           />
                         </TableCell>
                        <TableCell>
                          {inv.issue_date && isValidDate(inv.issue_date) ? format(new Date(inv.issue_date), 'dd.MM.yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                          {inv.payment_deadline && isValidDate(inv.payment_deadline) ? format(new Date(inv.payment_deadline), 'dd.MM.yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                           <Select
                             value={inv.status}
                             onValueChange={(status) => updateStatusMutation.mutate({ id: inv.id, status, invoice: inv })}
                           >
                             <SelectTrigger className="w-32">
                               <SelectValue>
                                 <Badge className={
                                   inv.status === 'paid' ? 'bg-green-100 text-green-800' :
                                   inv.status === 'overdue' ? 'bg-red-100 text-red-800' :
                                   'bg-yellow-100 text-yellow-800'
                                 }>
                                   {inv.status === 'paid' ? 'Opłacono' : 
                                    inv.status === 'overdue' ? 'Przeterminowano' : 'Nieopłacono'}
                                 </Badge>
                               </SelectValue>
                             </SelectTrigger>
                             <SelectContent>
                               <SelectItem value="unpaid">Nieopłacono</SelectItem>
                               <SelectItem value="paid">Opłacono</SelectItem>
                               <SelectItem value="overdue">Przeterminowano</SelectItem>
                             </SelectContent>
                           </Select>
                         </TableCell>
                         <TableCell>
                           <div className="flex gap-2 items-center">
                             {inv.transfer_confirmation_url && (
                               <a href={inv.transfer_confirmation_url} target="_blank" rel="noopener noreferrer">
                                 <Button variant="ghost" size="icon" title="Pobierz potwierdzenie">
                                   <FileText className="h-4 w-4 text-green-600" />
                                 </Button>
                               </a>
                             )}
                             <Button
                               variant="ghost"
                               size="icon"
                               onClick={() => setUploadingInvoiceId(inv.id)}
                               title="Dodaj potwierdzenie przelewu"
                             >
                               <Upload className="h-4 w-4 text-blue-600" />
                             </Button>
                           </div>
                         </TableCell>
                         <TableCell>
                           <div className="flex gap-2">
                             <Button
                               variant="ghost"
                               size="icon"
                               onClick={() => {
                                 setEditingInvoice(inv);
                                 setEditDialogOpen(true);
                               }}
                               title="Edytuj"
                             >
                               <Edit2 className="h-4 w-4 text-blue-500" />
                             </Button>
                             {inv.pdf_url && (
                               <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer">
                                 <Button variant="ghost" size="icon" title="Zobacz PDF">
                                   <ExternalLink className="h-4 w-4" />
                                 </Button>
                               </a>
                             )}
                             <Button
                               variant="ghost"
                               size="icon"
                               onClick={() => {
                                 if (confirm('Czy na pewno chcesz usunąć tę fakturę?')) {
                                   deleteMutation.mutate(inv.id);
                                 }
                               }}
                               title="Usuń"
                             >
                               <Trash2 className="h-4 w-4 text-red-500" />
                             </Button>
                           </div>
                         </TableCell>
                      </TableRow>
                    );
                    })
                  )}
                </TableBody>
                </Table>
                </div>
                </CardContent>
                </Card>

                {/* Sticky scrollbar na dole ekranu */}
                {showStickyScroll && (
                <div
                  ref={stickyScrollRef}
                  onScroll={() => { if (tableScrollRef.current) tableScrollRef.current.scrollLeft = stickyScrollRef.current.scrollLeft; }}
                  className="fixed bottom-0 overflow-x-auto bg-background border-t shadow-md z-50"
                  style={{
                    left: 'calc(16rem)',
                    right: 0,
                    height: '14px'
                  }}
                >
                  <div style={{ height: '1px', minWidth: '1580px' }} />
                </div>
                )}

                {uploadingInvoiceId && (
          <Dialog open={!!uploadingInvoiceId} onOpenChange={() => setUploadingInvoiceId(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Dodaj potwierdzenie przelewu</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    id="transfer-file"
                    onChange={(e) => setUploadingFile(e.target.files?.[0] || null)}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls,.csv"
                  />
                  <label htmlFor="transfer-file" className="cursor-pointer">
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-slate-400" />
                      <span className="text-sm text-slate-600">
                        {uploadingFile ? uploadingFile.name : 'Kliknij aby wybrać plik'}
                      </span>
                      <span className="text-xs text-slate-500">PDF, dokumenty, zdjęcia</span>
                    </div>
                  </label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setUploadingInvoiceId(null)}>
                  Anuluj
                </Button>
                <Button 
                  onClick={() => {
                    if (uploadingFile) {
                      uploadTransferMutation.mutate({ invoiceId: uploadingInvoiceId, file: uploadingFile });
                    }
                  }}
                  disabled={!uploadingFile || uploadTransferMutation.isPending}
                >
                  {uploadTransferMutation.isPending ? 'Przesyłanie...' : 'Przesyłaj'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {editingInvoice && (
          <Dialog
            open={editDialogOpen}
            onOpenChange={(open) => {
              setEditDialogOpen(open);
              if (!open) setEditingInvoice(null);
            }}
          >
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edytuj fakturę</DialogTitle>
                <DialogDescription>
                  Zmień dane faktury; kwoty PLN i kurs NBP z wystawienia są podsumowane poniżej.
                </DialogDescription>
              </DialogHeader>
              <Form {...editForm}>
                <form
                  className="space-y-4 py-4"
                  onSubmit={editForm.handleSubmit((values) => {
                    const conflict = findInvoiceNumberConflict(invoices, values.invoice_number, editingInvoice?.id);
                    if (conflict) {
                      toast.error(`Numer „${values.invoice_number}” jest już używany przez inną fakturę.`);
                      return;
                    }
                    updateInvoiceMutation.mutate({ ...editingInvoice, ...values });
                  })}
                >
                  <InvoiceDialogFormFields control={editForm.control} showNotes isCreate={false} />
                  <div className="rounded-md border p-3 text-sm space-y-1 bg-background">
                    <p className="font-medium">Księgowanie PLN (NBP)</p>
                    <p>
                      Kwota PLN (wystawienie):{" "}
                      <strong>
                        {editingInvoice.amount_pln != null
                          ? Number(editingInvoice.amount_pln).toLocaleString("pl-PL", { minimumFractionDigits: 2 })
                          : "—"}
                      </strong>
                    </p>
                    <p>
                      Kurs NBP: {editingInvoice.nbp_mid_issue ?? "—"} (tabela{" "}
                      {editingInvoice.nbp_table_date_issue || "—"})
                    </p>
                    {editingInvoice.fx_difference_pln != null && (
                      <p>
                        Różnica kursowa:{" "}
                        <strong>
                          {Number(editingInvoice.fx_difference_pln).toLocaleString("pl-PL", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          PLN
                        </strong>
                      </p>
                    )}
                  </div>
                  <DialogFooter className="pt-4 sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditDialogOpen(false);
                        setEditingInvoice(null);
                      }}
                    >
                      Anuluj
                    </Button>
                    <Button type="submit" disabled={updateInvoiceMutation.isPending}>
                      {updateInvoiceMutation.isPending ? "Zapisywanie..." : "Zapisz zmiany"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}

        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Dodaj nową fakturę</DialogTitle>
              <DialogDescription>
                Wypełnij wymagane pola; po zapisie kwota w PLN zostanie uzupełniona według NBP z dnia wystawienia.
              </DialogDescription>
            </DialogHeader>
            <Form {...addForm}>
              <form
                className="space-y-4 py-4"
                onSubmit={addForm.handleSubmit((values) => {
                  const conflict = findInvoiceNumberConflict(invoices, values.invoice_number, null);
                  if (conflict) {
                    toast.error(`Faktura o numerze „${values.invoice_number}” już jest w systemie (duplikat).`);
                    return;
                  }
                  createInvoiceMutation.mutate(values);
                })}
              >
                <InvoiceDialogFormFields control={addForm.control} showNotes={false} isCreate />
                <DialogFooter className="pt-4 sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                    Anuluj
                  </Button>
                  <Button type="submit" disabled={createInvoiceMutation.isPending}>
                    {createInvoiceMutation.isPending ? "Dodawanie..." : "Dodaj fakturę"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}