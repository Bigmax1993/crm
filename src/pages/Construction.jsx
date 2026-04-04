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
import { Textarea } from '@/components/ui/textarea';
import { Search, Plus, X, Trash2, Loader2, Building, Pencil, Image as ImageIcon, Upload as UploadIcon } from 'lucide-react';
import { ConstructionOffersAi } from '@/components/ai/ConstructionOffersAi';
import { CityGeocodeInput } from '@/components/construction/CityGeocodeInput';
import { OFFER_SEGMENT_OPTIONS, offerSegmentLabel } from '@/lib/offer-segments';
import { getSiteExtension, patchSiteExtension } from '@/lib/crm-local-store';
import { getUploadFilePublicUrl } from '@/lib/upload-file-url';

function emptyLocalMeta() {
  return {
    offer_segment: '',
    norms_note: '',
    certifications: [],
    subsidy: { program: '', stage: '', deadline: '', amount_pln: '', notes: '' },
  };
}

function normalizeExtension(ext) {
  if (!ext) return {};
  const certifications = (ext.certifications || []).map((c) => {
    const { _rowId, ...rest } = c;
    return rest;
  });
  return { ...ext, certifications };
}

/** API może zwracać null — kontrolowane pola formularza muszą być stringami (unikamy value={null} na input). */
function siteRowToFormData(site) {
  const s = (v) => (v == null ? "" : String(v));
  return {
    city: s(site.city),
    object_name: s(site.object_name),
    postal_code: s(site.postal_code),
    settlement_period: s(site.settlement_period),
    invoice_numbers: s(site.invoice_numbers),
    invoice_count: site.invoice_count != null && site.invoice_count !== "" ? String(site.invoice_count) : "",
    status: site.status || "aktywny",
    notes: s(site.notes),
    photo_documentation: s(site.photo_documentation),
    budget_planned:
      site.budget_planned != null && site.budget_planned !== "" ? String(site.budget_planned) : "",
    latitude: site.latitude != null && site.latitude !== "" ? String(site.latitude) : "",
    longitude: site.longitude != null && site.longitude !== "" ? String(site.longitude) : "",
    client_name: s(site.client_name),
    workflow_status: site.workflow_status || "realizacja",
    payment_schedule: s(site.payment_schedule),
    project_match_keywords: s(site.project_match_keywords),
  };
}

