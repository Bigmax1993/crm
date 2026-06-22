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
import { extractWzFromPdf } from "@/lib/wz-extract";
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

export default function UploadWZ() {
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
            results.push(
              withMatch({
                ...emptyMaterialDelivery(mapped),
                lines: normalizeLines(mapped.lines).length
                  ? normalizeLines(mapped.lines)
                  : [{ name: "Piasek", unit: "t", quantity: 0 }],
              })
            );
          } else {
            results.push(
              withMatch({
                ...emptyMaterialDelivery({ fileName: file.name }),
                _manualStub: true,
                _extractionSource: "manual",
              })
            );
            toast.warning(`„${file.name}”: nie rozpoznano — uzupełnij ręcznie.`);
          }
        } catch (e) {
          console.warn("WZ extract:", e);
          toast.error(`${file.name}: ${e?.message || "błąd odczytu"}`);
          results.push(
            withMatch({
              ...emptyMaterialDelivery({ fileName: file.name }),
              _manualStub: true,
            })
          );
        }
      }
      setRows(results);
      setStep("review");
      toast.success(`Przetworzono ${results.length} dokumentów WZ`);
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
        row.lines = [{ name: value, unit: "t", quantity: 0 }];
      }
    }
    next[index] = row;
    setRows(next);
  };

  const saveAll = async () => {
    const valid = rows.filter((r) => String(r.document_number ?? "").trim() && String(r.supplier_name ?? "").trim());
    if (!valid.length) {
      toast.error("Uzupełnij numer WZ i dostawcę u co najmniej jednej pozycji.");
      return;
    }
    const withoutProject = valid.filter((r) => !r.project_id);
    if (withoutProject.length) {
      toast.warning(`${withoutProject.length} WZ bez projektu — zapisuję mimo to.`);
    }

    setProcessing(true);
    try {
      const payloads = valid.map((r) => {
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
          rejestr dostaw.
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
            <CardTitle>Weryfikacja ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {rows.map((row, idx) => (
              <div key={idx} className="border rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <span className="font-medium text-sm">{row.fileName || `Dokument ${idx + 1}`}</span>
                  <ProjectMatchBadge row={row} projects={projects} />
                </div>
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
                    <Label>Projekt (market)</Label>
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
              </div>
            ))}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setStep("upload"); setRows([]); setFiles([]); }}>
                Anuluj
              </Button>
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={processing} onClick={saveAll}>
                {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Zapisz WZ ({rows.length})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
