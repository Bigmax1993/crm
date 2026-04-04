import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Phone, Mail, MapPin, CreditCard, ArrowLeft, Plus, User, FileText, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import ContactForm from '@/components/crm/ContactForm';
import InteractionForm from '@/components/crm/InteractionForm';
import { displayInvoiceSeller } from '@/lib/invoice-schema';

export default function ContractorDetails() {
  const urlParams = new URLSearchParams(window.location.search);
  const contractorId = urlParams.get('id');
  const queryClient = useQueryClient();
  
  const [showContactForm, setShowContactForm] = useState(false);
  const [showInteractionForm, setShowInteractionForm] = useState(false);

  const { data: contractor, isLoading } = useQuery({
    queryKey: ['contractor', contractorId],
    queryFn: () => base44.entities.Contractor.filter({ id: contractorId }).then(res => res[0]),
    enabled: !!contractorId,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', contractorId],
    queryFn: () => base44.entities.Contact.filter({ contractor_id: contractorId }),
    enabled: !!contractorId,
  });

  const { data: interactions = [] } = useQuery({
    queryKey: ['interactions', contractorId],
    queryFn: () => base44.entities.Interaction.filter({ contractor_id: contractorId }, '-date'),
    enabled: !!contractorId,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => base44.entities.Invoice.list('-created_date'),
  });

  const cn = (contractor?.name || "").toLowerCase().trim();
  const contractorInvoices = invoices.filter((inv) => {
    const seller = (displayInvoiceSeller(inv) || "").toLowerCase();
    const buyer = (inv.contractor_name || "").toLowerCase();
    if (contractor?.type === "supplier") {
      return seller.includes(cn) || cn.includes(seller);
    }
    if (contractor?.type === "client") {
      return buyer.includes(cn) || cn.includes(buyer);
    }
    return (
      (seller && (seller.includes(cn) || cn.includes(seller))) ||
      (buyer && (buyer.includes(cn) || cn.includes(buyer)))
    );
  });

  const createContactMutation = useMutation({
    mutationFn: (data) => base44.entities.Contact.create({ ...data, contractor_id: contractorId }),
    onSuccess: () => {
      queryClient.invalidateQueries(['contacts', contractorId]);
      setShowContactForm(false);
    },
  });

  const createInteractionMutation = useMutation({
    mutationFn: (data) => base44.entities.Interaction.create({ ...data, contractor_id: contractorId }),
    onSuccess: () => {
      queryClient.invalidateQueries(['interactions', contractorId]);
      setShowInteractionForm(false);
    },
  });

  const typeColors = {
    call: 'bg-green-100 text-green-800',
    email: 'bg-blue-100 text-blue-800',
    meeting: 'bg-purple-100 text-purple-800',
    note: 'bg-gray-100 text-gray-800',
    invoice: 'bg-yellow-100 text-yellow-800',
    payment: 'bg-emerald-100 text-emerald-800'
  };

  const typeLabels = {
    call: 'Telefon',
    email: 'Email',
    meeting: 'Spotkanie',
    note: 'Notatka',
    invoice: 'Faktura',
    payment: 'Płatność'
  };

  if (isLoading) {
    return <div className="w-full p-6 flex min-h-[50vh] items-center justify-center text-muted-foreground">Ładowanie...</div>;
  }

  if (!contractor) {
    return <div className="w-full p-6 flex min-h-[50vh] items-center justify-center text-muted-foreground">Nie znaleziono kontrahenta</div>;
  }

  return (
    <div className="w-full p-6">
      <div className="max-w-7xl mx-auto">
        <Link to={createPageUrl('Contractors')} className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" /> Powrót do listy
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <Card className="lg:col-span-2 bg-background shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Building2 className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-2xl">{contractor.name}</CardTitle>
                  {contractor.short_name && <p className="text-slate-500">{contractor.short_name}</p>}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {contractor.nip && (
                  <div>
                    <p className="text-sm text-slate-500">NIP</p>
                    <p className="font-mono">{contractor.nip}</p>
                  </div>
                )}
                {contractor.city && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-slate-400 mt-1" />
                    <div>
                      <p className="text-sm text-slate-500">Adres</p>
                      <p>{contractor.address}</p>
                      <p>{contractor.postal_code} {contractor.city}</p>
                    </div>
                  </div>
                )}
                {contractor.phone && (
                  <div className="flex items-start gap-2">
                    <Phone className="h-4 w-4 text-slate-400 mt-1" />
                    <div>
                      <p className="text-sm text-slate-500">Telefon</p>
                      <a href={`tel:${contractor.phone}`} className="text-blue-600 hover:underline">{contractor.phone}</a>
                    </div>
                  </div>
                )}
                {contractor.email && (
                  <div className="flex items-start gap-2">
                    <Mail className="h-4 w-4 text-slate-400 mt-1" />
                    <div>
                      <p className="text-sm text-slate-500">Email</p>
                      <a href={`mailto:${contractor.email}`} className="text-blue-600 hover:underline">{contractor.email}</a>
                    </div>
                  </div>
                )}
                {contractor.bank_account && (
                  <div className="flex items-start gap-2">
                    <CreditCard className="h-4 w-4 text-slate-400 mt-1" />
                    <div>
                      <p className="text-sm text-slate-500">Nr konta</p>
                      <p className="font-mono text-sm">{contractor.bank_account}</p>
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-sm text-slate-500">Termin płatności</p>
                  <p>{contractor.payment_terms || 14} dni</p>
                </div>
              </div>
              {contractor.notes && (
                <div className="mt-4 p-3 bg-background border border-border/60 rounded-lg">
                  <p className="text-sm text-slate-500">Notatki</p>
                  <p>{contractor.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-background shadow-lg">
            <CardHeader>
              <CardTitle>Statystyki</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-600">Liczba faktur</p>
                <p className="text-2xl font-bold text-blue-900">{contractorInvoices.length}</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-green-600">Suma faktur</p>
                <p className="text-2xl font-bold text-green-900">
                  {contractorInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0).toFixed(2)} PLN
                </p>
              </div>
              <div className="p-4 bg-yellow-50 rounded-lg">
                <p className="text-sm text-yellow-600">Nieopłacone</p>
                <p className="text-2xl font-bold text-yellow-900">
                  {contractorInvoices.filter(inv => inv.status === 'unpaid').length}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="contacts" className="space-y-4">
          <TabsList className="bg-background">
            <TabsTrigger value="contacts">
              <User className="h-4 w-4 mr-2" /> Kontakty ({contacts.length})
            </TabsTrigger>
            <TabsTrigger value="history">
              <MessageSquare className="h-4 w-4 mr-2" /> Historia ({interactions.length})
            </TabsTrigger>
            <TabsTrigger value="invoices">
              <FileText className="h-4 w-4 mr-2" /> Faktury ({contractorInvoices.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contacts">
            <Card className="bg-background shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Osoby kontaktowe</CardTitle>
                <Button size="sm" onClick={() => setShowContactForm(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Dodaj kontakt
                </Button>
              </CardHeader>
              <CardContent>
                {showContactForm && (
                  <ContactForm
                    onSubmit={createContactMutation.mutate}
                    onCancel={() => setShowContactForm(false)}
                    isLoading={createContactMutation.isPending}
                  />
                )}
                <div className="space-y-3">
                  {contacts.length === 0 ? (
                    <p className="text-slate-500 text-center py-4">Brak kontaktów</p>
                  ) : (
                    contacts.map(contact => (
                      <div key={contact.id} className="flex items-center justify-between p-4 bg-background border border-border/60 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-background rounded-full">
                            <User className="h-5 w-5 text-slate-400" />
                          </div>
                          <div>
                            <p className="font-medium">{contact.first_name} {contact.last_name}</p>
                            <p className="text-sm text-slate-500">{contact.position}</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          {contact.phone && (
                            <a href={`tel:${contact.phone}`} className="text-slate-500 hover:text-blue-600">
                              <Phone className="h-4 w-4" />
                            </a>
                          )}
                          {contact.email && (
                            <a href={`mailto:${contact.email}`} className="text-slate-500 hover:text-blue-600">
                              <Mail className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card className="bg-background shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Historia kontaktów</CardTitle>
                <Button size="sm" onClick={() => setShowInteractionForm(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Dodaj wpis
                </Button>
              </CardHeader>
              <CardContent>
                {showInteractionForm && (
                  <InteractionForm
                    contacts={contacts}
                    onSubmit={createInteractionMutation.mutate}
                    onCancel={() => setShowInteractionForm(false)}
                    isLoading={createInteractionMutation.isPending}
                  />
                )}
                <div className="space-y-3">
                  {interactions.length === 0 ? (
                    <p className="text-slate-500 text-center py-4">Brak historii</p>
                  ) : (
                    interactions.map(item => (
                      <div key={item.id} className="p-4 bg-background border border-border/60 rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <Badge className={typeColors[item.type]}>{typeLabels[item.type]}</Badge>
                          <span className="text-sm text-slate-500">
                            {item.date ? format(new Date(item.date), 'dd.MM.yyyy') : ''}
                          </span>
                        </div>
                        {item.subject && <p className="font-medium">{item.subject}</p>}
                        {item.description && <p className="text-sm text-slate-600 mt-1">{item.description}</p>}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices">
            <Card className="bg-background shadow-lg">
              <CardHeader>
                <CardTitle>Faktury kontrahenta</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {contractorInvoices.length === 0 ? (
                    <p className="text-slate-500 text-center py-4">Brak faktur</p>
                  ) : (
                    contractorInvoices.map(inv => (
                      <div key={inv.id} className="flex items-center justify-between p-4 bg-background border border-border/60 rounded-lg">
                        <div>
                          <p className="font-medium">{inv.invoice_number}</p>
                          <p className="text-sm text-slate-500">
                            {inv.issue_date ? format(new Date(inv.issue_date), 'dd.MM.yyyy') : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{inv.amount?.toFixed(2)} {inv.currency}</p>
                          <Badge className={
                            inv.status === 'paid' ? 'bg-green-100 text-green-800' :
                            inv.status === 'overdue' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }>
                            {inv.status === 'paid' ? 'Opłacono' : inv.status === 'overdue' ? 'Przeterminowano' : 'Nieopłacono'}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}