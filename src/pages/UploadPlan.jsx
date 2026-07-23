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
import { Upload as UploadIcon, Loader2, CheckCircle, Map, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { isClaudeConfigured } from "@/lib/openai-crm";
import { getUploadFilePublicUrl } from "@/lib/upload-file-url";
import {
  emptyConstructionPlan,
  pickConstructionPlanApiPayload,
  CONSTRUCTION_PLAN_TYPES,
  normalizeRooms,
} from "@/lib/construction-plan-schema";
import {
  extractPlanFromFile,
  extractPlanFromFileClaude,
  mapPlanJsonToInternal,
  attachPlanProjectMatch,
  planMappedHasUsableData,
  planProjectMatchLabel,
} from "@/lib/plan-extract";
import { getProjectDisplayName, projectMatchReasonLabel } from "@/lib/match-project";
import { bulkCreateOrSequential, formatBase44Error } from "@/lib/base44-entity-save";
import {
  applyImportDuplicateFlags,
  filterRowsForImportSave,
  summarizeImportDuplicates,
  PLAN_DUPLICATE_OPTIONS,
} from "@/lib/duplicate-detection";

const ACCEPTED_EXT = /\.(pdf|png|jpe?g|webp)$/i;

function ExtractionSourceBadge({ source }) {
  const labels = {
    heuristic: "Heurystyka",
    claude: "Claude",
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
  if (!row.project_id) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
        Brak projektu
      </span>
    );
  }
  const auto = row._projectMatchReason && row._projectMatchReason !== "manual";
  const reason = projectMatchReasonLabel(row._projectMatchReason);
  return (
    <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300">
      {planProjectMatchLabel(row, projects)}
      {reason && auto && row._projectMatchReason !== "claude" ? ` (${reason})` : ""}
    </span>
  );
}

