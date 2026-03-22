import React, { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { normalizePayer } from "@/components/utils/normalize";
import { parsePolishInvoiceXml } from "@/lib/xml-polish-invoice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload as UploadIcon, FileText, Loader2, CheckCircle, AlertCircle, XCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  extractInvoiceFromPdfOpenAI,
  mapOpenAiInvoiceJsonToInternal,
  isOpenAiConfigured,
} from "@/lib/openai-mizar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { enrichInvoiceForSave, pickInvoiceApiPayload } from "@/lib/invoice-fx";
import {
  findDuplicateInvoice,
  invoiceNumberMatches,
  normalizeInvoiceNumberKey,
} from "@/lib/duplicate-detection";
import { OCR_LLM_ATTEMPTS, pickInvoiceOcrPrompt } from "@/lib/invoice-ocr-prompts";

function detectFormat(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith(".xml")) return "xml";
  if (n.endsWith(".pdf")) return "pdf";
  return "unknown";
}

/** Wynik OCR uznajemy za sensowny, jeśli jest choć numer lub nazwa — weryfikacja i tak jest ręczna. */
function ocrInvoiceHasMinimumFields(inv) {
  const num = String(inv?.invoice_number ?? "").trim();
  const name = String(inv?.contractor_name ?? "").trim();
  return num.length > 0 || name.length > 0;
}

function matchProjectId(projects, invoice) {
  const cn = (invoice.contractor_name || "").toLowerCase().trim();
  const order = (invoice.order_number || "").toLowerCase().trim();
  for (const p of projects) {
    const client = (p.client_name || "").toLowerCase().trim();
    if (client && (cn.includes(client) || client.includes(cn))) return p.id;
    const oname = (p.object_name || "").toLowerCase().trim();
    if (oname && (cn.includes(oname) || oname.includes(cn))) return p.id;
    const nums = (p.invoice_numbers || "").toLowerCase();
    if (order && nums.includes(order)) return p.id;
    if (invoice.invoice_number && nums.includes(String(invoice.invoice_number).toLowerCase())) return p.id;
  }
  return null;
}

function aiFieldClass(invoice, field) {
  return invoice._aiHighlight?.[field]
    ? "bg-yellow-100 border-yellow-400 dark:bg-yellow-950/35 dark:border-yellow-700"
    : "";
}

