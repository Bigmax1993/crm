import React, { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload as UploadIcon, Loader2, CheckCircle, Package, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { extractWzFromPdf, extractWzFromPdfClaude, extractWzFromPdfBase44, mapWzJsonToInternal, wzMappedHasUsableData } from "@/lib/wz-extract";
import { isClaudeConfigured } from "@/lib/openai-crm";
import {
  emptyMaterialDelivery,
  pickMaterialDeliveryApiPayload,
  normalizeLines,
  projectMatchPayloadFromWz,
} from "@/lib/material-delivery-schema";
import {
  attachProjectMatch,
  getProjectDisplayName,
  normalizeTaxId,
  projectMatchReasonLabel,
} from "@/lib/match-project";
import { bulkCreateOrSequential, formatBase44Error } from "@/lib/base44-entity-save";
import {
  applyImportDuplicateFlags,
  filterRowsForImportSave,
  summarizeImportDuplicates,
  WZ_DUPLICATE_OPTIONS,
} from "@/lib/duplicate-detection";

function ExtractionSourceBadge({ source }) {
  const labels = {
    heuristic: "Heurystyka",
    claude: "Claude",
    openai: "Claude",
    base44: "Base44 OCR",
    manual: "Ręcznie / nieodczytane",
  };
  if (!source) return null;
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border whitespace-nowrap">
      {labels[source] ?? source}
    </span>
  );
}

function ProjectMatchBadge({ row, projects }) {
  const project = projects.find((p) => p.id === row.project_id);
  if (!project) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
        Brak projektu
      </span>
    );
  }
  const reason = projectMatchReasonLabel(row._projectMatchReason);
  const auto = row._projectMatchReason && row._projectMatchReason !== "manual";
  return (
    <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300">
      {auto ? `Automatycznie: ${getProjectDisplayName(project)}` : getProjectDisplayName(project)}
      {reason && auto ? ` (${reason})` : ""}
    </span>
  );
}

