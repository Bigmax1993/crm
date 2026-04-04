import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Hotel, Users, MapPin, Calendar, Plus, X, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { invoiceNumberMatches } from '@/lib/duplicate-detection';
import { Checkbox } from '@/components/ui/checkbox';
import { displayInvoiceSeller } from '@/lib/invoice-schema';

export default function Hotels() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedHotels, setSelectedHotels] = useState([]);
  const [formData, setFormData] = useState({
    invoice_number: '',
    hotel_name: '',
    city: '',
    stay_period: '',
    check_in: '',
    check_out: '',
    persons_count: 1,
    amount: '',
    currency: 'PLN',
    status: 'unpaid',
    notes: ''
  });
  const queryClient = useQueryClient();

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => base44.entities.Invoice.list('-created_date'),
  });

  const { data: manualStays = [], isLoading: loadingStays } = useQuery({
    queryKey: ['hotelStays'],
    queryFn: () => base44.entities.HotelStay.list('-created_date'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.HotelStay.create({ ...data, source: 'manual' }),
    onSuccess: () => {
      queryClient.invalidateQueries(['hotelStays']);
      setShowForm(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.HotelStay.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['hotelStays']);
      setSelectedHotels([]);
    },
  });

  const deleteMultipleMutation = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) {
        await base44.entities.HotelStay.delete(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['hotelStays']);
      setSelectedHotels([]);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.HotelStay.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries(['hotelStays']);
    },
  });

  const resetForm = () => {
    setFormData({
      invoice_number: '',
      hotel_name: '',
      city: '',
      stay_period: '',
      check_in: '',
      check_out: '',
      persons_count: 1,
      amount: '',
      currency: 'PLN',
      status: 'unpaid',
      notes: ''
    });
  };

  const hotelInvoices = invoices.filter(inv => inv.category === 'hotel');

  // Połącz dane z faktur i ręczne wpisy
  const allHotels = [
    ...hotelInvoices.map(inv => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      hotel_name: inv.hotel_name || displayInvoiceSeller(inv),
      city: inv.city,
      stay_period: inv.stay_period,
      persons_count: inv.persons_count,
      amount: inv.amount,
      currency: inv.currency,
      status: inv.status,
      source: 'invoice'
    })),
    ...manualStays.map(stay => ({
      ...stay,
      source: 'manual'
    }))
  ];

  const filteredHotels = allHotels.filter(item => {
    const searchLower = search.toLowerCase();
    return (
      item.invoice_number?.toLowerCase().includes(searchLower) ||
      item.city?.toLowerCase().includes(searchLower) ||
      item.hotel_name?.toLowerCase().includes(searchLower)
    );
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const invNum = String(formData.invoice_number ?? '').trim();
    if (invNum) {
      if (manualStays.some((s) => invoiceNumberMatches(s.invoice_number, invNum))) {
        toast.error('Pobyt ręczny z tym numerem faktury już istnieje.');
        return;
      }
      if (hotelInvoices.some((inv) => invoiceNumberMatches(inv.invoice_number, invNum))) {
        toast.error('Ten numer faktury jest już na liście jako faktura hotelowa.');
        return;
      }
    }
    createMutation.mutate({
      ...formData,
      persons_count: parseInt(formData.persons_count),
      amount: formData.amount ? parseFloat(formData.amount) : null
    });
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedHotels(filteredHotels.map(item => `${item.source}-${item.id}`));
    } else {
      setSelectedHotels([]);
    }
  };

  const handleSelectHotel = (id, checked) => {
    if (checked) {
      setSelectedHotels([...selectedHotels, id]);
    } else {
      setSelectedHotels(selectedHotels.filter(h => h !== id));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedHotels.length === 0) return;
    if (confirm(`Czy na pewno chcesz usunąć ${selectedHotels.length} nocleg(ów)?`)) {
      deleteMultipleMutation.mutate(
        selectedHotels.map(id => {
          const [source, hotelId] = id.split('-');
          return hotelId;
        })
      );
    }
  };

  return (
    <div className="w-full p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Hotele dla pracowników</h1>
            <p className="text-muted-foreground">Przegląd noclegów z faktur i ręcznych wpisów</p>
          </div>
          <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" /> Dodaj nocleg
          </Button>
        </div>

        {showForm && (
          <Card className="bg-background shadow-lg mb-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Nowy nocleg</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => { setShowForm(false); resetForm(); }}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Nazwa hotelu *</Label>
                    <Input
                      value={formData.hotel_name}
                      onChange={(e) => setFormData({ ...formData, hotel_name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Miasto *</Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Numer faktury</Label>
                    <Input
                      value={formData.invoice_number}
                      onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label>Data zameldowania</Label>
                    <Input
                      type="date"
                      value={formData.check_in}
                      onChange={(e) => setFormData({ ...formData, check_in: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Data wymeldowania</Label>
                    <Input
                      type="date"
                      value={formData.check_out}
                      onChange={(e) => setFormData({ ...formData, check_out: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Okres pobytu</Label>
                    <Input
                      value={formData.stay_period}
                      onChange={(e) => setFormData({ ...formData, stay_period: e.target.value })}
                      placeholder="np. 01.02-05.02.2024"
                    />
                  </div>
                  <div>
                    <Label>Ilość osób *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={formData.persons_count}
                      onChange={(e) => setFormData({ ...formData, persons_count: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Kwota</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Waluta</Label>
                    <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PLN">PLN</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unpaid">Nieopłacono</SelectItem>
                        <SelectItem value="paid">Opłacono</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
                    Anuluj
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                    {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Dodaj nocleg
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="bg-background shadow-lg mb-6">
           <CardContent className="pt-6">
             <div className="flex gap-4 flex-wrap items-center">
               <div className="flex-1 min-w-64 relative">
                 <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                 <Input
                   placeholder="Szukaj po mieście, hotelu, numerze faktury..."
                   value={search}
                   onChange={(e) => setSearch(e.target.value)}
                   className="pl-10"
                 />
               </div>
               {selectedHotels.length > 0 && (
                 <Button
                   onClick={handleDeleteSelected}
                   variant="destructive"
                   disabled={deleteMultipleMutation.isPending}
                 >
                   <Trash2 className="mr-2 h-4 w-4" />
                   Usuń zaznaczone ({selectedHotels.length})
                 </Button>
               )}
             </div>
           </CardContent>
         </Card>

        <Card className="bg-background shadow-lg">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedHotels.length === filteredHotels.length && filteredHotels.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Numer faktury</TableHead>
                  <TableHead>Hotel</TableHead>
                  <TableHead>Miasto</TableHead>
                  <TableHead>Okres pobytu</TableHead>
                  <TableHead>Ilość osób</TableHead>
                  <TableHead>Kwota</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingStays ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">Ładowanie...</TableCell>
                  </TableRow>
                ) : filteredHotels.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                      <Hotel className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      Brak noclegów
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredHotels.map(item => (
                    <TableRow key={`${item.source}-${item.id}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedHotels.includes(`${item.source}-${item.id}`)}
                          onCheckedChange={(checked) => handleSelectHotel(`${item.source}-${item.id}`, checked)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {item.invoice_number || '-'}
                        {item.source === 'manual' && (
                          <Badge variant="outline" className="ml-2 text-xs">ręczny</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Hotel className="h-4 w-4 text-slate-400" />
                          {item.hotel_name || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-slate-400" />
                          {item.city || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-slate-400" />
                          {item.stay_period || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-slate-400" />
                          {item.persons_count || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {item.amount ? `${item.amount.toFixed(2)} ${item.currency}` : '-'}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.status}
                          onValueChange={(value) => {
                            if (item.source === 'manual') {
                              updateStatusMutation.mutate({ id: item.id, status: value });
                            } else {
                              // Update invoice status
                              base44.entities.Invoice.update(item.id, { status: value }).then(() => {
                                queryClient.invalidateQueries(['invoices']);
                              });
                            }
                          }}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unpaid">Nieopłacono</SelectItem>
                            <SelectItem value="paid">Opłacono</SelectItem>
                            <SelectItem value="partially_paid">Częściowo opłacono</SelectItem>
                            <SelectItem value="overdue">Przeterminowano</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {item.source === 'manual' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm('Czy na pewno chcesz usunąć ten wpis?')) {
                                deleteMutation.mutate(item.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {filteredHotels.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-blue-50">
              <CardContent className="pt-6">
                <p className="text-sm text-blue-600">Łączna liczba noclegów</p>
                <p className="text-2xl font-bold text-blue-900">{filteredHotels.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50">
              <CardContent className="pt-6">
                <p className="text-sm text-green-600">Łączna kwota</p>
                <div className="text-2xl font-bold text-green-900">
                  {(() => {
                    const sumsByCurrency = filteredHotels.reduce((acc, item) => {
                      const currency = item.currency || 'PLN';
                      acc[currency] = (acc[currency] || 0) + (item.amount || 0);
                      return acc;
                    }, {});
                    return Object.entries(sumsByCurrency).map(([currency, sum]) => (
                      <div key={currency}>{sum.toFixed(2)} {currency}</div>
                    ));
                  })()}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-purple-50">
              <CardContent className="pt-6">
                <p className="text-sm text-purple-600">Łączna liczba osób</p>
                <p className="text-2xl font-bold text-purple-900">
                  {filteredHotels.reduce((sum, item) => sum + (item.persons_count || 0), 0)}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}