export default function Upload() {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState("upload");
  const [extractedData, setExtractedData] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [reAiLoading, setReAiLoading] = useState(null);
  const navigate = useNavigate();

  const { data: projects = [] } = useQuery({
    queryKey: ["construction-sites"],
    queryFn: () => base44.entities.ConstructionSite.list(),
  });

  const parseXMLFile = async (file) => {
    const text = await file.text();
    try {
      const jpk = parsePolishInvoiceXml(text);
      if (jpk.length) return jpk;
    } catch (e) {
      console.warn("XML JPK/e-FA parse:", e);
    }
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    const invoices = xmlDoc.getElementsByTagName("invoice");
    const results = [];
    for (let inv of invoices) {
      const getTagValue = (tagName) => {
        const elem = inv.getElementsByTagName(tagName)[0];
        return elem ? elem.textContent : "";
      };
      results.push({
        invoice_number: getTagValue("invoice_number"),
        contractor_name: getTagValue("contractor_name"),
        amount: Math.abs(parseFloat(getTagValue("amount")) || 0),
        currency: getTagValue("currency") || "PLN",
        issue_date: getTagValue("issue_date"),
        payment_deadline: getTagValue("payment_deadline"),
        payer: getTagValue("payer"),
        category: getTagValue("category") || "standard",
        hotel_name: getTagValue("hotel_name"),
        city: getTagValue("city"),
        persons_count: parseInt(getTagValue("persons_count")) || null,
        stay_period: getTagValue("stay_period"),
      });
    }
    return results;
  };

  const onFilesAdded = useCallback((list) => {
    const arr = Array.from(list || []).filter((f) => {
      const fmt = detectFormat(f);
      if (fmt === "unknown") {
        toast.error(`Pominięto plik (tylko PDF/XML): ${f.name}`);
        return false;
      }
      return true;
    });
    if (arr.length) setFiles((prev) => [...prev, ...arr]);
  }, []);

  const handleFileChange = (e) => {
    onFilesAdded(e.target.files);
    e.target.value = "";
  };

  const processInvoices = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setStep("processing");
    setProgress({ current: 0, total: files.length });

    try {
      const uploadedFiles = await Promise.all(
        files.map(async (file) => {
          const fmt = detectFormat(file);
          if (fmt === "xml") return { file, xmlData: true, format: "xml" };
          try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            return { file, file_url, format: "pdf" };
          } catch (err) {
            try {
              const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
              const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri });
              return { file, file_url: signed_url, format: "pdf" };
            } catch {
              toast.error(`Nie udało się wgrać: ${file.name}`);
              return { file, skipped: true, format: "pdf" };
            }
          }
        })
      );

      let idx = 0;
      const processPromises = uploadedFiles.map(async (item) => {
        idx += 1;
        setProgress((prev) => ({ ...prev, current: Math.min(idx, prev.total) }));
        try {
          if (item.xmlData) {
            const xmlResults = await parseXMLFile(item.file);
            return xmlResults.map((r) => ({
              ...r,
              fileName: item.file.name,
              format: "xml",
            }));
          }
          if (item.skipped) return [];

          if (item.format === "pdf" && isOpenAiConfigured()) {
            try {
              const { parsed } = await extractInvoiceFromPdfOpenAI(item.file);
              const mapped = mapOpenAiInvoiceJsonToInternal(parsed, {
                pdf_url: item.file_url,
                fileName: item.file.name,
              });
              if (mapped && (mapped.invoice_number || mapped.contractor_name)) {
                return [
                  {
                    ...mapped,
                    project_id: matchProjectId(projects, mapped),
                    _pdfFileRef: item.file,
                  },
                ];
              }
            } catch (openErr) {
              console.warn("OpenAI PDF extraction:", openErr);
              toast.message(`OpenAI: ${openErr.message || "błąd"} — OCR Base44`);
            }
          }

          const schema = {
            type: "object",
            properties: {
              invoices: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    invoice_number: { type: "string", default: "" },
                    contractor_name: { type: "string", default: "" },
                    contractor_nip: { type: "string", default: "" },
                    amount: { type: "number", default: 0 },
                    net_amount: { type: "number", default: 0 },
                    vat_amount: { type: "number", default: 0 },
                    currency: { type: "string", default: "PLN" },
                    issue_date: { type: "string", default: "" },
                    payment_deadline: { type: "string", default: "" },
                    payer: { type: "string", default: "" },
                    position: { type: "string", default: "" },
                    category: { type: "string", default: "standard" },
                    order_number: { type: "string", default: "" },
                    line_items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          quantity: { type: "number" },
                          net: { type: "number" },
                          vat: { type: "number" },
                          gross: { type: "number" },
                        },
                      },
                    },
                    hotel_name: { type: "string", default: "" },
                    city: { type: "string", default: "" },
                    persons_count: { type: "number", default: 0 },
                    stay_period: { type: "string", default: "" },
                    is_paragon: { type: "boolean", default: false },
                    is_paid: { type: "boolean", default: false },
                    is_kanbud_seller: { type: "boolean", default: false },
                  },
                  required: ["invoice_number", "contractor_name", "amount"],
                },
              },
            },
            required: ["invoices"],
          };

          const attempts = await Promise.all(
            Array.from({ length: OCR_LLM_ATTEMPTS }, async (_, attemptIdx) => {
              try {
                return await base44.integrations.Core.InvokeLLM({
                  prompt: pickInvoiceOcrPrompt(attemptIdx),
                  file_urls: item.file_url ? [item.file_url] : [],
                  response_json_schema: schema,
                });
              } catch (err) {
                console.warn("OCR attempt failed:", err);
                return { invoices: [] };
              }
            })
          );

          const allInvoices = attempts
            .map((result) => result?.invoices || [])
            .flat()
            .filter(ocrInvoiceHasMinimumFields);

          if (allInvoices.length === 0) return [];

          const invoiceGroups = {};
          allInvoices.forEach((inv) => {
            const key = normalizeInvoiceNumberKey(inv.invoice_number) || "_brak_nr";
            if (!invoiceGroups[key]) invoiceGroups[key] = [];
            invoiceGroups[key].push(inv);
          });

          const consensusInvoices = Object.values(invoiceGroups).map((group) => {
            const normKeyStr = (s) =>
              String(s ?? "")
                .trim()
                .replace(/\s+/g, " ")
                .toLowerCase();

            const getMostCommonString = (field) => {
              const raws = group
                .map((inv) => inv[field])
                .filter((v) => v != null && String(v).trim() !== "");
              if (raws.length === 0) return "";
              const buckets = new Map();
              for (const raw of raws) {
                const k = normKeyStr(raw);
                if (!buckets.has(k)) buckets.set(k, { count: 0, best: raw });
                const b = buckets.get(k);
                b.count += 1;
                if (String(raw).length > String(b.best).length) b.best = raw;
              }
              return [...buckets.values()].sort(
                (a, b) => b.count - a.count || String(b.best).length - String(a.best).length
              )[0].best;
            };

            const getMedianPositive = (field) => {
              const values = group
                .map((inv) => inv[field])
                .filter((v) => typeof v === "number" && !Number.isNaN(v) && v > 0)
                .sort((a, b) => a - b);
              if (values.length === 0) return 0;
              const m = Math.floor(values.length / 2);
              return values.length % 2 ? values[m] : (values[m - 1] + values[m]) / 2;
            };

            const getMedianNonNegInt = (field) => {
              const values = group
                .map((inv) => inv[field])
                .filter((v) => typeof v === "number" && !Number.isNaN(v) && v >= 0)
                .sort((a, b) => a - b);
              if (values.length === 0) return 0;
              const m = Math.floor(values.length / 2);
              const med = values.length % 2 ? values[m] : (values[m - 1] + values[m]) / 2;
              return Math.round(med);
            };

            const mostCommonBoolean = (field) => {
              const trueCount = group.filter((inv) => inv[field] === true).length;
              return trueCount > group.length / 2;
            };

            const lineMerge = group
              .map((g) => (Array.isArray(g.line_items) ? g.line_items : []))
              .reduce((best, cur) => (cur.length > best.length ? cur : best), []);

            const invoice = {
              invoice_number: getMostCommonString("invoice_number"),
              contractor_name: getMostCommonString("contractor_name"),
              contractor_nip: getMostCommonString("contractor_nip"),
              amount: Math.abs(getMedianPositive("amount")),
              net_amount: Math.abs(getMedianPositive("net_amount")) || null,
              vat_amount: Math.abs(getMedianPositive("vat_amount")) || null,
              currency: (getMostCommonString("currency") || "PLN").toUpperCase(),
              issue_date: getMostCommonString("issue_date"),
              payment_deadline: getMostCommonString("payment_deadline"),
              payer: getMostCommonString("payer"),
              position: getMostCommonString("position"),
              category: getMostCommonString("category") || "standard",
              order_number: getMostCommonString("order_number"),
              invoice_lines: lineMerge.length ? JSON.stringify(lineMerge) : "",
              hotel_name: getMostCommonString("hotel_name"),
              city: getMostCommonString("city"),
              persons_count: getMedianNonNegInt("persons_count"),
              stay_period: getMostCommonString("stay_period"),
              is_paragon: mostCommonBoolean("is_paragon"),
              is_paid: mostCommonBoolean("is_paid"),
              is_kanbud_seller: mostCommonBoolean("is_kanbud_seller"),
            };

            const isParagon = invoice.is_paragon === true;
            const isCurrencyExchange =
              invoice.position &&
              invoice.contractor_name &&
              (invoice.contractor_name.toUpperCase().includes("KANTOR") ||
                invoice.position.toUpperCase().includes("KANTOR") ||
                invoice.position.toUpperCase().includes("WYMIANA") ||
                invoice.position.toUpperCase().includes("EXCHANGE"));

            return {
              ...invoice,
              pdf_url: item.file_url,
              fileName: item.file.name,
              format: "pdf",
              is_paragon: isParagon || isCurrencyExchange,
              is_paid: invoice.is_paid || isParagon || isCurrencyExchange,
              _pdfFileRef: item.file,
            };
          });

          return consensusInvoices;
        } catch (e) {
          console.error(`Error processing ${item.file.name}:`, e);
          const errorMsg = e?.data?.message || e?.message || "Błąd podczas przetwarzania pliku";
          setError(errorMsg);
          toast.error(errorMsg);
          return [];
        }
      });

      const allResults = await Promise.all(processPromises);
      const flatResults = allResults.flat();

      const stubRows = [];
      for (const item of uploadedFiles) {
        if (item.skipped) continue;
        const hasForFile = flatResults.some((r) => r.fileName === item.file.name);
        if (hasForFile) continue;
        if (item.xmlData) {
          stubRows.push({
            invoice_number: "",
            contractor_name: "",
            amount: 0,
            currency: "PLN",
            category: "standard",
            fileName: item.file.name,
            format: "xml",
            _manualStub: true,
          });
        } else {
          stubRows.push({
            invoice_number: "",
            contractor_name: "",
            amount: 0,
            currency: "PLN",
            category: "standard",
            pdf_url: item.file_url,
            fileName: item.file.name,
            format: "pdf",
            _pdfFileRef: item.file,
            _manualStub: true,
          });
        }
      }
      const flatWithStubs = [...flatResults, ...stubRows];

      const deduplicatedResults = [];
      const seenByFile = new Map();
      flatWithStubs.forEach((invoice) => {
        const invKey = String(invoice.invoice_number ?? "").trim() || "_brak_nr";
        const key = `${invoice.fileName}_${invKey}`;
        if (!seenByFile.has(key)) {
          seenByFile.set(key, true);
          deduplicatedResults.push({
            ...invoice,
            project_id: invoice.project_id || matchProjectId(projects, invoice),
            _rejected: false,
          });
        }
      });

      setExtractedData(deduplicatedResults);
      setStep("review");
      if (deduplicatedResults.length === 0) {
        toast.warning("Brak faktur do weryfikacji — sprawdź pliki lub OCR.");
      } else if (deduplicatedResults.every((r) => r._manualStub)) {
        toast.warning(
          "Nie udało się odczytać plików automatycznie — uzupełnij pola ręcznie lub użyj „Popraw z AI” (PDF + klucz OpenAI)."
        );
      } else if (deduplicatedResults.some((r) => r._manualStub)) {
        toast.success(
          `Wyekstrahowano ${deduplicatedResults.length} pozycji — część bez OCR; uzupełnij dane ręcznie lub „Popraw z AI”.`
        );
      } else {
        toast.success(`Wyekstrahowano ${deduplicatedResults.length} pozycji do weryfikacji`);
      }
    } catch (err) {
      console.error("Error:", err);
      const msg = err.message || "Błąd podczas przetwarzania plików";
      setError(msg);
      toast.error(msg);
      setStep("upload");
    } finally {
      setProcessing(false);
    }
  };

  const saveInvoices = async () => {
    const toSave = extractedData.filter((i) => !i._rejected);
    if (toSave.length === 0) {
      toast.error("Brak pozycji do zapisu (wszystkie odrzucone?)");
      return;
    }
    const incomplete = toSave.filter(
      (i) => !String(i.invoice_number ?? "").trim() || !String(i.contractor_name ?? "").trim()
    );
    if (incomplete.length > 0) {
      toast.error("Uzupełnij numer faktury i kontrahenta u wszystkich pozycji zapisanych do bazy.");
      return;
    }

    setProcessing(true);
    try {
      const existingInvoices = await base44.entities.Invoice.list();
      const projectList = await base44.entities.ConstructionSite.list();

      const newInvoices = [];
      let duplicatesInDb = 0;
      let duplicatesInBatch = 0;
      for (const inv of toSave) {
        if (findDuplicateInvoice(existingInvoices, inv)) {
          duplicatesInDb += 1;
          continue;
        }
        if (newInvoices.some((kept) => invoiceNumberMatches(kept.invoice_number, inv.invoice_number))) {
          duplicatesInBatch += 1;
          continue;
        }
        newInvoices.push(inv);
      }

      const duplicatesCount = duplicatesInDb + duplicatesInBatch;
      if (newInvoices.length === 0) {
        toast.error(
          `Wszystkie pozycje to duplikaty (${duplicatesInDb} w bazie${duplicatesInBatch ? `, ${duplicatesInBatch} w tej paczce` : ""}).`
        );
        setProcessing(false);
        return;
      }
      if (duplicatesCount > 0) {
        const parts = [];
        if (duplicatesInDb) parts.push(`${duplicatesInDb} już w bazie`);
        if (duplicatesInBatch) parts.push(`${duplicatesInBatch} powtórzone w imporcie`);
        toast.message(`Pominięto duplikaty (${parts.join(", ")}) — zapisuję ${newInvoices.length} nowych.`);
      }

      const hotelInvoices = newInvoices.filter((inv) => inv.category === "hotel");
      const standardInvoices = newInvoices.filter((inv) => inv.category !== "hotel");

      if (standardInvoices.length > 0) {
        const existingContractors = await base44.entities.Contractor.list();
        const contractorNames = new Set(existingContractors.map((c) => c.name?.toLowerCase()));
        const uniqueContractors = [...new Set(standardInvoices.map((inv) => inv.contractor_name))].filter(Boolean);
        const newContractors = uniqueContractors.filter((name) => !contractorNames.has(name.toLowerCase()));
        if (newContractors.length > 0) {
          await base44.entities.Contractor.bulkCreate(
            newContractors.map((name) => ({ name, type: "supplier", status: "active" }))
          );
        }
      }

      const baseRows = newInvoices.map((data) => {
        const {
          fileName: _fn,
          format: _fmt,
          _rejected: _rej,
          _sourceXml: _sx,
          is_kanbud_seller,
          is_paragon,
          is_paid,
          line_items: _lines,
          _aiHighlight: _ah,
          _aiConfidence: _ac,
          _pdfFileRef: _pdfRef,
          ...rest
        } = data;
        const normalizedPayer = normalizePayer(data.payer);
        const isSales = is_kanbud_seller === true;
        const paragon = is_paragon === true;
        const paidFlag = is_paid === true;
        const project_id = data.project_id || matchProjectId(projectList, data);
        return {
          ...rest,
          payer: normalizedPayer,
          status: paragon || paidFlag ? "paid" : "unpaid",
          invoice_type: isSales ? "sales" : "purchase",
          project_id: project_id || undefined,
          contractor_nip: data.contractor_nip || undefined,
          net_amount: data.net_amount ?? undefined,
          vat_amount: data.vat_amount ?? undefined,
          invoice_lines: data.invoice_lines || undefined,
          order_number: data.order_number || undefined,
        };
      });

      const invoicesToSave = [];
      for (const row of baseRows) {
        const enriched = await enrichInvoiceForSave(row, { recomputePaid: row.status === "paid" });
        invoicesToSave.push(pickInvoiceApiPayload(enriched));
      }

      await base44.entities.Invoice.bulkCreate(invoicesToSave);

      if (hotelInvoices.length > 0) {
        const existingStays = await base44.entities.HotelStay.list();
        const hotelStaysToCreate = [];
        for (const inv of hotelInvoices) {
          if (!String(inv.invoice_number ?? "").trim()) continue;
          if (existingStays.some((s) => invoiceNumberMatches(s.invoice_number, inv.invoice_number))) continue;
          if (hotelStaysToCreate.some((s) => invoiceNumberMatches(s.invoice_number, inv.invoice_number))) continue;
          hotelStaysToCreate.push({
            invoice_number: inv.invoice_number,
            hotel_name: inv.hotel_name || inv.contractor_name,
            city: inv.city,
            stay_period: inv.stay_period,
            persons_count: inv.persons_count,
            amount: inv.amount,
            currency: inv.currency,
            status: "unpaid",
            source: "invoice",
            invoice_id: null,
          });
        }
        if (hotelStaysToCreate.length > 0) {
          await base44.entities.HotelStay.bulkCreate(hotelStaysToCreate);
        }
      }

      toast.success(
        `Zapisano ${invoicesToSave.length} faktur${hotelInvoices.length ? ` (${hotelInvoices.length} hotelowych)` : ""}.`
      );
      navigate(createPageUrl("Invoices"));
    } catch (err) {
      console.error("Error:", err);
      toast.error("Błąd podczas zapisywania faktur");
    } finally {
      setProcessing(false);
    }
  };

  const updateInvoice = (index, field, value) => {
    const updated = [...extractedData];
    const row = { ...updated[index], [field]: value };
    if (row._aiHighlight && typeof row._aiHighlight === "object") {
      row._aiHighlight = { ...row._aiHighlight, [field]: false };
    }
    updated[index] = row;
    setExtractedData(updated);
  };

  const reextractWithOpenAi = async (idx) => {
    const inv = extractedData[idx];
    const file = inv._pdfFileRef;
    if (!file) {
      toast.error("Brak pliku PDF w pamięci — dodaj plik ponownie i przetwórz.");
      return;
    }
    if (!isOpenAiConfigured()) {
      toast.error("Brak klucza OpenAI (VITE_OPENAI_API_KEY lub Ustawienia AI)");
      return;
    }
    setReAiLoading(idx);
    try {
      const { parsed } = await extractInvoiceFromPdfOpenAI(file);
      const mapped = mapOpenAiInvoiceJsonToInternal(parsed, {
        pdf_url: inv.pdf_url,
        fileName: inv.fileName,
      });
      if (!mapped || (!mapped.invoice_number && !mapped.contractor_name)) {
        throw new Error("AI nie zwróciło kompletnych danych");
      }
      const updated = [...extractedData];
      updated[idx] = {
        ...mapped,
        project_id: matchProjectId(projects, mapped) || inv.project_id,
        _pdfFileRef: file,
        _rejected: false,
      };
      setExtractedData(updated);
      toast.success("Formularz uzupełniony ponownie przez AI");
    } catch (e) {
      toast.error(e?.message || "Błąd OpenAI");
    } finally {
      setReAiLoading(null);
    }
  };

  const rejectInvoice = (index) => {
    const updated = [...extractedData];
    updated[index] = { ...updated[index], _rejected: true };
    setExtractedData(updated);
    toast.message("Oznaczono jako odrzucone (nie zostanie zapisane)");
  };

  return (
    <div className="w-full p-6">
      <div className="max-w-4xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Import faktur PDF / XML</h1>
          <p className="text-muted-foreground">
            PDF: OpenAI (gpt-4o + plik) gdy skonfigurowany klucz, w przeciwnym razie OCR Base44; XML JPK-FA / e-faktura; weryfikacja i projekt
          </p>
        </motion.div>

        <Dialog open={!!error} onOpenChange={(open) => !open && setError(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                Błąd przetwarzania
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-muted-foreground">{error}</p>
            </div>
            <DialogFooter>
              <Button onClick={() => setError(null)}>OK</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {step === "upload" && (
          <Card>
            <CardHeader>
              <CardTitle>Przeciągnij pliki lub wybierz z dysku</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div
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
                  className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                    dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
                  }`}
                >
                  <UploadIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <Label htmlFor="file-upload" className="cursor-pointer">
                    <span className="text-primary font-medium">Wybierz plik</span>
                    <span className="text-muted-foreground"> lub upuść PDF / XML</span>
                  </Label>
                  <Input id="file-upload" type="file" accept=".pdf,.xml" multiple onChange={handleFileChange} className="hidden" />
                  {files.length > 0 && (
                    <ul className="mt-4 text-sm text-left max-h-40 overflow-y-auto space-y-1">
                      {files.map((f) => (
                        <li key={f.name + f.size} className="flex justify-between gap-2">
                          <span className="truncate">{f.name}</span>
                          <span className="text-muted-foreground shrink-0">{detectFormat(f).toUpperCase()}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <Button onClick={processInvoices} disabled={files.length === 0 || processing} className="w-full">
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Przetwarzanie...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Przetwórz ({files.length})
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "processing" && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Loader2 className="mx-auto h-16 w-16 text-primary animate-spin mb-4" />
                <h3 className="text-xl font-semibold mb-2">Przetwarzanie...</h3>
                <p className="text-muted-foreground mb-4">
                  Plik {progress.current} z {progress.total}
                </p>
                <div className="w-full bg-muted rounded-full h-2.5 max-w-md mx-auto">
                  <div
                    className="bg-primary h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "review" && extractedData.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Brak wyników</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Żaden plik nie został rozpoznany. Sprawdź format (PDF/XML), połączenie z Base44 oraz klucz OpenAI w ustawieniach.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setStep("upload");
                  setFiles([]);
                  setExtractedData([]);
                }}
              >
                Wróć do wyboru plików
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "review" && extractedData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Weryfikacja ({extractedData.filter((i) => !i._rejected).length} do zapisu)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {extractedData.map((invoice, idx) => (
                  <div
                    key={idx}
                    className={`border rounded-lg p-4 ${invoice._rejected ? "opacity-50 bg-muted" : "bg-card"}`}
                  >
                    <div className="flex flex-wrap justify-between gap-2 mb-3">
                      <h4 className="font-semibold">
                        {invoice.fileName} — {invoice.format?.toUpperCase()}
                        {invoice._rejected && <span className="text-destructive ml-2">(odrzucona)</span>}
                      </h4>
                      {!invoice._rejected && (
                        <div className="flex flex-wrap gap-2">
                          {invoice._pdfFileRef && isOpenAiConfigured() && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={reAiLoading === idx}
                              onClick={() => reextractWithOpenAi(idx)}
                              className="border-amber-500/30"
                            >
                              {reAiLoading === idx ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Sparkles className="h-4 w-4 mr-1 text-amber-600" />
                              )}
                              Popraw z AI
                            </Button>
                          )}
                          <Button type="button" variant="outline" size="sm" onClick={() => rejectInvoice(idx)}>
                            <XCircle className="h-4 w-4 mr-1" />
                            Odrzuć
                          </Button>
                        </div>
                      )}
                    </div>
                    {!invoice._rejected && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className="flex items-center flex-wrap gap-1">
                            Numer faktury
                            {invoice._aiConfidence?.invoice_number != null && (
                              <span className="text-[10px] font-normal text-muted-foreground">
                                AI {invoice._aiConfidence.invoice_number}%
                              </span>
                            )}
                          </Label>
                          <Input
                            className={cn(aiFieldClass(invoice, "invoice_number"))}
                            value={invoice.invoice_number || ""}
                            onChange={(e) => updateInvoice(idx, "invoice_number", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="flex items-center flex-wrap gap-1">
                            Kontrahent
                            {invoice._aiConfidence?.contractor_name != null && (
                              <span className="text-[10px] font-normal text-muted-foreground">
                                AI {invoice._aiConfidence.contractor_name}%
                              </span>
                            )}
                          </Label>
                          <Input
                            className={cn(aiFieldClass(invoice, "contractor_name"))}
                            value={invoice.contractor_name || ""}
                            onChange={(e) => updateInvoice(idx, "contractor_name", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="flex items-center flex-wrap gap-1">
                            NIP
                            {invoice._aiConfidence?.contractor_nip != null && (
                              <span className="text-[10px] font-normal text-muted-foreground">
                                AI {invoice._aiConfidence.contractor_nip}%
                              </span>
                            )}
                          </Label>
                          <Input
                            className={cn(aiFieldClass(invoice, "contractor_nip"))}
                            value={invoice.contractor_nip || ""}
                            onChange={(e) => updateInvoice(idx, "contractor_nip", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>Nr zamówienia</Label>
                          <Input
                            value={invoice.order_number || ""}
                            onChange={(e) => updateInvoice(idx, "order_number", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="flex items-center flex-wrap gap-1">
                            Kwota brutto / waluta
                            {invoice._aiConfidence?.amount != null && (
                              <span className="text-[10px] font-normal text-muted-foreground">
                                AI {invoice._aiConfidence.amount}%
                              </span>
                            )}
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              value={invoice.amount ?? ""}
                              onChange={(e) => updateInvoice(idx, "amount", parseFloat(e.target.value))}
                              className={cn("flex-1", aiFieldClass(invoice, "amount"))}
                            />
                            <Input
                              value={invoice.currency || "PLN"}
                              onChange={(e) => updateInvoice(idx, "currency", e.target.value)}
                              className={cn("w-20", aiFieldClass(invoice, "currency"))}
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="flex items-center flex-wrap gap-1">
                            Netto / VAT
                            {invoice._aiConfidence?.net_amount != null && (
                              <span className="text-[10px] font-normal text-muted-foreground">
                                netto AI {invoice._aiConfidence.net_amount}%
                              </span>
                            )}
                            {invoice._aiConfidence?.vat_amount != null && (
                              <span className="text-[10px] font-normal text-muted-foreground">
                                VAT AI {invoice._aiConfidence.vat_amount}%
                              </span>
                            )}
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              placeholder="Netto"
                              value={invoice.net_amount ?? ""}
                              onChange={(e) => updateInvoice(idx, "net_amount", parseFloat(e.target.value) || null)}
                              className={cn("flex-1", aiFieldClass(invoice, "net_amount"))}
                            />
                            <Input
                              type="number"
                              placeholder="VAT"
                              value={invoice.vat_amount ?? ""}
                              onChange={(e) => updateInvoice(idx, "vat_amount", parseFloat(e.target.value) || null)}
                              className={cn("flex-1", aiFieldClass(invoice, "vat_amount"))}
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="flex items-center flex-wrap gap-1">
                            Data wystawienia
                            {invoice._aiConfidence?.issue_date != null && (
                              <span className="text-[10px] font-normal text-muted-foreground">
                                AI {invoice._aiConfidence.issue_date}%
                              </span>
                            )}
                          </Label>
                          <Input
                            type="date"
                            className={cn(aiFieldClass(invoice, "issue_date"))}
                            value={invoice.issue_date?.slice(0, 10) || ""}
                            onChange={(e) => updateInvoice(idx, "issue_date", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="flex items-center flex-wrap gap-1">
                            Termin płatności
                            {invoice._aiConfidence?.payment_deadline != null && (
                              <span className="text-[10px] font-normal text-muted-foreground">
                                AI {invoice._aiConfidence.payment_deadline}%
                              </span>
                            )}
                          </Label>
                          <Input
                            type="date"
                            className={cn(aiFieldClass(invoice, "payment_deadline"))}
                            value={invoice.payment_deadline?.slice(0, 10) || ""}
                            onChange={(e) => updateInvoice(idx, "payment_deadline", e.target.value)}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label>Projekt</Label>
                          <Select
                            value={invoice.project_id || "none"}
                            onValueChange={(v) => updateInvoice(idx, "project_id", v === "none" ? null : v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Przypisz projekt" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— brak —</SelectItem>
                              {projects.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.object_name || p.city}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground mt-1">
                            Automat: dopasowanie po kliencie, nazwie obiektu lub numerze w polu projektu.
                          </p>
                        </div>
                        <div className="md:col-span-2">
                          <Label className="flex items-center flex-wrap gap-1">
                            Pozycje (JSON z OCR/XML)
                            {invoice._aiConfidence?.invoice_lines != null && (
                              <span className="text-[10px] font-normal text-muted-foreground">
                                AI {invoice._aiConfidence.invoice_lines}%
                              </span>
                            )}
                          </Label>
                          <Textarea
                            rows={3}
                            className={cn("font-mono text-xs", aiFieldClass(invoice, "invoice_lines"))}
                            value={invoice.invoice_lines || ""}
                            onChange={(e) => updateInvoice(idx, "invoice_lines", e.target.value)}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="flex items-center flex-wrap gap-1">
                            Opis / pozycja
                            {invoice._aiConfidence?.position != null && (
                              <span className="text-[10px] font-normal text-muted-foreground">
                                AI {invoice._aiConfidence.position}%
                              </span>
                            )}
                          </Label>
                          <Input
                            className={cn(aiFieldClass(invoice, "position"))}
                            value={invoice.position || ""}
                            onChange={(e) => updateInvoice(idx, "position", e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setStep("upload");
                      setFiles([]);
                      setExtractedData([]);
                    }}
                  >
                    Anuluj
                  </Button>
                  <Button type="button" onClick={saveInvoices} disabled={processing} className="flex-1">
                    {processing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Zapisywanie...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Zapisz ({extractedData.filter((i) => !i._rejected).length})
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
