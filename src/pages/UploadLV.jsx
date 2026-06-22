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
import { Upload as UploadIcon, Loader2, CheckCircle, FileSpreadsheet, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { extractLvFromPdf, parseLvFromJsonText } from "@/lib/lv-extract";
import { isClaudeConfigured } from "@/lib/openai-crm";
import {
  emptyProjectBoQ,
  emptyLvLine,
  pickProjectBoQApiPayload,
  normalizeLvLines,
  projectMatchPayloadFromLv,
  formatLvMoney,
  lvLinesCount,
  sumLvLines,
} from "@/lib/lv-schema";
import {
  attachProjectMatch,
  getProjectDisplayName,
  projectMatchReasonLabel,
} from "@/lib/match-project";
import { bulkCreateOrSequential, formatBase44Error } from "@/lib/base44-entity-save";

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
      {auto ? `Auto: ${getProjectDisplayName(project)}` : getProjectDisplayName(project)}
      {reason && auto ? ` (${reason})` : ""}
    </span>
  );
}

async function extractLvFromFile(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith(".json")) {
    const text = await file.text();
    const mapped = parseLvFromJsonText(text);
    if (!mapped) throw new Error("Niepoprawny JSON LV");
    return { mapped: { ...mapped, fileName: file.name, _extractionSource: "json" } };
  }
  return extractLvFromPdf(file);
}

