import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import { Search, Plus, X, Trash2, Loader2, Building, Pencil, Image as ImageIcon, Upload as UploadIcon, MapPin, ExternalLink, Download } from 'lucide-react';
import { ConstructionOffersAi } from '@/components/ai/ConstructionOffersAi';
import { CityGeocodeInput } from '@/components/construction/CityGeocodeInput';
import { ProjectLogisticsChecklist } from '@/components/construction/ProjectLogisticsChecklist';
import { OFFER_SEGMENT_OPTIONS, offerSegmentLabel } from '@/lib/offer-segments';
import { getSiteExtension } from '@/lib/crm-local-store';
import { listSiteExtensions, patchSiteExtensionEntity, removeSiteExtensionEntity } from '@/lib/crm-entity-store';
import { logAuditEvent, AUDIT_ACTIONS } from '@/lib/audit-log';
import { getUploadFilePublicUrl } from '@/lib/upload-file-url';
import { resolveSiteGeocode, siteHasCoords } from '@/lib/site-geocode';
import { CONSTRUCTION_WORKFLOW_STATUSES, constructionWorkflowLabel, isActiveConstructionProject } from '@/lib/construction-workflow';
import {
  logisticsChecklistProgress,
  normalizeLogisticsChecklist,
} from '@/lib/project-logistics-checklist';
import { resolveStoredFileUrl, openStoredFile, downloadStoredFile } from "@/lib/resolve-stored-file-url";

const SITE_STATUS_OPTIONS = [
  { value: 'aktywny', label: 'Aktywny' },
  { value: 'zakończony', label: 'Zakończony' },
  { value: 'zawieszony', label: 'Zawieszony' },
];

function siteStatusSelectClass(status) {
  if (status === 'aktywny') return 'border-green-300 bg-green-50 text-green-800';
  if (status === 'zakończony') return 'border-slate-300 bg-slate-100 text-slate-800';
  return 'border-amber-300 bg-amber-50 text-amber-900';
}

function photoDownloadFilename(siteName) {
  const base = String(siteName || 'dokumentacja')
    .replace(/[^\w\-ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+/gi, '_')
    .replace(/_+/g, '_')
    .slice(0, 40);
  return `${base || 'dokumentacja'}_foto.jpg`;
}

/** Otwórz zdjęcie w nowej karcie. */
async function openPhotoDocumentation(url) {
  if (!url) return;
  await openStoredFile(url);
}

/** Pobierz zdjęcie (data URL, http lub IndexedDB). */
async function downloadPhotoDocumentation(url, filename) {
  if (!url) return;
  await downloadStoredFile(url, filename || "dokumentacja.jpg");
}

function emptyLocalMeta() {
  return {
    offer_segment: '',
    norms_note: '',
    certifications: [],
    subsidy: { program: '', stage: '', deadline: '', amount_pln: '', notes: '' },
    // Nowy obiekt: bez pełnej checklisty — wstawisz szablon przyciskiem (krótszy formularz).
    logistics_checklist: null,
  };
}

function normalizeExtension(ext) {
  if (!ext) return {};
  const certifications = (ext.certifications || []).map((c) => {
    const { _rowId, ...rest } = c;
    return rest;
  });
  return {
    ...ext,
    certifications,
    logistics_checklist: normalizeLogisticsChecklist(ext.logistics_checklist),
  };
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
    planned_date: s(site.planned_date).slice(0, 10),
    payment_schedule: s(site.payment_schedule),
    project_match_keywords: s(site.project_match_keywords),
  };
}

function extensionFromRow(row) {
  if (!row) return emptyLocalMeta();
  return {
    offer_segment: row.offer_segment || '',
    norms_note: row.norms_note || '',
    certifications: row.certifications || [],
    subsidy: {
      program: row.subsidy?.program || '',
      stage: row.subsidy?.stage || '',
      deadline: row.subsidy?.deadline || '',
      amount_pln: row.subsidy?.amount_pln || '',
      notes: row.subsidy?.notes || '',
    },
    logistics_checklist: normalizeLogisticsChecklist(row.logistics_checklist),
  };
}