export default function Construction() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [localMeta, setLocalMeta] = useState(() => emptyLocalMeta());
  const [formData, setFormData] = useState({
    city: '',
    object_name: '',
    postal_code: '',
    settlement_period: '',
    invoice_numbers: '',
    invoice_count: '',
    status: 'aktywny',
    notes: '',
    photo_documentation: '',
    budget_planned: '',
    latitude: '',
    longitude: '',
    client_name: '',
    workflow_status: 'realizacja',
    payment_schedule: '',
    project_match_keywords: '',
  });
  const queryClient = useQueryClient();

  const { data: sites = [], isLoading } = useQuery({
    queryKey: ['construction-sites'],
    queryFn: () => base44.entities.ConstructionSite.list('-created_date'),
  });

  const createMutation = useMutation({
    mutationFn: async ({ data, extension }) => {
      const created = await base44.entities.ConstructionSite.create(data);
      if (created?.id) patchSiteExtension(created.id, normalizeExtension(extension));
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['construction-sites']);
      setShowForm(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, extension }) => {
      await base44.entities.ConstructionSite.update(id, data);
      if (id) patchSiteExtension(id, normalizeExtension(extension));
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['construction-sites']);
      setShowForm(false);
      setEditingId(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ConstructionSite.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['construction-sites']),
  });

  const resetForm = () => {
    setLocalMeta(emptyLocalMeta());
    setFormData({
      city: '',
      object_name: '',
      postal_code: '',
      settlement_period: '',
      invoice_numbers: '',
      invoice_count: '',
      status: 'aktywny',
      notes: '',
      photo_documentation: '',
      budget_planned: '',
      latitude: '',
      longitude: '',
    client_name: '',
    workflow_status: 'realizacja',
    payment_schedule: '',
    project_match_keywords: '',
    });
  };

  const filteredSites = sites.filter(site => {
    const searchLower = search.toLowerCase();
    const seg = offerSegmentLabel(getSiteExtension(site.id).offer_segment).toLowerCase();
    return (
      site.city?.toLowerCase().includes(searchLower) ||
      site.object_name?.toLowerCase().includes(searchLower) ||
      site.postal_code?.toLowerCase().includes(searchLower) ||
      seg.includes(searchLower)
    );
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...formData,
      invoice_count: formData.invoice_count ? parseInt(formData.invoice_count) : null,
      budget_planned: formData.budget_planned ? parseFloat(formData.budget_planned) : null,
      latitude: formData.latitude !== '' && formData.latitude != null ? parseFloat(formData.latitude) : null,
      longitude: formData.longitude !== '' && formData.longitude != null ? parseFloat(formData.longitude) : null,
    };
    
    if (editingId) {
      updateMutation.mutate({ id: editingId, data, extension: localMeta });
    } else {
      createMutation.mutate({ data, extension: localMeta });
    }
  };

  const handleEdit = (site) => {
    setFormData(siteRowToFormData(site));
    setEditingId(site.id);
    const ext = getSiteExtension(site.id);
    setLocalMeta({
      offer_segment: ext.offer_segment || '',
      norms_note: ext.norms_note || '',
      certifications: Array.isArray(ext.certifications) ? [...ext.certifications] : [],
      subsidy: { ...emptyLocalMeta().subsidy, ...(ext.subsidy || {}) },
    });
    setShowForm(true);
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const uploadRes = await base44.integrations.Core.UploadFile({ file: reader.result });
      const url = getUploadFilePublicUrl(uploadRes);
      if (url) setFormData({ ...formData, photo_documentation: url });
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="w-full p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Budowa</h1>
            <p className="text-muted-foreground">Zarządzaj obiektami budowlanymi</p>
          </div>
          <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" /> Dodaj obiekt
          </Button>
        </div>

        {showForm && (
          <Card className="bg-background shadow-lg mb-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{editingId ? 'Edytuj obiekt budowlany' : 'Nowy obiekt budowlany'}</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => { setShowForm(false); setEditingId(null); resetForm(); }}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <CityGeocodeInput
                      id="construction-site-city"
                      city={formData.city}
                      latitude={formData.latitude}
                      longitude={formData.longitude}
                      onPatch={(partial) => setFormData((prev) => ({ ...prev, ...partial }))}
                      disabled={createMutation.isPending || updateMutation.isPending}
                    />
                  </div>
                  <div>
                    <Label>Obiekt *</Label>
                    <Input
                      value={formData.object_name}
                      onChange={(e) => setFormData({ ...formData, object_name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Kod pocztowy</Label>
                    <Input
                      value={formData.postal_code}
                      onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                      placeholder="00-000"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Klient (inwestor)</Label>
                    <Input
                      value={formData.client_name}
                      onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                      placeholder="Nazwa klienta"
                    />
                  </div>
                  <div>
                    <Label>Budżet planowany (PLN)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.budget_planned}
                      onChange={(e) => setFormData({ ...formData, budget_planned: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Status workflow</Label>
                    <Select value={formData.workflow_status} onValueChange={(v) => setFormData({ ...formData, workflow_status: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="oferta">Oferta</SelectItem>
                        <SelectItem value="zlecenie">Zlecenie</SelectItem>
                        <SelectItem value="realizacja">Realizacja</SelectItem>
                        <SelectItem value="odbior">Odbiór</SelectItem>
                        <SelectItem value="faktura">Faktura</SelectItem>
                        <SelectItem value="zaplacono">Zapłacono</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Szer. geogr. (lat)</Label>
                    <Input
                      type="number"
                      step="any"
                      value={formData.latitude}
                      onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                      placeholder="np. 52.2297"
                    />
                  </div>
                  <div>
                    <Label>Dł. geogr. (lng)</Label>
                    <Input
                      type="number"
                      step="any"
                      value={formData.longitude}
                      onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                      placeholder="np. 21.0122"
                    />
                  </div>
                  <div>
                    <Label>Okres rozliczenia</Label>
                    <Input
                      value={formData.settlement_period}
                      onChange={(e) => setFormData({ ...formData, settlement_period: e.target.value })}
                      placeholder="01/2026"
                    />
                  </div>
                  <div>
                    <Label>Ilość faktur</Label>
                    <Input
                      type="number"
                      value={formData.invoice_count}
                      onChange={(e) => setFormData({ ...formData, invoice_count: e.target.value })}
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
                        <SelectItem value="zakończony">Zakończony</SelectItem>
                        <SelectItem value="zawieszony">Zawieszony</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Numery faktur / zamówienia</Label>
                  <Textarea
                    value={formData.invoice_numbers}
                    onChange={(e) => setFormData({ ...formData, invoice_numbers: e.target.value })}
                    placeholder="Numery FV lub zamówienia (dopasowanie przy imporcie)"
                    className="h-20"
                  />
                </div>
                <div>
                  <Label>Słowa kluczowe → projekt (import faktur)</Label>
                  <Textarea
                    value={formData.project_match_keywords}
                    onChange={(e) => setFormData({ ...formData, project_match_keywords: e.target.value })}
                    placeholder="Po przecinku lub nowej linii; dopasowanie do opisu / JSON pozycji / nr zamówienia (bez rozróżniania wielkości liter)"
                    className="h-20 text-sm"
                  />
                </div>
                <div>
                  <Label>Harmonogram płatności (JSON)</Label>
                  <Textarea
                    value={formData.payment_schedule}
                    onChange={(e) => setFormData({ ...formData, payment_schedule: e.target.value })}
                    placeholder='[{"etap":"Etap 1","data":"2026-04-01","kwota":10000}]'
                    className="h-24 font-mono text-sm"
                  />
                </div>
                <div>
                  <Label>Uwagi</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="h-24"
                  />
                </div>

                <div className="rounded-lg border border-primary/20 bg-background p-4 space-y-4">
                  <p className="text-sm font-semibold text-foreground">Segment oferty i zgodność</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Segment oferty</Label>
                      <Select
                        value={localMeta.offer_segment || '__none'}
                        onValueChange={(v) => setLocalMeta({ ...localMeta, offer_segment: v === '__none' ? '' : v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">— nie wybrano —</SelectItem>
                          {OFFER_SEGMENT_OPTIONS.filter((o) => o.value).map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <Label>Normy / certyfikacje (notatka)</Label>
                      <Textarea
                        value={localMeta.norms_note}
                        onChange={(e) => setLocalMeta({ ...localMeta, norms_note: e.target.value })}
                        placeholder="np. PZLA, FIFA, plan certyfikacji…"
                        className="h-20 text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground">Certyfikaty / atesty</Label>
                    {(localMeta.certifications || []).map((c, idx) => (
                      <div key={c._rowId || idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border rounded-md p-2 bg-background">
                        <div className="md:col-span-3">
                          <Label className="text-xs">Nazwa</Label>
                          <Input
                            value={c.name || ''}
                            onChange={(e) => {
                              const next = [...localMeta.certifications];
                              next[idx] = { ...next[idx], name: e.target.value };
                              setLocalMeta({ ...localMeta, certifications: next });
                            }}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-xs">Typ / norma</Label>
                          <Input
                            value={c.norm_type || ''}
                            onChange={(e) => {
                              const next = [...localMeta.certifications];
                              next[idx] = { ...next[idx], norm_type: e.target.value };
                              setLocalMeta({ ...localMeta, certifications: next });
                            }}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-xs">Ważny do</Label>
                          <Input
                            type="date"
                            value={c.expiry_date || ''}
                            onChange={(e) => {
                              const next = [...localMeta.certifications];
                              next[idx] = { ...next[idx], expiry_date: e.target.value };
                              setLocalMeta({ ...localMeta, certifications: next });
                            }}
                          />
                        </div>
                        <div className="md:col-span-4">
                          <Label className="text-xs">URL załącznika</Label>
                          <Input
                            value={c.attachment_url || ''}
                            onChange={(e) => {
                              const next = [...localMeta.certifications];
                              next[idx] = { ...next[idx], attachment_url: e.target.value };
                              setLocalMeta({ ...localMeta, certifications: next });
                            }}
                          />
                        </div>
                        <div className="md:col-span-1 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const next = localMeta.certifications.filter((_, i) => i !== idx);
                              setLocalMeta({ ...localMeta, certifications: next });
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setLocalMeta({
                          ...localMeta,
                          certifications: [
                            ...(localMeta.certifications || []),
                            { _rowId: `c_${Date.now()}`, name: '', norm_type: '', expiry_date: '', attachment_url: '', notes: '' },
                          ],
                        })
                      }
                    >
                      <Plus className="h-4 w-4 mr-1" /> Dodaj certyfikat / atest
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t pt-3">
                    <p className="md:col-span-2 text-xs font-medium text-muted-foreground">Dofinansowanie</p>
                    <div>
                      <Label className="text-xs">Program</Label>
                      <Input
                        value={localMeta.subsidy.program}
                        onChange={(e) =>
                          setLocalMeta({ ...localMeta, subsidy: { ...localMeta.subsidy, program: e.target.value } })
                        }
                        placeholder="np. ORLIK, Sportowa Polska…"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Etap</Label>
                      <Input
                        value={localMeta.subsidy.stage}
                        onChange={(e) =>
                          setLocalMeta({ ...localMeta, subsidy: { ...localMeta.subsidy, stage: e.target.value } })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Termin / deadlin</Label>
                      <Input
                        type="date"
                        value={localMeta.subsidy.deadline || ''}
                        onChange={(e) =>
                          setLocalMeta({ ...localMeta, subsidy: { ...localMeta.subsidy, deadline: e.target.value } })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Kwota (PLN)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={localMeta.subsidy.amount_pln}
                        onChange={(e) =>
                          setLocalMeta({ ...localMeta, subsidy: { ...localMeta.subsidy, amount_pln: e.target.value } })
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Notatki dofinansowania</Label>
                      <Textarea
                        value={localMeta.subsidy.notes}
                        onChange={(e) =>
                          setLocalMeta({ ...localMeta, subsidy: { ...localMeta.subsidy, notes: e.target.value } })
                        }
                        className="h-16 text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div>
                   <Label>Dokumentacja fotograficzna</Label>
                   <div className="flex gap-2 items-end">
                     <div className="flex-1">
                       <div className="relative border border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                         <input
                           type="file"
                           accept="image/*"
                           onChange={handlePhotoUpload}
                           className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                         />
                         <div className="flex flex-col items-center">
                           {formData.photo_documentation ? (
                             <>
                               <ImageIcon className="h-6 w-6 text-green-600 mb-2" />
                               <span className="text-sm text-green-600 font-medium">Zdjęcie wgrane</span>
                             </>
                           ) : (
                             <>
                               <UploadIcon className="h-6 w-6 text-slate-400 mb-2" />
                               <span className="text-sm text-slate-600">Kliknij, aby wgrać zdjęcie</span>
                             </>
                           )}
                         </div>
                       </div>
                     </div>
                     {formData.photo_documentation && (
                       <Button
                         type="button"
                         variant="ghost"
                         size="sm"
                         onClick={() => setFormData({ ...formData, photo_documentation: '' })}
                       >
                         Usuń
                       </Button>
                     )}
                   </div>
                </div>
                <div className="flex gap-3 justify-end">
                   <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); resetForm(); }}>
                     Anuluj
                   </Button>
                   <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                     {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                     {editingId ? 'Aktualizuj obiekt' : 'Dodaj obiekt'}
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
                placeholder="Szukaj po mieście, obiekcie, kodzie..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        <ConstructionOffersAi sites={sites} />

        <Card className="bg-background shadow-lg">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Miasto</TableHead>
                    <TableHead>Obiekt</TableHead>
                    <TableHead>Segment oferty</TableHead>
                    <TableHead>Kod pocztowy</TableHead>
                    <TableHead>Okres rozliczenia</TableHead>
                    <TableHead>Ilość faktur</TableHead>
                    <TableHead>Numery faktur</TableHead>
                    <TableHead>Uwagi</TableHead>
                    <TableHead>Dokumentacja fotograficzna</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8">Ładowanie...</TableCell>
                    </TableRow>
                  ) : filteredSites.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8 text-slate-500">
                        <Building className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                        Brak obiektów budowlanych
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSites.map(site => (
                      <TableRow key={site.id}>
                        <TableCell className="font-medium">{site.city}</TableCell>
                        <TableCell className="font-medium">{site.object_name}</TableCell>
                        <TableCell className="text-sm max-w-[180px]">
                          {offerSegmentLabel(getSiteExtension(site.id).offer_segment)}
                        </TableCell>
                        <TableCell>{site.postal_code || '-'}</TableCell>
                        <TableCell>{site.settlement_period || '-'}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{site.invoice_count || 0}</Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {site.invoice_numbers || '-'}
                        </TableCell>
                        <TableCell className="max-w-xs">
                           {site.notes ? (
                             <span className="text-sm text-slate-600 line-clamp-2">{site.notes}</span>
                           ) : (
                             <span className="text-slate-400">-</span>
                           )}
                         </TableCell>
                         <TableCell>
                           {site.photo_documentation ? (
                             <a href={site.photo_documentation} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 flex items-center gap-2">
                               <ImageIcon className="h-4 w-4" />
                               <span className="text-sm">Otwórz</span>
                             </a>
                           ) : (
                             <span className="text-slate-400">-</span>
                           )}
                         </TableCell>
                         <TableCell>
                          <Badge className={
                            site.status === 'aktywny' ? 'bg-green-100 text-green-800' :
                            site.status === 'zakończony' ? 'bg-gray-100 text-gray-800' :
                            'bg-yellow-100 text-yellow-800'
                          }>
                            {site.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                           <div className="flex gap-2">
                             <Button
                               variant="ghost"
                               size="icon"
                               onClick={() => handleEdit(site)}
                             >
                               <Pencil className="h-4 w-4 text-blue-500" />
                             </Button>
                             <Button
                               variant="ghost"
                               size="icon"
                               onClick={() => {
                                 if (confirm('Czy na pewno chcesz usunąć ten obiekt?')) {
                                   deleteMutation.mutate(site.id);
                                 }
                               }}
                             >
                               <Trash2 className="h-4 w-4 text-red-500" />
                             </Button>
                           </div>
                         </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {filteredSites.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-blue-50">
              <CardContent className="pt-6">
                <p className="text-sm text-blue-600">Łączna liczba obiektów</p>
                <p className="text-2xl font-bold text-blue-900">{filteredSites.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50">
              <CardContent className="pt-6">
                <p className="text-sm text-green-600">Aktywne obiekty</p>
                <p className="text-2xl font-bold text-green-900">
                  {filteredSites.filter(s => s.status === 'aktywny').length}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-purple-50">
              <CardContent className="pt-6">
                <p className="text-sm text-purple-600">Suma faktur</p>
                <p className="text-2xl font-bold text-purple-900">
                  {filteredSites.reduce((sum, s) => sum + (s.invoice_count || 0), 0)}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}