export default function UploadWZ() {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [step, setStep] = useState("upload");
  const [processing, setProcessing] = useState(false);
  const [rows, setRows] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [reAiLoading, setReAiLoading] = useState(null);

  const { data: projects = [] } = useQuery({
    queryKey: ["construction-sites"],
    queryFn: () => base44.entities.ConstructionSite.list(),
  });
  const { data: contractors = [] } = useQuery({
    queryKey: ["contractors"],
    queryFn: () => base44.entities.Contractor.list(),
  });
  const matchOpts = { contractors };

  const enrichSupplierFromContractors = (wz) => {
    if (String(wz.supplier_name ?? "").trim() || !String(wz.supplier_nip ?? "").trim()) {
      return wz;
    }
    const nip = normalizeTaxId(wz.supplier_nip);
    const supplier = contractors.find(
      (c) => c.type === "supplier" && normalizeTaxId(c.nip) === nip
    );
    if (!supplier?.name) return wz;
    return { ...wz, supplier_name: supplier.name };
  };

  const withMatch = (wz) =>
    attachProjectMatch(
      {
        ...wz,
        ...projectMatchPayloadFromWz(wz),
        project_id: wz.project_id,
      },
      projects,
      matchOpts
    );

  const buildReviewRow = (mapped, file, extra = {}) =>
    withMatch(
      enrichSupplierFromContractors({
        ...emptyMaterialDelivery(mapped),
        lines: normalizeLines(mapped?.lines).length
          ? normalizeLines(mapped.lines)
          : [{ name: "Piasek", unit: "t", quantity: 0 }],
        fileName: mapped?.fileName || file?.name || "",
        _pdfFileRef: file,
        _extractionSource: mapped?._extractionSource || extra._extractionSource || "heuristic",
        ...extra,
      })
    );

  const onFilesAdded = useCallback((list) => {
    const pdfs = Array.from(list || []).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length < (list?.length || 0)) {
      toast.error("Akceptowane są tylko pliki PDF");
    }
    if (pdfs.length) setFiles((prev) => [...prev, ...pdfs]);
  }, []);

  const processFiles = async () => {
    if (!files.length) return;
    setProcessing(true);
    setStep("processing");
    try {
      const results = [];
      for (const file of files) {
        try {
          const { mapped } = await extractWzFromPdf(file);
          if (mapped) {
            results.push(buildReviewRow(mapped, file));
          } else {
            results.push(
              buildReviewRow(null, file, {
                ...emptyMaterialDelivery({ fileName: file.name }),
                _manualStub: true,
                _extractionSource: "manual",
              })
            );
            toast.warning(`„${file.name}”: nie rozpoznano — uzupełnij ręcznie lub użyj „Popraw z AI”.`);
          }
        } catch (e) {
          console.warn("WZ extract:", e);
          toast.error(`${file.name}: ${e?.message || "błąd odczytu"}`);
          results.push(
            buildReviewRow(null, file, {
              ...emptyMaterialDelivery({ fileName: file.name }),
              _manualStub: true,
              _extractionSource: "manual",
            })
          );
        }
      }
      let existing = [];
      try {
        existing = await base44.entities.MaterialDelivery.list();
      } catch (listErr) {
        console.warn("MaterialDelivery.list (duplikaty):", listErr);
        toast.warning("Nie udało się sprawdzić duplikatów WZ w bazie — kontrola przy zapisie.");
      }
      const withDup = applyImportDuplicateFlags(results, existing, WZ_DUPLICATE_OPTIONS);
      const { systemDup, batchDup } = summarizeImportDuplicates(withDup);
      setRows(withDup);
      setStep("review");
      if (systemDup > 0) {
        toast.error(
          systemDup === 1
            ? "1 WZ jest już w systemie — automatycznie odrzucony."
            : `${systemDup} WZ jest już w systemie — automatycznie odrzucone.`
        );
      }
      if (batchDup > 0) {
        toast.message(`${batchDup} WZ odrzuconych jako duplikaty w tej paczce.`);
      }
      toast.success(`Przetworzono ${withDup.length} dokumentów WZ`);
    } finally {
      setProcessing(false);
    }
  };

  const updateRow = (index, field, value) => {
    const next = [...rows];
    const row = { ...next[index], [field]: value };
    if (field === "document_number") {
      row._rejected = false;
      row._systemDuplicate = false;
      row._duplicateReason = null;
    }
    if (field === "project_id") {
      row._projectMatchManual = Boolean(value);
      row._projectMatchReason = value ? "manual" : null;
    }
    if (field === "lines" && typeof value === "string") {
      try {
        row.lines = JSON.parse(value);
      } catch {
        row.lines = [{ name: value, unit: "t", quantity: 0 }];
      }
    }
    next[index] = row;
    setRows(next);
  };

  const reextractWithAi = async (idx) => {
    const row = rows[idx];
    const pdfFile = row._pdfFileRef;
    if (!pdfFile) {
      toast.error("Brak pliku w pamięci — dodaj plik ponownie i przetwórz.");
      return;
    }
    setReAiLoading(idx);
    try {
      let mapped = null;
      let extractionSource = null;

      if (isClaudeConfigured()) {
        try {
          const { parsed } = await extractWzFromPdfClaude(pdfFile);
          mapped = mapWzJsonToInternal(parsed, { fileName: row.fileName });
          if (wzMappedHasUsableData(mapped)) {
            extractionSource = "claude";
          }
        } catch (openErr) {
          console.warn("Claude WZ re-extract:", openErr);
          toast.message(
            openErr?.message
              ? `Claude: ${openErr.message.slice(0, 120)} — próbuję Base44…`
              : "Próbuję Base44 OCR…"
          );
        }
      }

      if (!extractionSource) {
        const { parsed } = await extractWzFromPdfBase44(pdfFile);
        mapped = mapWzJsonToInternal(parsed, { fileName: row.fileName });
        if (wzMappedHasUsableData(mapped)) {
          extractionSource = "base44";
        }
      }

      if (!wzMappedHasUsableData(mapped)) {
        throw new Error("AI nie zwróciło numeru WZ ani dostawcy — sprawdź plik lub uzupełnij ręcznie.");
      }

      const next = [...rows];
      next[idx] = buildReviewRow(mapped, pdfFile, {
        _projectMatchManual: row._projectMatchManual,
        project_id: row._projectMatchManual ? row.project_id : undefined,
        _rejected: false,
        _extractionSource: extractionSource,
      });
      setRows(next);
      toast.success("Formularz WZ uzupełniony ponownie przez AI");
    } catch (e) {
      toast.error(e?.message || "Błąd AI (Claude / Base44)");
    } finally {
      setReAiLoading(null);
    }
  };

  const saveAll = async () => {
    const valid = rows.filter(
      (r) => !r._rejected && String(r.document_number ?? "").trim() && String(r.supplier_name ?? "").trim()
    );
    if (!valid.length) {
      toast.error("Brak WZ do zapisu (uzupełnij dane lub wszystkie odrzucone jako duplikaty).");
      return;
    }
    const withoutProject = valid.filter((r) => !r.project_id);
    if (withoutProject.length) {
      toast.warning(`${withoutProject.length} WZ bez projektu — zapisuję mimo to.`);
    }

    setProcessing(true);
    try {
      const existing = await base44.entities.MaterialDelivery.list();
      const { kept, duplicatesInDb, duplicatesInBatch } = filterRowsForImportSave(
        valid,
        existing,
        WZ_DUPLICATE_OPTIONS
      );
      if (!kept.length) {
        toast.error(
          `Wszystkie pozycje to duplikaty (${duplicatesInDb} w bazie${duplicatesInBatch ? `, ${duplicatesInBatch} w paczce` : ""}).`
        );
        return;
      }
      if (duplicatesInDb + duplicatesInBatch > 0) {
        toast.message(
          `Pominięto ${duplicatesInDb + duplicatesInBatch} duplikatów — zapisuję ${kept.length} nowych WZ.`
        );
      }
      const payloads = kept.map((r) => {
        const { _manualStub, _extractionSource, _projectMatchReason, _projectMatchManual, _projectMatchConfidence, ...rest } =
          r;
        const matched = withMatch(rest);
        return pickMaterialDeliveryApiPayload(matched);
      });
      await bulkCreateOrSequential(
        base44.entities.MaterialDelivery,
        payloads,
        (r) => r.document_number || "WZ"
      );
      toast.success(`Zapisano ${payloads.length} dokumentów WZ`);
      navigate(createPageUrl("MaterialDeliveries"));
    } catch (e) {
      toast.error(formatBase44Error(e) || "Błąd zapisu WZ");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="w-full p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Package className="h-8 w-8 text-blue-600" />
          Import WZ (dostawy materiałów)
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Wgraj PDF wydania zewnętrznego od dostawcy (np. piasek). System odczyta heurystyką
          {isClaudeConfigured() ? " i przez Claude" : " (włącz Claude w Ustawieniach AI dla skanów)"}, przypisze projekt i zapisze
          rejestr dostaw. Na etapie weryfikacji użyj „Popraw z AI” (Claude lub Base44 OCR).
        </p>
      </div>

      {step === "upload" && (
        <Card>
          <CardContent className="pt-6">
            <div
              className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
                dragOver ? "border-blue-500 bg-blue-50/50" : "border-border"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                onFilesAdded(e.dataTransfer.files);
              }}
            >
              <UploadIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">Przeciągnij PDF WZ lub wybierz pliki</p>
              <Input
                type="file"
                accept=".pdf,application/pdf"
                multiple
                className="max-w-xs mx-auto"
                onChange={(e) => {
                  onFilesAdded(e.target.files);
                  e.target.value = "";
                }}
              />
              {files.length > 0 && (
                <ul className="mt-4 text-sm text-left max-w-md mx-auto space-y-1">
                  {files.map((f, i) => (
                    <li key={i} className="truncate">
                      {f.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700"
              disabled={!files.length || processing}
              onClick={processFiles}
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Przetwórz WZ ({files.length})
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "processing" && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            <p>Odczyt dokumentów WZ…</p>
          </CardContent>
        </Card>
      )}

      {step === "review" && (
        <Card>
          <CardHeader>
            <CardTitle>Weryfikacja ({rows.filter((r) => !r._rejected).length} do zapisu)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {rows.map((row, idx) => (
              <div
                key={idx}
                className={`border rounded-lg p-4 space-y-3 ${row._rejected ? "opacity-50 bg-muted" : ""}`}
              >
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <span className="font-medium text-sm flex flex-wrap items-center gap-2">
                    {row.fileName || `Dokument ${idx + 1}`}
                    {row._rejected ? (
                      <span className="text-destructive">
                        (odrzucony{row._systemDuplicate ? " — duplikat w bazie" : ""})
                      </span>
                    ) : null}
                    {!row._rejected ? <ExtractionSourceBadge source={row._extractionSource} /> : null}
                  </span>
                  <div className="flex flex-wrap gap-2 items-center">
                    {!row._rejected ? <ProjectMatchBadge row={row} projects={projects} /> : null}
                    {!row._rejected && row._pdfFileRef ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={reAiLoading === idx}
                        onClick={() => reextractWithAi(idx)}
                        className="border-amber-500/30"
                      >
                        {reAiLoading === idx ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-1 text-amber-600" />
                        )}
                        Popraw z AI
                      </Button>
                    ) : null}
                  </div>
                </div>
                {row._duplicateReason ? (
                  <p className="text-sm text-destructive">{row._duplicateReason}</p>
                ) : null}
                {!row._rejected ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Numer WZ *</Label>
                    <Input
                      value={row.document_number || ""}
                      onChange={(e) => updateRow(idx, "document_number", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Data dostawy</Label>
                    <Input
                      type="date"
                      value={(row.issue_date || "").slice(0, 10)}
                      onChange={(e) => updateRow(idx, "issue_date", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Dostawca *</Label>
                    <Input
                      value={row.supplier_name || ""}
                      onChange={(e) => updateRow(idx, "supplier_name", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>NIP dostawcy</Label>
                    <Input
                      value={row.supplier_nip || ""}
                      onChange={(e) => updateRow(idx, "supplier_nip", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Nr zamówienia / PO</Label>
                    <Input
                      value={row.order_number || ""}
                      onChange={(e) => updateRow(idx, "order_number", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Projekt (rynek)</Label>
                    <Select
                      value={row.project_id || "none"}
                      onValueChange={(v) => updateRow(idx, "project_id", v === "none" ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Wybierz projekt" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— brak —</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {getProjectDisplayName(p)}
                            {p.city ? ` · ${p.city}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>Adres dostawy</Label>
                    <Input
                      value={row.delivery_address || ""}
                      onChange={(e) => updateRow(idx, "delivery_address", e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Pozycje (JSON: nazwa, jednostka t/m3, ilość)</Label>
                    <Textarea
                      rows={3}
                      className="font-mono text-xs"
                      value={JSON.stringify(normalizeLines(row.lines), null, 2)}
                      onChange={(e) => updateRow(idx, "lines", e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Uwagi</Label>
                    <Input value={row.notes || ""} onChange={(e) => updateRow(idx, "notes", e.target.value)} />
                  </div>
                </div>
                ) : null}
              </div>
            ))}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setStep("upload"); setRows([]); setFiles([]); }}>
                Anuluj
              </Button>
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={processing} onClick={saveAll}>
                {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Zapisz WZ ({rows.filter((r) => !r._rejected).length})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