export default function UploadLV() {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [step, setStep] = useState("upload");
  const [processing, setProcessing] = useState(false);
  const [rows, setRows] = useState([]);
  const [dragOver, setDragOver] = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: ["construction-sites"],
    queryFn: () => base44.entities.ConstructionSite.list(),
  });
  const { data: contractors = [] } = useQuery({
    queryKey: ["contractors"],
    queryFn: () => base44.entities.Contractor.list(),
  });
  const matchOpts = { contractors };

  const withMatch = (lv) =>
    attachProjectMatch(
      {
        ...lv,
        ...projectMatchPayloadFromLv(lv),
        project_id: lv.project_id,
      },
      projects,
      matchOpts
    );

  const onFilesAdded = useCallback((list) => {
    const accepted = Array.from(list || []).filter((f) => {
      const n = f.name.toLowerCase();
      return n.endsWith(".pdf") || n.endsWith(".json");
    });
    if (accepted.length < (list?.length || 0)) {
      toast.error("Akceptowane: PDF lub JSON (LV / GAEB)");
    }
    if (accepted.length) setFiles((prev) => [...prev, ...accepted]);
  }, []);

  const processFiles = async () => {
    if (!files.length) return;
    setProcessing(true);
    setStep("processing");
    try {
      const results = [];
      for (const file of files) {
        try {
          const { mapped } = await extractLvFromFile(file);
          if (mapped) {
            const lines = normalizeLvLines(mapped.lines);
            results.push(
              withMatch({
                ...emptyProjectBoQ(mapped),
                lines: lines.length ? lines : [emptyLvLine()],
                total_net:
                  mapped.total_net != null && mapped.total_net !== ""
                    ? Number(mapped.total_net)
                    : lines.length
                      ? sumLvLines(lines)
                      : null,
              })
            );
          } else {
            results.push(
              withMatch({
                ...emptyProjectBoQ({ fileName: file.name }),
                _manualStub: true,
                _extractionSource: "manual",
              })
            );
            toast.warning(`„${file.name}”: nie rozpoznano LV — uzupełnij ręcznie.`);
          }
        } catch (e) {
          console.warn("LV extract:", e);
          toast.error(`${file.name}: ${e?.message || "błąd odczytu"}`);
          results.push(withMatch({ ...emptyProjectBoQ({ fileName: file.name }), _manualStub: true }));
        }
      }
      setRows(results);
      setStep("review");
      toast.success(`Przetworzono ${results.length} dokumentów LV`);
    } finally {
      setProcessing(false);
    }
  };

  const updateRow = (index, field, value) => {
    const next = [...rows];
    const row = { ...next[index], [field]: value };
    if (field === "project_id") {
      row._projectMatchManual = Boolean(value);
      row._projectMatchReason = value ? "manual" : null;
    }
    if (field === "lines" && typeof value === "string") {
      try {
        row.lines = JSON.parse(value);
      } catch {
        /* keep */
      }
    }
    if (field === "total_net" || field === "total_gross" || field === "vat_percent") {
      row[field] = value === "" ? null : Number(value);
    }
    next[index] = row;
    setRows(next);
  };

  const saveAll = async () => {
    const valid = rows.filter((r) => String(r.document_number ?? "").trim() || String(r.title ?? "").trim());
    if (!valid.length) {
      toast.error("Uzupełnij numer LV lub tytuł obiektu u co najmniej jednej pozycji.");
      return;
    }
    const withoutProject = valid.filter((r) => !r.project_id);
    if (withoutProject.length) {
      toast.warning(`${withoutProject.length} LV bez projektu — zapisuję mimo to.`);
    }

    setProcessing(true);
    try {
      const payloads = valid.map((r) => {
        const { _manualStub, _extractionSource, _projectMatchReason, _projectMatchManual, _projectMatchConfidence, ...rest } =
          r;
        return pickProjectBoQApiPayload(withMatch(rest));
      });
      await bulkCreateOrSequential(base44.entities.ProjectBoQ, payloads, (r) => r.document_number || r.title || "LV");
      toast.success(`Zapisano ${payloads.length} kosztorysów LV`);
      navigate(createPageUrl("ProjectBoQ"));
    } catch (e) {
      toast.error(formatBase44Error(e) || "Błąd zapisu LV");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="w-full p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileSpreadsheet className="h-8 w-8 text-blue-600" />
          Import LV (Leistungsverzeichnis DE)
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Wgraj niemiecki kosztorys prac (LV / Angebot / GAEB jako PDF lub JSON). System odczyta pozycje, sumy netto i
          przypisze projekt (market w DE).
          {isClaudeConfigured() ? " Claude obsługuje skany wielostronicowe." : " Dla skanów włącz Claude w Ustawieniach AI."}
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
              <p className="text-muted-foreground mb-4">Przeciągnij PDF LV lub plik JSON</p>
              <Input
                type="file"
                accept=".pdf,.json,application/pdf,application/json"
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
              Przetwórz LV ({files.length})
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "processing" && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            <p>Odczyt Leistungsverzeichnis…</p>
          </CardContent>
        </Card>
      )}

      {step === "review" && (
        <Card>
          <CardHeader>
            <CardTitle>Weryfikacja kosztorysu ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {rows.map((row, idx) => {
              const lines = normalizeLvLines(row.lines);
              const net =
                row.total_net != null && row.total_net !== ""
                  ? Number(row.total_net)
                  : lines.length
                    ? sumLvLines(lines)
                    : null;
              return (
                <div key={idx} className="border rounded-lg p-4 space-y-3">
                  <div className="flex flex-wrap gap-2 items-center justify-between">
                    <span className="font-medium text-sm">{row.fileName || `LV ${idx + 1}`}</span>
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-xs text-muted-foreground">{lvLinesCount(lines)} poz.</span>
                      {net != null && (
                        <span className="text-xs font-medium">{formatLvMoney(net, row.currency)} netto</span>
                      )}
                      <ProjectMatchBadge row={row} projects={projects} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>Nr LV / Angebot</Label>
                      <Input
                        value={row.document_number || ""}
                        onChange={(e) => updateRow(idx, "document_number", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Data</Label>
                      <Input
                        type="date"
                        value={(row.issue_date || "").slice(0, 10)}
                        onChange={(e) => updateRow(idx, "issue_date", e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Tytuł / Objekt (Markt)</Label>
                      <Input value={row.title || ""} onChange={(e) => updateRow(idx, "title", e.target.value)} />
                    </div>
                    <div>
                      <Label>Auftraggeber (klient)</Label>
                      <Input value={row.client_name || ""} onChange={(e) => updateRow(idx, "client_name", e.target.value)} />
                    </div>
                    <div>
                      <Label>Vergabenummer / PO</Label>
                      <Input
                        value={row.order_number || ""}
                        onChange={(e) => updateRow(idx, "order_number", e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Baustelle / adres</Label>
                      <Input
                        value={row.site_address || ""}
                        onChange={(e) => updateRow(idx, "site_address", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Suma netto (EUR)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.total_net ?? ""}
                        onChange={(e) => updateRow(idx, "total_net", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Suma brutto (EUR)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.total_gross ?? ""}
                        onChange={(e) => updateRow(idx, "total_gross", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Projekt (market DE)</Label>
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
                      <Label>
                        Pozycje LV (JSON: oz, description, unit, quantity, unit_price, line_total) — max. widok edycji
                      </Label>
                      <Textarea
                        rows={8}
                        className="font-mono text-xs"
                        value={JSON.stringify(lines, null, 2)}
                        onChange={(e) => updateRow(idx, "lines", e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Uwagi</Label>
                      <Input value={row.notes || ""} onChange={(e) => updateRow(idx, "notes", e.target.value)} />
                    </div>
                  </div>
                </div>
              );
            })}
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
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={processing} onClick={saveAll}>
                {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Zapisz LV ({rows.length})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
