import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, X, Trash2, Loader2, Users } from 'lucide-react';
import { format } from 'date-fns';

export default function Employees() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    employment_start: '',
    employment_end: '',
    contract_type: 'umowa o pracę',
    rate: '',
    rate_type: 'miesięczna',
    position: '',
    status: 'aktywny'
  });
  const queryClient = useQueryClient();

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list('-created_date'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Employee.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['employees']);
      setShowForm(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Employee.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['employees']),
  });

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      employment_start: '',
      employment_end: '',
      contract_type: 'umowa o pracę',
      rate: '',
      rate_type: 'miesięczna',
      position: '',
      status: 'aktywny'
    });
  };

  const filteredEmployees = employees.filter(emp => {
    const searchLower = search.toLowerCase();
    return (
      emp.first_name?.toLowerCase().includes(searchLower) ||
      emp.last_name?.toLowerCase().includes(searchLower) ||
      emp.position?.toLowerCase().includes(searchLower)
    );
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      rate: parseFloat(formData.rate)
    });
  };

  const getEmploymentPeriod = (emp) => {
    const start = emp.employment_start ? format(new Date(emp.employment_start), 'dd.MM.yyyy') : '-';
    const end = emp.employment_end ? format(new Date(emp.employment_end), 'dd.MM.yyyy') : 'obecnie';
    return `${start} - ${end}`;
  };

  return (
    <div className="w-full p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Pracownicy</h1>
            <p className="text-muted-foreground">Zarządzaj danymi pracowników</p>
          </div>
          <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" /> Dodaj pracownika
          </Button>
        </div>

        {showForm && (
          <Card className="bg-white shadow-lg mb-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Nowy pracownik</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => { setShowForm(false); resetForm(); }}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Imię *</Label>
                    <Input
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Nazwisko *</Label>
                    <Input
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Data rozpoczęcia zatrudnienia *</Label>
                    <Input
                      type="date"
                      value={formData.employment_start}
                      onChange={(e) => setFormData({ ...formData, employment_start: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Data zakończenia zatrudnienia</Label>
                    <Input
                      type="date"
                      value={formData.employment_end}
                      onChange={(e) => setFormData({ ...formData, employment_end: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Rodzaj umowy *</Label>
                    <Select value={formData.contract_type} onValueChange={(v) => setFormData({ ...formData, contract_type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="umowa o pracę">Umowa o pracę</SelectItem>
                        <SelectItem value="umowa zlecenie">Umowa zlecenie</SelectItem>
                        <SelectItem value="umowa o dzieło">Umowa o dzieło</SelectItem>
                        <SelectItem value="B2B">B2B</SelectItem>
                        <SelectItem value="kontrakt">Kontrakt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Stawka *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.rate}
                      onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Typ stawki</Label>
                    <Select value={formData.rate_type} onValueChange={(v) => setFormData({ ...formData, rate_type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="godzinowa">Godzinowa</SelectItem>
                        <SelectItem value="miesięczna">Miesięczna</SelectItem>
                        <SelectItem value="projektowa">Projektowa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Stanowisko</Label>
                    <Input
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aktywny">Aktywny</SelectItem>
                        <SelectItem value="nieaktywny">Nieaktywny</SelectItem>
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
                    Dodaj pracownika
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="bg-white shadow-lg mb-6">
          <CardContent className="pt-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Szukaj po imieniu, nazwisku, stanowisku..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white shadow-lg">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Imię</TableHead>
                  <TableHead>Nazwisko</TableHead>
                  <TableHead>Stanowisko</TableHead>
                  <TableHead>Okres zatrudnienia</TableHead>
                  <TableHead>Rodzaj umowy</TableHead>
                  <TableHead>Stawka</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">Ładowanie...</TableCell>
                  </TableRow>
                ) : filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                      <Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      Brak pracowników
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEmployees.map(emp => (
                    <TableRow key={emp.id}>
                      <TableCell className="font-medium">{emp.first_name}</TableCell>
                      <TableCell className="font-medium">{emp.last_name}</TableCell>
                      <TableCell>{emp.position || '-'}</TableCell>
                      <TableCell>{getEmploymentPeriod(emp)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{emp.contract_type}</Badge>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {emp.rate?.toFixed(2)} PLN / {emp.rate_type}
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          emp.status === 'aktywny' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }>
                          {emp.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm('Czy na pewno chcesz usunąć tego pracownika?')) {
                              deleteMutation.mutate(emp.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {filteredEmployees.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-blue-50">
              <CardContent className="pt-6">
                <p className="text-sm text-blue-600">Łączna liczba pracowników</p>
                <p className="text-2xl font-bold text-blue-900">{filteredEmployees.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50">
              <CardContent className="pt-6">
                <p className="text-sm text-green-600">Aktywni pracownicy</p>
                <p className="text-2xl font-bold text-green-900">
                  {filteredEmployees.filter(e => e.status === 'aktywny').length}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-purple-50">
              <CardContent className="pt-6">
                <p className="text-sm text-purple-600">Nieaktywni pracownicy</p>
                <p className="text-2xl font-bold text-purple-900">
                  {filteredEmployees.filter(e => e.status === 'nieaktywny').length}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}