export default function UploadPlan() {
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

  const withMatch = (plan) => attachPlanProjectMatch({ ...emptyConstructionPlan(plan) }, projects);

  const buildReviewRow = (mapped, file, extra = {}) =>
    withMatch({
      ...emptyConstructionPlan(mapped),
      rooms: normalizeRooms(mapped?.rooms),
      fileName: mapped?.fileName || file?.name || "",
      _fileRef: file,
      _extractionSource: mapped?._extractionSource || extra._extractionSource || "manual",
      ...extra,
    });

  const onFilesAdded = useCallback((list) => {
    const accepted = Array.from(list || []).filter((f) => ACCEPTED_EXT.test(f.name));
    if (accepted.length < (list?.length || 0)) {
      toast.error("Akceptowane są pliki PDF, PNG, JPG, WEBP");
    }
    if (accepted.length) setFiles((prev) => [...prev, ...accepted]);
  }, []);

  const processFiles = async () => {
    if (!files.length) return;
    if (!projects.length) {
      toast.warning("Brak projektów w module Budowa — Claude nie będzie mógł dopasować planu automatycznie.");
    }
    setProcessing(true);
    setStep("processing");
    try {
      const results = [];
      for (const file of files) {
        try {
          const { mapped } = await extractPlanFromFile(file, projects);
          if (planMappedHasUsableData(mapped)) {
            results.push(buildReviewRow(mapped, file));
          } else {
            results.push(
              buildReviewRow(null, file, {
                title: file.name.replace(ACCEPTED_EXT, ""),
                _manualStub: true,
                _extractionSource: "manual",
              })
            );
            toast.warning(`„${file.name}”: nie rozpoznano — uzupełnij ręcznie lub użyj „Popraw z AI”.`);
          }
        } catch (e) {
          console.warn("Plan extract:", e);
          toast.error(`${file.name}: ${e?.message || "błąd odczytu"}`);
          results.push(
            buildReviewRow(null, file, {
              title: file.name.replace(ACCEPTED_EXT, ""),
              _manualStub: true,
              _extractionSource: "manual",
            })
          );
        }
      }
      let existing = [];
      try {
        existing = await base44.entities.ConstructionPlan.list();
      } catch (listErr) {
        console.warn("ConstructionPlan.list:", listErr);
      }
      const withDup = applyImportDuplicateFlags(results, existing, PLAN_DUPLICATE_OPTIONS);
      const { systemDup, batchDup } = summarizeImportDuplicates(withDup);
      setRows(withDup);
      setStep("review");
      if (systemDup > 0) toast.error(`${systemDup} planów już jest w systemie — odrzucono.`);
      if (batchDup > 0) toast.message(`${batchDup} duplikatów w tej paczce.`);
      toast.success(`Przetworzono ${withDup.length} planów`);
    } finally {
      setProcessing(false);
    }
  };

  const updateRow = (index, field, value) => {
    const next = [...rows];
    const row = { ...next[index], [field]: value };
    if (field === "sheet_number" || field === "revision" || field === "title") {
      row._rejected = false;
      row._systemDuplicate = false;
      row._duplicateReason = null;
    }
    if (field === "project_id") {
      row._projectMatchManual = Boolean(value);
      row._projectMatchReason = value ? "manual" : null;
      row._projectMatchNote = value ? "" : row._projectMatchNote;
    }
    next[index] = row;
    setRows(next);
  };

  const reextractWithAi = async (idx) => {
    const row = rows[idx];
    const file = row._fileRef;
    if (!file) {
      toast.error("Brak pliku w pamięci — dodaj plik ponownie i przetwórz.");
      return;
    }
    if (!isClaudeConfigured()) {
      toast.error("Włącz Claude w Ustawieniach AI.");
      return;
    }
    setReAiLoading(idx);
    try {
      const { parsed } = await extractPlanFromFileClaude(file, projects);
      const mapped = mapPlanJsonToInternal(parsed, { fileName: row.fileName });
      if (!planMappedHasUsableData(mapped)) {
        throw new Error("AI nie zwróciło rozpoznawalnych danych planu.");
      }
      const next = [...rows];
      next[idx] = buildReviewRow(mapped, file, {
        _projectMatchManual: row._projectMatchManual,
        project_id: row._projectMatchManual ? row.project_id : undefined,
        _rejected: false,
        _extractionSource: "claude",
      });
      setRows(next);
      toast.success("Plan odczytany ponownie przez Claude");
    } catch (e) {
      toast.error(e?.message || "Błąd AI");
    } finally {
      setReAiLoading(null);
    }
  };

  const saveAll = async () => {
    const valid = rows.filter((r) => !r._rejected && String(r.title ?? "").trim());
    if (!valid.length) {
      toast.error("Brak planów do zapisu.");
      return;
    }
    const withoutProject = valid.filter((r) => !r.project_id);
    if (withoutProject.length) {
      toast.warning(`${withoutProject.length} planów bez projektu — zapisuję mimo to.`);
    }

    setProcessing(true);
    try {
      const existing = await base44.entities.ConstructionPlan.list();
      const { kept, duplicatesInDb, duplicatesInBatch } = filterRowsForImportSave(
        valid,
        existing,
        PLAN_DUPLICATE_OPTIONS
      );
      if (!kept.length) {
        toast.error("Wszystkie pozycje to duplikaty.");
        return;
      }
      if (duplicatesInDb + duplicatesInBatch > 0) {
        toast.message(`Pominięto ${duplicatesInDb + duplicatesInBatch} duplikatów — zapisuję ${kept.length}.`);
      }

      const payloads = [];
      for (const row of kept) {
        let file_url = row.file_url || "";
        if (row._fileRef) {
          try {
            const uploadRes = await base44.integrations.Core.UploadFile({ file: row._fileRef });
            file_url = getUploadFilePublicUrl(uploadRes) || file_url;
          } catch (uploadErr) {
            console.warn("Plan file upload:", uploadErr);
          }
        }
        const { _manualStub, _extractionSource, _fileRef, _projectMatchManual, ...rest } = row;
        payloads.push(
          pickConstructionPlanApiPayload(
            withMatch({ ...rest, file_url, _projectMatchReason: row._projectMatchReason, _projectMatchConfidence: row._projectMatchConfidence, _projectMatchNote: row._projectMatchNote })
          )
        );
      }

      await bulkCreateOrSequential(
        base44.entities.ConstructionPlan,
        payloads,
        (r) => r.title || r.sheet_number || "Plan"
      );
      toast.success(`Zapisano ${payloads.length} planów budowy`);
      navigate(createPageUrl("ConstructionPlans"));
    } catch (e) {
      const msg = formatBase44Error(e) || e?.message || "Błąd zapisu planów";
      if (/quota|miejsca w pamięci|localStorage/i.test(msg)) {
        toast.error(
          "Brak miejsca w pamięci przeglądarki. Odśwież stronę (Ctrl+F5) i zapisz ponownie — PDF trafi do IndexedDB. W razie potrzeby: Ustawienia → reset bazy."
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="w-full p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Map className="h-8 w-8 text-violet-600" />
          Import planów budowy
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Wgraj PDF lub skan planu (PNG/JPG). Claude odczyta metadane i dopasuje plan do projektu z modułu Budowa.
          Na etapie weryfikacji możesz ręcznie zmienić przypisanie projektu.
          {!isClaudeConfigured() ? " Włącz Claude w Ustawieniach AI." : ""}
        </p>
      </div>

      {step === "upload" && (
        <Card>
          <CardContent className="pt-6">
            <div
              className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
                dragOver ? "border-violet-500 bg-violet-50/50" : "border-border"
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
              <p className="text-muted-foreground mb-4">Przeciągnij plany budowy lub wybierz pliki</p>
              <Input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
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
              className="w-full mt-4 bg-violet-600 hover:bg-violet-700"
              disabled={!files.length || processing}
              onClick={processFiles}
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Przetwórz plany ({files.length})
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "processing" && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-violet-600" />
            <p>Odczyt planów przez Claude…</p>
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
                    {row.fileName || `Plan ${idx + 1}`}
                    {row._rejected ? <span className="text-destructive">(odrzucony)</span> : null}
                    {!row._rejected ? <ExtractionSourceBadge source={row._extractionSource} /> : null}
                  </span>
                  <div className="flex flex-wrap gap-2 items-center">
                    {!row._rejected ? <ProjectMatchBadge row={row} projects={projects} /> : null}
                    {!row._rejected && row._fileRef ? (
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
                {row._projectMatchNote && !row._rejected ? (
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                    Uzasadnienie Claude: {row._projectMatchNote}
                  </p>
                ) : null}
                {row._duplicateReason ? (
                  <p className="text-sm text-destructive">{row._duplicateReason}</p>
                ) : null}
                {!row._rejected ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>Tytuł planu *</Label>
                      <Input value={row.title || ""} onChange={(e) => updateRow(idx, "title", e.target.value)} />
                    </div>
                    <div>
                      <Label>Numer arkusza</Label>
                      <Input
                        value={row.sheet_number || ""}
                        onChange={(e) => updateRow(idx, "sheet_number", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Rewizja</Label>
                      <Input value={row.revision || ""} onChange={(e) => updateRow(idx, "revision", e.target.value)} />
                    </div>
                    <div>
                      <Label>Skala</Label>
                      <Input value={row.scale || ""} onChange={(e) => updateRow(idx, "scale", e.target.value)} />
                    </div>
                    <div>
                      <Label>Typ planu</Label>
                      <Select value={row.plan_type || "floor"} onValueChange={(v) => updateRow(idx, "plan_type", v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(CONSTRUCTION_PLAN_TYPES).map(([k, label]) => (
                            <SelectItem key={k} value={k}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Data wystawienia</Label>
                      <Input
                        type="date"
                        value={(row.issue_date || "").slice(0, 10)}
                        onChange={(e) => updateRow(idx, "issue_date", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Projektant / biuro</Label>
                      <Input value={row.architect || ""} onChange={(e) => updateRow(idx, "architect", e.target.value)} />
                    </div>
                    <div>
                      <Label>Miasto</Label>
                      <Input value={row.city || ""} onChange={(e) => updateRow(idx, "city", e.target.value)} />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Projekt (rynek) — ręczna korekta</Label>
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
                      <Label>Adres obiektu</Label>
                      <Input
                        value={row.site_address || ""}
                        onChange={(e) => updateRow(idx, "site_address", e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Opis</Label>
                      <Textarea
                        rows={2}
                        value={row.description || ""}
                        onChange={(e) => updateRow(idx, "description", e.target.value)}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setStep("upload");
                  setRows([]);
                  setFiles([]);
                }}
              >
                Anuluj
              </Button>
              <Button className="flex-1 bg-violet-600 hover:bg-violet-700" disabled={processing} onClick={saveAll}>
                {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Zapisz plany ({rows.filter((r) => !r._rejected).length})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
