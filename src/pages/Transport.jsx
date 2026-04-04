import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, Truck, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { findDuplicateInvoice } from '@/lib/duplicate-detection';
import { DEFAULT_INVOICE_PAYER, displayInvoiceSeller } from '@/lib/invoice-schema';

export default function Transport() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    contractor_name: '',
    invoice_number: '',
    payer: DEFAULT_INVOICE_PAYER,
    amount: '',
    currency: 'PLN',
    issue_date: '',
    payment_deadline: '',
    status: 'unpaid'
  });

  const queryClient = useQueryClient();

  const { data: contractors = [] } = useQuery({
    queryKey: ['contractors'],
    queryFn: () => base44.entities.Contractor.list(),
  });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => base44.entities.Invoice.list('-issue_date'),
  });

  // Pobierz nazwy kontrahentów transportowych
  const transportContractors = contractors
    .filter(c => c.category === 'transport')
    .map(c => c.name);

  // Filtruj faktury od kontrahentów transportowych
  const transportInvoices = invoices.filter((inv) =>
    transportContractors.includes(displayInvoiceSeller(inv))
  );

  const filteredInvoices = transportInvoices.filter((inv) => {
    const searchLower = search.toLowerCase();
    return (
      displayInvoiceSeller(inv)?.toLowerCase().includes(searchLower) ||
      inv.invoice_number?.toLowerCase().includes(searchLower)
    );
  });

  const totalAmount = filteredInvoices.reduce((sum, inv) => {
    const currency = inv.currency || 'PLN';
    if (!sum[currency]) sum[currency] = 0;
    sum[currency] += inv.amount || 0;
    return sum;
  }, {});

  const createInvoiceMutation = useMutation({
    mutationFn: (data) => base44.entities.Invoice.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setShowForm(false);
      setFormData({
        contractor_name: '',
        invoice_number: '',
        payer: DEFAULT_INVOICE_PAYER,
        amount: '',
        currency: 'PLN',
        issue_date: '',
        payment_deadline: '',
        status: 'unpaid'
      });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const dup = findDuplicateInvoice(invoices, { invoice_number: formData.invoice_number });
    if (dup) {
      toast.error(`Faktura o numerze „${formData.invoice_number}” już istnieje w systemie.`);
      return;
    }
    createInvoiceMutation.mutate({
      invoice_number: formData.invoice_number,
      seller_name: formData.contractor_name,
      contractor_name: formData.payer || DEFAULT_INVOICE_PAYER,
      payer: formData.payer || DEFAULT_INVOICE_PAYER,
      amount: parseFloat(formData.amount),
      currency: formData.currency,
      issue_date: formData.issue_date,
      payment_deadline: formData.payment_deadline,
      status: formData.status,
      invoice_type: "purchase",
      category: "standard",
    });
  };

  return (
    <div className="w-full p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Transport</h1>
            <p className="text-muted-foreground">Faktury od kontrahentów transportowych</p>
          </div>
          <Button onClick={() => setShowForm(!showForm)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" />
            Dodaj fakturę
          </Button>
        </div>

        {showForm && (
          <Card className="bg-background shadow-lg mb-6">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Nowa faktura transportowa</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Przewoźnik (sprzedawca na fakturze) *</Label>
                    <Input
                      required
                      value={formData.contractor_name}
                      onChange={(e) => setFormData({...formData, contractor_name: e.target.value})}
                      placeholder="Nazwa firmy"
                    />
                  </div>
                  <div>
                    <Label>Numer faktury *</Label>
                    <Input
                      required
                      value={formData.invoice_number}
                      onChange={(e) => setFormData({...formData, invoice_number: e.target.value})}
                      placeholder="FV/2024/001"
                    />
                  </div>
                  <div>
                    <Label>Płatnik</Label>
                    <Input
                      value={formData.payer}
                      onChange={(e) => setFormData({...formData, payer: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Kwota *</Label>
                    <Input
                      required
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({...formData, amount: e.target.value})}
                      placeholder="1000.00"
                    />
                  </div>
                  <div>
                    <Label>Waluta</Label>
                    <select
                      className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      value={formData.currency}
                      onChange={(e) => setFormData({...formData, currency: e.target.value})}
                    >
                      <option value="PLN">PLN</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                  <div>
                    <Label>Data wystawienia</Label>
                    <Input
                      type="date"
                      value={formData.issue_date}
                      onChange={(e) => setFormData({...formData, issue_date: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Termin płatności</Label>
                    <Input
                      type="date"
                      value={formData.payment_deadline}
                      onChange={(e) => setFormData({...formData, payment_deadline: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <select
                      className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                    >
                      <option value="unpaid">Nieopłacono</option>
                      <option value="paid">Opłacono</option>
                      <option value="overdue">Przeterminowano</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    Anuluj
                  </Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                    Dodaj
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="bg-background shadow-lg mb-6">
          <CardContent className="pt-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Szukaj po firmie lub numerze faktury..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-background shadow-lg mb-6">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa firmy</TableHead>
                  <TableHead>Numer faktury</TableHead>
                  <TableHead>Płatnik</TableHead>
                  <TableHead>Data wystawienia</TableHead>
                  <TableHead>Termin płatności</TableHead>
                  <TableHead>Kwota</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">Ładowanie...</TableCell>
                  </TableRow>
                ) : filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                      <Truck className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      Brak faktur transportowych
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{displayInvoiceSeller(inv)}</TableCell>
                      <TableCell>{inv.invoice_number}</TableCell>
                      <TableCell className="text-slate-600">{inv.payer || '-'}</TableCell>
                      <TableCell>
                        {inv.issue_date ? new Date(inv.issue_date).toLocaleDateString('pl-PL') : '-'}
                      </TableCell>
                      <TableCell>
                        {inv.payment_deadline ? new Date(inv.payment_deadline).toLocaleDateString('pl-PL') : '-'}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {inv.amount?.toFixed(2)} {inv.currency}
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          inv.status === 'paid' ? 'bg-green-100 text-green-800' :
                          inv.status === 'overdue' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }>
                          {inv.status === 'paid' ? 'Opłacono' : 
                           inv.status === 'overdue' ? 'Przeterminowano' : 'Nieopłacono'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {filteredInvoices.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-blue-50">
              <CardContent className="pt-6">
                <p className="text-sm text-blue-600">Łączna liczba faktur</p>
                <p className="text-2xl font-bold text-blue-900">{filteredInvoices.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50">
              <CardContent className="pt-6">
                <p className="text-sm text-green-600">Łączna kwota</p>
                <div className="text-2xl font-bold text-green-900">
                  {Object.entries(totalAmount).map(([currency, sum]) => (
                    <div key={currency}>{sum.toFixed(2)} {currency}</div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}