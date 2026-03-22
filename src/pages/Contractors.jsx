import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Building2, Phone, Mail, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import ContractorForm from '@/components/crm/ContractorForm';

export default function Contractors() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingContractor, setEditingContractor] = useState(null);
  const queryClient = useQueryClient();

  const { data: contractors = [], isLoading } = useQuery({
    queryKey: ['contractors'],
    queryFn: () => base44.entities.Contractor.list('-created_date'),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => base44.entities.Invoice.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Contractor.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['contractors']);
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Contractor.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['contractors']);
      setShowForm(false);
      setEditingContractor(null);
    },
  });

  const filteredContractors = contractors.filter(c => {
    const matchesSearch = 
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.nip?.includes(search) ||
      c.city?.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || c.type === typeFilter;
    const notKanbud = c.name?.toUpperCase() !== 'KANBUD';
    return matchesSearch && matchesType && notKanbud;
  });

  const getInvoiceStats = (contractorName) => {
    const contractorInvoices = invoices.filter(inv => 
      inv.contractor_name?.toLowerCase().includes(contractorName?.toLowerCase()) ||
      contractorName?.toLowerCase().includes(inv.contractor_name?.toLowerCase())
    );
    const total = contractorInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    const unpaid = contractorInvoices.filter(inv => inv.status === 'unpaid').length;
    return { count: contractorInvoices.length, total, unpaid };
  };

  const typeLabels = {
    supplier: 'Dostawca',
    client: 'Klient',
    partner: 'Partner',
    other: 'Inny'
  };

  const typeColors = {
    supplier: 'bg-blue-100 text-blue-800',
    client: 'bg-green-100 text-green-800',
    partner: 'bg-purple-100 text-purple-800',
    other: 'bg-gray-100 text-gray-800'
  };

  return (
    <div className="w-full p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Kontrahenci</h1>
            <p className="text-muted-foreground">Zarządzaj bazą kontrahentów</p>
          </div>
          <Button onClick={() => { setEditingContractor(null); setShowForm(true); }} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" /> Dodaj kontrahenta
          </Button>
        </div>

        {showForm && (
          <ContractorForm
            contractor={editingContractor}
            onSubmit={(data) => {
              if (editingContractor) {
                updateMutation.mutate({ id: editingContractor.id, data });
              } else {
                createMutation.mutate(data);
              }
            }}
            onCancel={() => { setShowForm(false); setEditingContractor(null); }}
            isLoading={createMutation.isPending || updateMutation.isPending}
          />
        )}

        <Card className="bg-white shadow-lg mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1 min-w-64">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Szukaj po nazwie, NIP, mieście..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Typ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie typy</SelectItem>
                  <SelectItem value="supplier">Dostawcy</SelectItem>
                  <SelectItem value="client">Klienci</SelectItem>
                  <SelectItem value="partner">Partnerzy</SelectItem>
                  <SelectItem value="other">Inne</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white shadow-lg">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>NIP</TableHead>
                  <TableHead>Miasto</TableHead>
                  <TableHead>Kontakt</TableHead>
                  <TableHead>Faktury</TableHead>
                  <TableHead>Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">Ładowanie...</TableCell>
                  </TableRow>
                ) : filteredContractors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">Brak kontrahentów</TableCell>
                  </TableRow>
                ) : (
                  filteredContractors.map(contractor => {
                    const stats = getInvoiceStats(contractor.name);
                    return (
                      <TableRow key={contractor.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-slate-400" />
                            <div>
                              <p className="font-medium">{contractor.name}</p>
                              {contractor.short_name && <p className="text-xs text-slate-500">{contractor.short_name}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={typeColors[contractor.type]}>
                            {typeLabels[contractor.type]}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{contractor.nip || '-'}</TableCell>
                        <TableCell>{contractor.city || '-'}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {contractor.phone && (
                              <a href={`tel:${contractor.phone}`} className="text-slate-500 hover:text-blue-600">
                                <Phone className="h-4 w-4" />
                              </a>
                            )}
                            {contractor.email && (
                              <a href={`mailto:${contractor.email}`} className="text-slate-500 hover:text-blue-600">
                                <Mail className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>{stats.count} faktur</p>
                            {stats.unpaid > 0 && (
                              <p className="text-red-600 text-xs">{stats.unpaid} nieopłaconych</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Link to={createPageUrl(`ContractorDetails?id=${contractor.id}`)}>
                              <Button variant="ghost" size="sm">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button variant="ghost" size="sm" onClick={() => { setEditingContractor(contractor); setShowForm(true); }}>
                              Edytuj
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}