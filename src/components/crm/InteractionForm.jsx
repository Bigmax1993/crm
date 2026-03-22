import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export default function InteractionForm({ contacts, onSubmit, onCancel, isLoading }) {
  const [formData, setFormData] = useState({
    type: 'note',
    subject: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    contact_id: '',
    follow_up_date: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-blue-50 rounded-lg mb-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Typ *</Label>
          <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="call">Telefon</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="meeting">Spotkanie</SelectItem>
              <SelectItem value="note">Notatka</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Data *</Label>
          <Input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Osoba kontaktowa</Label>
          <Select value={formData.contact_id} onValueChange={(v) => setFormData({ ...formData, contact_id: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Wybierz..." />
            </SelectTrigger>
            <SelectContent>
              {contacts.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Follow-up</Label>
          <Input
            type="date"
            value={formData.follow_up_date}
            onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })}
          />
        </div>
      </div>
      <div>
        <Label>Temat</Label>
        <Input
          value={formData.subject}
          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
        />
      </div>
      <div>
        <Label>Opis</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>
      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>Anuluj</Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Zapisz
        </Button>
      </div>
    </form>
  );
}