export default function Construction() {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [geoSaving, setGeoSaving] = useState(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
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
    planned_date: '',
    payment_schedule: '',
    project_match_keywords: '',
  });
  const queryClient = useQueryClient();

  const { data: sites = [], isLoading } = useQuery({
    queryKey: ['construction-sites'],
    queryFn: () => base44.entities.ConstructionSite.list('-created_date'),
  });

  const { data: siteExtensions = [] } = useQuery({
    queryKey: ['site-extensions'],
    queryFn: () => listSiteExtensions(),
  });

  const siteExtensionMap = React.useMemo(() => {
    const m = new Map();
    for (const row of siteExtensions) {
      if (row.site_id) m.set(row.site_id, extensionFromRow(row));
    }
    return m;
  }, [siteExtensions]);

  const getSiteExt = (siteId) => siteExtensionMap.get(siteId) || getSiteExtension(siteId);

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
    planned_date: '',
    payment_schedule: '',
    project_match_keywords: '',
    });
  };

  const dismissForm = () => {
    setShowForm(false);
    setEditingId(null);
    resetForm();
    const params = new URLSearchParams(location.search);
    if (params.has('site')) {
      params.delete('site');
      const qs = params.toString();
      navigate({ pathname: location.pathname, search: qs ? `?${qs}` : '' }, { replace: true });
    }
  };

  const createMutation = useMutation({
    mutationFn: async ({ data, extension }) => {
      const created = await base44.entities.ConstructionSite.create(data);
      if (created?.id) await patchSiteExtensionEntity(created.id, normalizeExtension(extension));
      await logAuditEvent({
        action: AUDIT_ACTIONS.PROJECT_UPDATE,
        entity_type: 'ConstructionSite',
        entity_id: created?.id,
        summary: `Utworzono projekt ${data.object_name || data.city || ''}`,
        actor: 'użytkownik',
      });
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['construction-sites']);
      queryClient.invalidateQueries(['site-extensions']);
      toast.success('Dodano obiekt');
      dismissForm();
    },
    onError: (err) => {
      const msg = err?.message || String(err);
      if (/quota|miejsca w pamięci|localStorage/i.test(msg)) {
        toast.error('Brak miejsca w pamięci przeglądarki. Odśwież (Ctrl+F5) lub Ustawienia → reset bazy.');
      } else {
        toast.error(msg || 'Nie udało się dodać obiektu');
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, extension }) => {
      await base44.entities.ConstructionSite.update(id, data);
      if (id) await patchSiteExtensionEntity(id, normalizeExtension(extension));
      await logAuditEvent({
        action: AUDIT_ACTIONS.PROJECT_UPDATE,
        entity_type: 'ConstructionSite',
        entity_id: id,
        summary: `Zaktualizowano projekt ${data.object_name || data.city || ''}`,
        actor: 'użytkownik',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['construction-sites']);
      queryClient.invalidateQueries(['site-extensions']);
      toast.success('Zaktualizowano obiekt');
      dismissForm();
    },
    onError: (err) => {
      const msg = err?.message || String(err);
      if (/quota|miejsca w pamięci|localStorage/i.test(msg)) {
        toast.error('Brak miejsca w pamięci przeglądarki. Odśwież (Ctrl+F5) lub Ustawienia → reset bazy.');
      } else {
        toast.error(msg || 'Nie udało się zaktualizować obiektu');
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.ConstructionSite.delete(id);
      await removeSiteExtensionEntity(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['construction-sites']);
      queryClient.invalidateQueries(['site-extensions']);
    },
  });

  /** Szybka zmiana statusu / obiegu z listy — bez otwierania formularza. */
  const patchSiteFieldsMutation = useMutation({
    mutationFn: async ({ id, patch, summary }) => {
      await base44.entities.ConstructionSite.update(id, patch);
      await logAuditEvent({
        action: AUDIT_ACTIONS.PROJECT_UPDATE,
        entity_type: 'ConstructionSite',
        entity_id: id,
        summary: summary || 'Zaktualizowano status projektu',
        actor: 'użytkownik',
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries(['construction-sites']);
      toast.success(vars?.summary || 'Zaktualizowano status projektu');
    },
    onError: (err) => {
      toast.error(err?.message || 'Nie udało się zmienić statusu');
    },
  });

  const patchSiteField = (site, patch, summary) => {
    if (!site?.id) return;
    patchSiteFieldsMutation.mutate({ id: site.id, patch, summary });
  };

  const filteredSites = sites.filter(site => {
    const searchLower = search.toLowerCase();
    const seg = offerSegmentLabel(getSiteExt(site.id).offer_segment).toLowerCase();
    return (
      site.city?.toLowerCase().includes(searchLower) ||
      site.object_name?.toLowerCase().includes(searchLower) ||
      site.postal_code?.toLowerCase().includes(searchLower) ||
      seg.includes(searchLower)
    );
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!String(formData.object_name ?? '').trim()) {
      toast.error('Podaj nazwę obiektu (pole „Obiekt *” na górze formularza).');
      document.getElementById('construction-object-name')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById('construction-object-name')?.focus();
      return;
    }
    setGeoSaving(true);
    try {
      let data = {
        ...formData,
        invoice_count: formData.invoice_count ? parseInt(formData.invoice_count) : null,
        budget_planned: formData.budget_planned ? parseFloat(formData.budget_planned) : null,
        latitude: formData.latitude !== '' && formData.latitude != null ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude !== '' && formData.longitude != null ? parseFloat(formData.longitude) : null,
        planned_date: formData.planned_date ? String(formData.planned_date).slice(0, 10) : null,
      };

      if (!siteHasCoords(data) && String(data.city ?? '').trim()) {
        const geo = await resolveSiteGeocode(data);
        if (geo) {
          data = {
            ...data,
            latitude: geo.latitude,
            longitude: geo.longitude,
            city: geo.city || data.city,
          };
          if (geo.source !== 'existing') {
            toast.success('Uzupełniono GPS — obiekt pojawi się na mapie.');
          }
        } else {
          toast.warning(
            'Brak współrzędnych GPS. Wybierz miasto z listy sugestii (Polska) lub włącz Claude w Ustawieniach AI (np. Dresden, Saalfeld).'
          );
        }
      }

      if (editingId) {
        updateMutation.mutate({ id: editingId, data, extension: localMeta });
      } else {
        createMutation.mutate({ data, extension: localMeta });
      }
    } catch (err) {
      const msg = err?.message || String(err);
      if (/quota|miejsca w pamięci|localStorage/i.test(msg)) {
        toast.error('Brak miejsca w pamięci przeglądarki. Odśwież (Ctrl+F5) lub Ustawienia → reset bazy.');
      } else {
        toast.error(msg || 'Nie udało się zapisać obiektu');
      }
    } finally {
      setGeoSaving(false);
    }
  };

  const handleEdit = (site) => {
    setFormData(siteRowToFormData(site));
    setEditingId(site.id);
    const ext = getSiteExt(site.id);
    setLocalMeta({
      offer_segment: ext.offer_segment || '',
      norms_note: ext.norms_note || '',
      certifications: Array.isArray(ext.certifications) ? [...ext.certifications] : [],
      subsidy: { ...emptyLocalMeta().subsidy, ...(ext.subsidy || {}) },
      logistics_checklist: normalizeLogisticsChecklist(ext.logistics_checklist),
    });
    setShowForm(true);
  };

  useEffect(() => {
    const url = formData.photo_documentation;
    if (!url) {
      setPhotoPreviewUrl('');
      return;
    }
    let cancelled = false;
    resolveStoredFileUrl(url).then((resolved) => {
      if (!cancelled) setPhotoPreviewUrl(resolved || url);
    });
    return () => {
      cancelled = true;
    };
  }, [formData.photo_documentation]);

  useEffect(() => {
    const siteId = new URLSearchParams(location.search).get('site');
    if (!siteId || isLoading || !sites.length) return;
    if (editingId === siteId && showForm) return;
    const site = sites.find((s) => s.id === siteId);
    if (site) handleEdit(site);
  }, [location.search, sites, isLoading, editingId, showForm]);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (!file.type?.startsWith("image/")) {
        toast.error("Wybierz plik obrazu (JPG, PNG, WebP…).");
        return;
      }
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const url = getUploadFilePublicUrl(uploadRes);
      if (!url) throw new Error("Brak adresu pliku po wgraniu.");
      setFormData((prev) => ({ ...prev, photo_documentation: url }));
      toast.success("Zdjęcie wgrane — kliknij „Aktualizuj obiekt”, aby zapisać.");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Nie udało się wgrać zdjęcia.");
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className="w-full p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Budowa</h1>
            <p className="text-muted-foreground">Zarządzaj obiektami budowlanymi</p>
          </div>
          <Button
            onClick={() => {
              setEditingId(null);
              resetForm();
              setShowForm(true);
              requestAnimationFrame(() => {
                document.getElementById('construction-site-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                document.getElementById('construction-object-name')?.focus();
              });
            }}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" /> Dodaj obiekt
          </Button>
        </div>

        {showForm && (
          <Card id="construction-site-form" className="bg-background shadow-lg mb-6 scroll-mt-4">
            <CardHeader className="flex flex-row items-center justify-between sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
              <div>
                <CardTitle>{editingId ? 'Edytuj obiekt budowlany' : 'Nowy obiekt budowlany'}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Wymagane: <span className="font-medium text-foreground">Obiekt</span> (pole wyżej). Zdjęcie jest opcjonalne — na dole formularza.
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={dismissForm}>
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
                    <Label htmlFor="construction-object-name">Obiekt *</Label>
                    <Input
                      id="construction-object-name"
                      value={formData.object_name}
                      onChange={(e) => setFormData({ ...formData, object_name: e.target.value })}
                      placeholder="np. Netto, Edeka…"
                      required
                      autoFocus={!editingId}
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                    <Label>Status obiegu</Label>
                    <Select value={formData.workflow_status} onValueChange={(v) => setFormData({ ...formData, workflow_status: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONSTRUCTION_WORKFLOW_STATUSES.map((st) => (
                          <SelectItem key={st.value} value={st.value}>
                            {st.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Data planowana</Label>
                    <Input
                      type="date"
                      value={formData.planned_date || ""}
                      onChange={(e) => setFormData({ ...formData, planned_date: e.target.value })}
                    />
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
                        {SITE_STATUS_OPTIONS.map((st) => (
                          <SelectItem key={st.value} value={st.value}>
                            {st.label}
                          </SelectItem>
                        ))}
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
                    placeholder="PL lub DE (kraj), nr filii, ulica, kod wewnętrzny — po przecinku lub nowej linii; dopasowanie do opisu / PO / pozycji"
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

                <ProjectLogisticsChecklist
                  value={localMeta.logistics_checklist}
                  onChange={(next) => setLocalMeta({ ...localMeta, logistics_checklist: next })}
                />

                <div>
                   <Label>Dokumentacja fotograficzna</Label>
                   {formData.photo_documentation ? (
                     <div className="mt-2 rounded-lg border border-green-200 bg-green-50/40 p-3 space-y-3">
                       <div className="flex flex-col sm:flex-row gap-3 items-start">
                         <button
                           type="button"
                           onClick={() => openPhotoDocumentation(formData.photo_documentation)}
                           className="shrink-0 block rounded-md overflow-hidden border bg-background"
                           title="Otwórz podgląd"
                         >
                           <img
                             src={photoPreviewUrl || formData.photo_documentation}
                             alt="Dokumentacja fotograficzna"
                             className="h-28 w-40 object-cover"
                           />
                         </button>
                         <div className="flex-1 space-y-2 min-w-0">
                           <p className="text-sm font-medium text-green-800 flex items-center gap-2">
                             <ImageIcon className="h-4 w-4" />
                             Zdjęcie wgrane
                           </p>
                           <div className="flex flex-wrap gap-2">
                             <Button
                               type="button"
                               variant="outline"
                               size="sm"
                               onClick={() => openPhotoDocumentation(formData.photo_documentation)}
                             >
                               <ExternalLink className="h-4 w-4 mr-1" />
                               Otwórz
                             </Button>
                             <Button
                               type="button"
                               variant="outline"
                               size="sm"
                               onClick={() =>
                                 downloadPhotoDocumentation(
                                   formData.photo_documentation,
                                   photoDownloadFilename(formData.object_name || formData.city)
                                 ).catch((err) => toast.error(err?.message || 'Nie udało się pobrać zdjęcia'))
                               }
                             >
                               <Download className="h-4 w-4 mr-1" />
                               Pobierz
                             </Button>
                             <label className="inline-flex items-center justify-center gap-1 h-8 px-3 rounded-md border border-input bg-background text-sm font-medium cursor-pointer hover:bg-accent relative overflow-hidden">
                               <UploadIcon className="h-4 w-4" />
                               Zamień
                               <input
                                 type="file"
                                 accept="image/*"
                                 onChange={handlePhotoUpload}
                                 className="absolute inset-0 opacity-0 cursor-pointer"
                               />
                             </label>
                             <Button
                               type="button"
                               variant="ghost"
                               size="sm"
                               onClick={() => setFormData({ ...formData, photo_documentation: '' })}
                             >
                               Usuń
                             </Button>
                           </div>
                         </div>
                       </div>
                     </div>
                   ) : (
                     <div className="mt-2 relative border border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                       <input
                         type="file"
                         accept="image/*"
                         onChange={handlePhotoUpload}
                         className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                       />
                       <div className="flex flex-col items-center">
                         <UploadIcon className="h-6 w-6 text-slate-400 mb-2" />
                         <span className="text-sm text-slate-600">Kliknij, aby wgrać zdjęcie</span>
                       </div>
                     </div>
                   )}
                </div>
                <div className="flex gap-3 justify-end">
                   <Button type="button" variant="outline" onClick={dismissForm}>
                     Anuluj
                   </Button>
                   <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || geoSaving} className="bg-blue-600 hover:bg-blue-700">
                     {(createMutation.isPending || updateMutation.isPending || geoSaving) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
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
                    <TableHead>Mapa</TableHead>
                    <TableHead>Obiekt</TableHead>
                    <TableHead>Segment oferty</TableHead>
                    <TableHead>Logistyka</TableHead>
                    <TableHead>Kod pocztowy</TableHead>
                    <TableHead title="Etap obiegu: zaplanowany → … → zapłacono">Obieg</TableHead>
                    <TableHead>Data plan.</TableHead>
                    <TableHead>Okres</TableHead>
                    <TableHead>Ilość faktur</TableHead>
                    <TableHead>Numery faktur</TableHead>
                    <TableHead>Uwagi</TableHead>
                    <TableHead>Dokumentacja fotograficzna</TableHead>
                    <TableHead title="Aktywny / zakończony / zawieszony">Status</TableHead>
                    <TableHead>Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center py-8">Ładowanie...</TableCell>
                    </TableRow>
                  ) : filteredSites.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center py-8 text-slate-500">
                        <Building className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                        Brak obiektów budowlanych
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSites.map(site => (
                      <TableRow key={site.id}>
                        <TableCell className="font-medium">{site.city}</TableCell>
                        <TableCell>
                          {siteHasCoords(site) ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700" title="Widoczny na mapie obiektów">
                              <MapPin className="h-3.5 w-3.5" />
                              GPS
                            </span>
                          ) : (
                            <span className="text-xs text-amber-700" title="Brak współrzędnych — zapisz ponownie lub uzupełnij GPS">
                              brak GPS
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{site.object_name}</TableCell>
                        <TableCell className="text-sm max-w-[180px]">
                          {offerSegmentLabel(getSiteExt(site.id).offer_segment)}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {(() => {
                            const progress = logisticsChecklistProgress(getSiteExt(site.id).logistics_checklist);
                            if (!progress.total) {
                              return <span className="text-slate-400">—</span>;
                            }
                            return (
                              <Badge
                                variant="outline"
                                className={
                                  progress.open > 0
                                    ? 'border-amber-400 text-amber-800 bg-amber-50'
                                    : 'border-emerald-400 text-emerald-800 bg-emerald-50'
                                }
                                title={progress.open > 0 ? `${progress.open} otwartych` : 'Logistyka domknięta'}
                              >
                                {progress.label}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell>{site.postal_code || '-'}</TableCell>
                        <TableCell className="min-w-[150px]">
                          <Select
                            value={site.workflow_status || 'realizacja'}
                            onValueChange={(v) =>
                              patchSiteField(
                                site,
                                { workflow_status: v },
                                `Obieg: ${constructionWorkflowLabel(v)} — ${site.object_name || site.city || ''}`
                              )
                            }
                            disabled={patchSiteFieldsMutation.isPending}
                          >
                            <SelectTrigger className="h-8 text-xs w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CONSTRUCTION_WORKFLOW_STATUSES.map((st) => (
                                <SelectItem key={st.value} value={st.value}>
                                  {st.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {site.planned_date ? String(site.planned_date).slice(0, 10) : '-'}
                        </TableCell>
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
                             <button
                               type="button"
                               onClick={() =>
                                 openPhotoDocumentation(site.photo_documentation).catch((e) =>
                                   toast.error(e?.message || 'Nie udało się otworzyć zdjęcia')
                                 )
                               }
                               className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
                             >
                               <ImageIcon className="h-4 w-4" />
                               <span className="text-sm">Otwórz</span>
                             </button>
                           ) : (
                             <span className="text-slate-400">-</span>
                           )}
                         </TableCell>
                         <TableCell className="min-w-[140px]">
                          <Select
                            value={site.status || 'aktywny'}
                            onValueChange={(v) =>
                              patchSiteField(
                                site,
                                { status: v },
                                `Status: ${SITE_STATUS_OPTIONS.find((o) => o.value === v)?.label || v} — ${site.object_name || site.city || ''}`
                              )
                            }
                            disabled={patchSiteFieldsMutation.isPending}
                          >
                            <SelectTrigger className={`h-8 text-xs w-[130px] ${siteStatusSelectClass(site.status)}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SITE_STATUS_OPTIONS.map((st) => (
                                <SelectItem key={st.value} value={st.value}>
                                  {st.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                  {filteredSites.filter(isActiveConstructionProject).length}
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