import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, X } from 'lucide-react';

export default function ContractorForm({ contractor, onSubmit, onCancel, isLoading }) {
  const [formData, setFormData] = useState(contractor || {
    name: '',
    short_name: '',
    nip: '',
    regon: '',
    address: '',
    city: '',
    postal_code: '',
    country: 'Polska',
    phone: '',
    email: '',
    website: '',
    bank_account: '',
    type: 'supplier',
    category: 'other',
    status: 'active',
    notes: '',
    payment_terms: 14
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Card className="bg-background shadow-lg mb-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{contractor ? 'Edytuj kontrahenta' : 'Nowy kontrahent'}</CardTitle>
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label>Nazwa firmy *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Skrócona nazwa</Label>
              <Input
                value={formData.short_name}
                onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>NIP</Label>
              <Input
                value={formData.nip}
                onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
              />
            </div>
            <div>
              <Label>Typ</Label>
              <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supplier">Dostawca</SelectItem>
                  <SelectItem value="client">Klient</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                  <SelectItem value="other">Inny</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kategoria</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="construction">Budowlana</SelectItem>
                  <SelectItem value="materials">Materiały</SelectItem>
                  <SelectItem value="services">Usługi</SelectItem>
                  <SelectItem value="hotel">Hotel</SelectItem>
                  <SelectItem value="transport">Transport</SelectItem>
                  <SelectItem value="other">Inna</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label>Adres</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div>
              <Label>Miasto</Label>
              <Input
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Telefon</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Termin płatności (dni)</Label>
              <Input
                type="number"
                value={formData.payment_terms}
                onChange={(e) => setFormData({ ...formData, payment_terms: parseInt(e.target.value) })}
              />
            </div>
          </div>

          <div>
            <Label>Numer konta bankowego</Label>
            <Input
              value={formData.bank_account}
              onChange={(e) => setFormData({ ...formData, bank_account: e.target.value })}
            />
          </div>

          <div>
            <Label>Notatki</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>
              Anuluj
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {contractor ? 'Zapisz zmiany' : 'Dodaj kontrahenta'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}