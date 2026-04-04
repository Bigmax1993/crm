import React, { useState, useCallback, useRef } from "react";
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
  extractInvoiceFromXmlTextOpenAI,
  mapOpenAiInvoiceJsonToInternal,
  isOpenAiConfigured,
} from "@/lib/openai-crm";
import { extractInvoiceFromPdfBase44 } from "@/lib/invoice-pdf-base44";
import { extractPlainTextFromPdfWithOcrFallback } from "@/lib/invoice-pdf-plain-text";
import { heuristicInvoiceFromPdfText } from "@/lib/invoice-heuristic-from-text";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { enrichInvoiceForSave, pickInvoiceApiPayload } from "@/lib/invoice-fx";
import {
  findDuplicateInvoice,
  invoiceNumberMatches,
  normalizeInvoiceNumberKey,
} from "@/lib/duplicate-detection";
import { looksLikeBankReportName, looksLikeBankReportPlain } from "@/lib/invoice-report-detection";
import { bulkCreateOrSequential, formatBase44Error } from "@/lib/base44-entity-save";
import { displayInvoiceSeller, displayInvoiceContractor } from "@/lib/invoice-schema";
import { matchProjectId } from "@/lib/match-project";

function detectFormat(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith(".xml")) return "xml";
  if (n.endsWith(".pdf")) return "pdf";
  return "unknown";
}

function ExtractionSourceBadge({ source }) {
  const labels = {
    heuristic: "Heurystyka",
    openai: "OpenAI",
    base44: "Base44 OCR",
    xml: "XML",
    manual: "Ręcznie / nieodczytane",
  };
  if (!source) return null;
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border whitespace-nowrap">
      {labels[source] ?? source}
    </span>
  );
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
  const [checkingReports, setCheckingReports] = useState(false);
  const [reportDialog, setReportDialog] = useState(null);
  const reportResolveRef = useRef(null);
  const navigate = useNavigate();

  const { data: projects = [] } = useQuery({
    queryKey: ["construction-sites"],
    queryFn: () => base44.entities.ConstructionSite.list(),
  });
  const { data: contractors = [] } = useQuery({
    queryKey: ["contractors"],
    queryFn: () => base44.entities.Contractor.list(),
  });
  const projectMatchOpts = { contractors };

  /** Parsuje XML już wczytany do stringa (jeden odczyt pliku na początku przetwarzania). */
  const parseInvoiceRowsFromXmlString = (text) => {
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
        seller_name: getTagValue("seller_name"),
        seller_nip: getTagValue("seller_nip"),
        contractor_name: getTagValue("contractor_name"),
        contractor_nip: getTagValue("contractor_nip"),
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

  const executeProcessInvoices = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setStep("processing");
    setProgress({ current: 0, total: files.length });

    try {
      const uploadedFiles = await Promise.all(
        files.map(async (file) => {
          const fmt = detectFormat(file);
          if (fmt === "xml") {
            const xmlText = await file.text();
            return { file, xmlData: true, format: "xml", xmlText };
          }
          /* PDF lokalnie: pdf.js + heurystyka (bez LLM), opcjonalnie OpenAI. */
          return { file, format: "pdf" };
        })
      );

      let idx = 0;
      const processPromises = uploadedFiles.map(async (item) => {
        idx += 1;
        setProgress((prev) => ({ ...prev, current: Math.min(idx, prev.total) }));
        try {
          if (item.xmlData) {
            const xmlResults = parseInvoiceRowsFromXmlString(item.xmlText);
            return xmlResults.map((r) => ({
              ...r,
              fileName: item.file.name,
              format: "xml",
              _extractionSource: "xml",
              _xmlFileRef: item.file,
              _xmlTextSnapshot: item.xmlText,
            }));
          }
          if (item.skipped) return [];

          if (item.format === "pdf") {
            let plain = "";
            try {
              plain = await extractPlainTextFromPdfWithOcrFallback(item.file);
            } catch (pdfErr) {
              console.warn("PDF tekst (pdf.js):", pdfErr);
            }

            const heur = heuristicInvoiceFromPdfText(plain, item.file.name);
            if (
              heur &&
              (heur.invoice_number?.trim() ||
                heur.seller_name?.trim() ||
                heur.contractor_name?.trim() ||
                heur.seller_nip ||
                heur.contractor_nip)
            ) {
              return [
                {
                  ...heur,
                  project_id: matchProjectId(projects, heur, projectMatchOpts),
                  _pdfFileRef: item.file,
                  _heuristicOcr: true,
                  _extractionSource: "heuristic",
                },
              ];
            }

            const mapFromParsed = (parsed) =>
              mapOpenAiInvoiceJsonToInternal(parsed, {
                pdf_url: "",
                fileName: item.file.name,
              });

            let openAiErr = null;
            if (isOpenAiConfigured()) {
              try {
                const { parsed } = await extractInvoiceFromPdfOpenAI(item.file);
                const mapped = mapFromParsed(parsed);
                if (
                  mapped &&
                  (mapped.invoice_number?.trim() ||
                    mapped.seller_name?.trim() ||
                    mapped.contractor_name?.trim())
                ) {
                  return [
                    {
                      ...mapped,
                      project_id: matchProjectId(projects, mapped, projectMatchOpts),
                      _pdfFileRef: item.file,
                      _extractionSource: "openai",
                    },
                  ];
                }
                toast.message(
                  `OpenAI: brak rozpoznanej faktury w „${item.file.name}” — próbuję OCR Base44…`
                );
              } catch (openErr) {
                openAiErr = openErr;
                console.warn("OpenAI PDF extraction:", openErr);
              }
            }

            try {
              const { parsed } = await extractInvoiceFromPdfBase44(item.file);
              const mapped = mapFromParsed(parsed);
              if (
                mapped &&
                (mapped.invoice_number?.trim() ||
                  mapped.seller_name?.trim() ||
                  mapped.contractor_name?.trim())
              ) {
                return [
                  {
                    ...mapped,
                    project_id: matchProjectId(projects, mapped, projectMatchOpts),
                    _pdfFileRef: item.file,
                    _extractionSource: "base44",
                  },
                ];
              }
            } catch (b44Err) {
              console.warn("Base44 PDF invoice:", b44Err);
              if (!isOpenAiConfigured()) {
                toast.error(`Base44 OCR (${item.file.name}): ${b44Err.message || "błąd"}`);
              }
            }

            if (openAiErr) {
              toast.error(`OpenAI (${item.file.name}): ${openAiErr.message || "błąd"}`);
            }

            if (looksLikeBankReportName(item.file.name) || looksLikeBankReportPlain(plain)) {
              toast.warning(
                `„${item.file.name}” wygląda na raport lub wyciąg (nie typową fakturę VAT) — pola mogą być puste; rozważ Import przelewów lub uzupełnij ręcznie.`
              );
            } else if (plain.length < 40) {
              toast.warning(
                `PDF „${item.file.name}”: mało tekstu (często skan) — spróbuj „Popraw z AI” (OpenAI lub Base44) albo plik XML.`
              );
            } else {
              toast.warning(
                `PDF „${item.file.name}”: heurystyka nic nie wyciągnęła — „Popraw z AI” (OpenAI / Base44) lub ręcznie.`
              );
            }
            return [];
          }

          return [];
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
            seller_name: "",
            seller_nip: "",
            contractor_name: "",
            contractor_nip: "",
            amount: 0,
            currency: "PLN",
            category: "standard",
            fileName: item.file.name,
            format: "xml",
            _xmlFileRef: item.file,
            _xmlTextSnapshot: item.xmlText,
            _manualStub: true,
            _extractionSource: "manual",
          });
        } else {
          stubRows.push({
            invoice_number: "",
            seller_name: "",
            seller_nip: "",
            contractor_name: "",
            contractor_nip: "",
            amount: 0,
            currency: "PLN",
            category: "standard",
            pdf_url: "",
            fileName: item.file.name,
            format: "pdf",
            _pdfFileRef: item.file,
            _manualStub: true,
            _extractionSource: "manual",
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
            project_id: invoice.project_id || matchProjectId(projects, invoice, projectMatchOpts),
            _rejected: false,
          });
        }
      });

      let existingInvoices = [];
      try {
        existingInvoices = await base44.entities.Invoice.list();
      } catch (listErr) {
        console.warn("Invoice.list (duplikaty przy imporcie):", listErr);
        toast.warning(
          "Nie udało się pobrać faktur z bazy — duplikaty nie zostały sprawdzone. Możesz kontynuować; przy zapisie nadal obowiązuje kontrola."
        );
      }

      const seenNormInBatch = new Set();
      const withDupFlags = deduplicatedResults.map((inv) => ({ ...inv }));

      for (let i = 0; i < withDupFlags.length; i++) {
        const inv = withDupFlags[i];
        const num = String(inv.invoice_number ?? "").trim();
        if (!num) continue;

        const inDb = existingInvoices.length ? findDuplicateInvoice(existingInvoices, inv) : null;
        if (inDb) {
          withDupFlags[i] = {
            ...inv,
            _rejected: true,
            _systemDuplicate: true,
            _duplicateReason: `Numer faktury „${num}” jest już w systemie — pozycja odrzucona z importu.`,
          };
          continue;
        }

        const norm = normalizeInvoiceNumberKey(num);
        if (seenNormInBatch.has(norm)) {
          withDupFlags[i] = {
            ...inv,
            _rejected: true,
            _systemDuplicate: false,
            _duplicateReason: `Numer „${num}” występuje więcej niż raz w tej paczce — pozostawiono pierwsze wystąpienie.`,
          };
        } else {
          seenNormInBatch.add(norm);
        }
      }

      const systemDup = withDupFlags.filter((r) => r._systemDuplicate).length;
      const batchDup = withDupFlags.filter((r) => r._duplicateReason && !r._systemDuplicate).length;

      setExtractedData(withDupFlags);
      setStep("review");

      if (systemDup > 0) {
        toast.error(
          systemDup === 1
            ? "1 faktura ma numer już zapisany w systemie — została automatycznie odrzucona (szczegóły na karcie)."
            : `${systemDup} faktur ma numery już w systemie — zostały automatycznie odrzucone.`
        );
      }
      if (batchDup > 0) {
        toast.message(
          `${batchDup} pozycji odrzuconych: ten sam numer faktury wielokrotnie w tej paczce — do zapisu zostaje pierwsze wystąpienie.`
        );
      }

      if (withDupFlags.length === 0) {
        toast.warning(
          "Brak faktur do weryfikacji — sprawdź pliki, XML lub użyj AI (OpenAI w ustawieniach albo OCR Base44 przy imporcie PDF)."
        );
      } else if (withDupFlags.every((r) => r._manualStub)) {
        toast.warning(
          "Nie udało się odczytać plików automatycznie — uzupełnij pola ręcznie lub użyj „Popraw z AI” (OpenAI lub OCR Base44)."
        );
      } else if (withDupFlags.some((r) => r._manualStub)) {
        toast.success(
          `Wyekstrahowano ${withDupFlags.length} pozycji — część do uzupełnienia ręcznie; PDF/XML możesz poprawić „Popraw z AI”.`
        );
      } else {
        toast.success(`Wyekstrahowano ${withDupFlags.length} pozycji do weryfikacji`);
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

  const processInvoices = async () => {
    if (files.length === 0) return;

    const pdfFiles = files.filter((f) => detectFormat(f) === "pdf");
    if (pdfFiles.length > 0) {
      setCheckingReports(true);
      const suspiciousNames = [];
      try {
        for (const f of pdfFiles) {
          let plain = "";
          try {
            plain = await extractPlainTextFromPdfWithOcrFallback(f);
          } catch {
            /* ignore */
          }
          if (looksLikeBankReportName(f.name) || looksLikeBankReportPlain(plain)) {
            suspiciousNames.push(f.name);
          }
        }
      } finally {
        setCheckingReports(false);
      }
      const unique = [...new Set(suspiciousNames)];
      if (unique.length > 0) {
        const proceed = await new Promise((resolve) => {
          reportResolveRef.current = resolve;
          setReportDialog({ names: unique });
        });
        setReportDialog(null);
        reportResolveRef.current = null;
        if (!proceed) return;
      }
    }

    await executeProcessInvoices();
  };

  const saveInvoices = async () => {
    const toSave = extractedData.filter((i) => !i._rejected);
    if (toSave.length === 0) {
      toast.error("Brak pozycji do zapisu (wszystkie odrzucone?)");
      return;
    }
    const incomplete = toSave.filter((i) => {
      if (!String(i.invoice_number ?? "").trim()) return true;
      if (!displayInvoiceSeller(i) || !displayInvoiceContractor(i)) return true;
      return false;
    });
    if (incomplete.length > 0) {
      toast.error("Uzupełnij numer faktury, sprzedawcę i kontrahenta (nabywcę) u wszystkich pozycji zapisanych do bazy.");
      return;
    }

    setProcessing(true);
    try {
      const existingInvoices = await base44.entities.Invoice.list();
      const projectList = await base44.entities.ConstructionSite.list();
      const contractorList = await base44.entities.Contractor.list();

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
        const uniqueContractors = [
          ...new Set(
            standardInvoices.flatMap((inv) => {
              const isSales = inv.is_own_company_seller === true;
              const name = isSales
                ? String(inv.contractor_name || "").trim()
                : String(displayInvoiceSeller(inv) || "").trim();
              return name ? [name] : [];
            })
          ),
        ].filter(Boolean);
        const newContractors = uniqueContractors.filter((name) => !contractorNames.has(name.toLowerCase()));
        if (newContractors.length > 0) {
          const contractorRows = newContractors.map((name) => ({ name, type: "supplier", status: "active" }));
          await bulkCreateOrSequential(base44.entities.Contractor, contractorRows, (r) => r.name || "kontrahent");
        }
      }

      const baseRows = newInvoices.map((data) => {
        const {
          fileName: _fn,
          format: _fmt,
          _rejected: _rej,
          _sourceXml: _sx,
          is_own_company_seller,
          is_paragon,
          is_paid,
          line_items: _lines,
          _aiHighlight: _ah,
          _aiConfidence: _ac,
          _pdfFileRef: _pdfRef,
          _xmlFileRef: _xmlRef,
          _xmlTextSnapshot: _xmlTextSnap,
          _extractionSource: _exSrc,
          _manualStub: _stub,
          _heuristicOcr: _heur,
          _systemDuplicate: _sysDup,
          _duplicateReason: _dupReason,
          ...rest
        } = data;
        const normalizedPayer = normalizePayer(data.payer);
        const isSales = is_own_company_seller === true;
        const paragon = is_paragon === true;
        const paidFlag = is_paid === true;
        const project_id =
          data.project_id || matchProjectId(projectList, data, { contractors: contractorList });
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

      await bulkCreateOrSequential(base44.entities.Invoice, invoicesToSave);

      if (hotelInvoices.length > 0) {
        const existingStays = await base44.entities.HotelStay.list();
        const hotelStaysToCreate = [];
        for (const inv of hotelInvoices) {
          if (!String(inv.invoice_number ?? "").trim()) continue;
          if (existingStays.some((s) => invoiceNumberMatches(s.invoice_number, inv.invoice_number))) continue;
          if (hotelStaysToCreate.some((s) => invoiceNumberMatches(s.invoice_number, inv.invoice_number))) continue;
          hotelStaysToCreate.push({
            invoice_number: inv.invoice_number,
            hotel_name: inv.hotel_name || displayInvoiceSeller(inv) || inv.contractor_name,
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
          await bulkCreateOrSequential(base44.entities.HotelStay, hotelStaysToCreate, (r) => r.invoice_number || "hotel");
        }
      }

      toast.success(
        `Zapisano ${invoicesToSave.length} faktur${hotelInvoices.length ? ` (${hotelInvoices.length} hotelowych)` : ""}.`
      );
      navigate(createPageUrl("Invoices"));
    } catch (err) {
      console.error("Error:", err);
      const short = formatBase44Error(err);
      toast.error(
        short
          ? `Błąd podczas zapisywania faktur: ${short}`
          : "Błąd podczas zapisywania faktur (sprawdź konsolę przeglądarki F12)."
      );
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
    const pdfFile = inv._pdfFileRef;
    const xmlFile = inv._xmlFileRef;
    const xmlSnap =
      typeof inv._xmlTextSnapshot === "string"
        ? inv._xmlTextSnapshot
        : inv._xmlTextSnapshot != null
          ? String(inv._xmlTextSnapshot)
          : "";
    const hasXmlSource = Boolean(xmlFile || xmlSnap);
    if (!pdfFile && !hasXmlSource) {
      toast.error(
        inv.format === "xml"
          ? "Brak treści XML w tej sesji (np. po odświeżeniu strony) — dodaj plik XML ponownie i kliknij Przetwórz."
          : "Brak pliku w pamięci — dodaj plik ponownie i przetwórz."
      );
      return;
    }
    setReAiLoading(idx);
    try {
      let mapped = null;
      let extractionSource = null;
      const mapOpts = { pdf_url: inv.pdf_url, fileName: inv.fileName };

      if (hasXmlSource) {
        const xmlText = xmlSnap.length ? xmlSnap : await xmlFile.text();
        if (isOpenAiConfigured()) {
          try {
            const { parsed } = await extractInvoiceFromXmlTextOpenAI(xmlText, inv.fileName);
            mapped = mapOpenAiInvoiceJsonToInternal(parsed, mapOpts);
            if (
              mapped &&
              (mapped.invoice_number?.trim() || mapped.seller_name?.trim() || mapped.contractor_name?.trim())
            ) {
              extractionSource = "openai";
            }
          } catch (openErr) {
            console.warn("OpenAI XML re-extract:", openErr);
            toast.message(
              openErr?.message ? `OpenAI: ${openErr.message.slice(0, 120)} — próbuję Base44…` : "Próbuję Base44…"
            );
          }
        }
        if (!extractionSource) {
          if (!xmlFile) {
            throw new Error(
              "Base44 wymaga ponownego pliku XML — ustaw OpenAI w ustawieniach albo wczytaj plik jeszcze raz."
            );
          }
          const { parsed } = await extractInvoiceFromPdfBase44(xmlFile, { format: "xml" });
          mapped = mapOpenAiInvoiceJsonToInternal(parsed, mapOpts);
          if (
            mapped &&
            (mapped.invoice_number?.trim() || mapped.seller_name?.trim() || mapped.contractor_name?.trim())
          ) {
            extractionSource = "base44";
          }
        }
      } else {
        if (isOpenAiConfigured()) {
          try {
            const { parsed } = await extractInvoiceFromPdfOpenAI(pdfFile);
            mapped = mapOpenAiInvoiceJsonToInternal(parsed, mapOpts);
            if (
              mapped &&
              (mapped.invoice_number?.trim() || mapped.seller_name?.trim() || mapped.contractor_name?.trim())
            ) {
              extractionSource = "openai";
            }
          } catch (openErr) {
            console.warn("OpenAI re-extract:", openErr);
            toast.message(
              openErr?.message ? `OpenAI: ${openErr.message.slice(0, 120)} — próbuję Base44…` : "Próbuję OCR Base44…"
            );
          }
        }
        if (!extractionSource) {
          const { parsed } = await extractInvoiceFromPdfBase44(pdfFile);
          mapped = mapOpenAiInvoiceJsonToInternal(parsed, mapOpts);
          if (
            mapped &&
            (mapped.invoice_number?.trim() || mapped.seller_name?.trim() || mapped.contractor_name?.trim())
          ) {
            extractionSource = "base44";
          }
        }
      }

      if (
        !mapped ||
        (!mapped.invoice_number?.trim() && !mapped.seller_name?.trim() && !mapped.contractor_name?.trim())
      ) {
        throw new Error("AI nie zwróciło numeru faktury ani podmiotów — sprawdź plik lub uzupełnij ręcznie.");
      }
      const updated = [...extractedData];
      updated[idx] = {
        ...mapped,
        format: inv.format || mapped.format || (hasXmlSource ? "xml" : "pdf"),
        fileName: inv.fileName,
        project_id: matchProjectId(projects, mapped, projectMatchOpts) || inv.project_id,
        _pdfFileRef: pdfFile,
        _xmlFileRef: xmlFile,
        _xmlTextSnapshot: xmlSnap || inv._xmlTextSnapshot,
        _rejected: false,
        _extractionSource: extractionSource,
      };
      setExtractedData(updated);
      toast.success("Formularz uzupełniony ponownie przez AI");
    } catch (e) {
      toast.error(e?.message || "Błąd AI (OpenAI / Base44)");
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
            PDF: warstwa tekstowa lub OCR Tesseract (skany); heurystyka; potem OpenAI lub Base44/LLM. XML: JPK-FA / e-faktura lokalnie; przycisk „Popraw z AI” używa OpenAI (tekst XML) lub Base44.
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

        <Dialog
          open={!!reportDialog}
          onOpenChange={(open) => {
            if (!open) {
              setReportDialog(null);
              if (reportResolveRef.current) {
                const r = reportResolveRef.current;
                reportResolveRef.current = null;
                r(false);
              }
            }
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                Plik wygląda na raport lub wyciąg bankowy
              </DialogTitle>
              <DialogDescription>
                Import faktur VAT jest do dokumentów sprzedaży/zakupu. Te pliki mogą nie zawierać pól typowej
                faktury:
              </DialogDescription>
            </DialogHeader>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              {reportDialog?.names.map((n) => (
                <li key={n} className="break-all">
                  {n}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Możesz kontynuować OCR (wynik może być pusty), przejść do importu przelewów (CSV/PDF) lub anulować.
            </p>
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:space-x-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const r = reportResolveRef.current;
                  reportResolveRef.current = null;
                  setReportDialog(null);
                  r?.(false);
                }}
              >
                Anuluj
              </Button>
              <div className="flex flex-wrap gap-2 justify-end w-full sm:w-auto">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const r = reportResolveRef.current;
                    reportResolveRef.current = null;
                    setReportDialog(null);
                    r?.(false);
                    navigate(createPageUrl("Transfers"));
                  }}
                >
                  Import przelewów
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const r = reportResolveRef.current;
                    reportResolveRef.current = null;
                    setReportDialog(null);
                    r?.(true);
                  }}
                >
                  Kontynuuj import faktury
                </Button>
              </div>
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

                <Button
                  onClick={processInvoices}
                  disabled={files.length === 0 || processing || checkingReports}
                  className="w-full"
                >
                  {checkingReports ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sprawdzanie typów plików…
                    </>
                  ) : processing ? (
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
                Żaden plik nie został rozpoznany. PDF z tekstem: sprawdź heurystykę; skany — OpenAI lub XML; XML — format pliku.
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
                      <h4 className="font-semibold flex flex-wrap items-center gap-2">
                        <span>
                          {invoice.fileName} — {invoice.format?.toUpperCase()}
                          {invoice._rejected && (
                            <span className="text-destructive ml-2">
                              (odrzucona
                              {invoice._systemDuplicate ? " — duplikat w bazie" : ""})
                            </span>
                          )}
                        </span>
                        {!invoice._rejected && <ExtractionSourceBadge source={invoice._extractionSource} />}
                      </h4>
                      {invoice._rejected && invoice._duplicateReason && (
                        <p className="text-sm text-destructive w-full">{invoice._duplicateReason}</p>
                      )}
                      {!invoice._rejected && (
                        <div className="flex flex-wrap gap-2">
                          {(invoice._pdfFileRef ||
                            invoice._xmlFileRef ||
                            invoice.format === "xml") && (
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
                            Sprzedawca (wystawca)
                            {invoice._aiConfidence?.seller_name != null && (
                              <span className="text-[10px] font-normal text-muted-foreground">
                                AI {invoice._aiConfidence.seller_name}%
                              </span>
                            )}
                          </Label>
                          <Input
                            className={cn(aiFieldClass(invoice, "seller_name"))}
                            value={invoice.seller_name || ""}
                            onChange={(e) => updateInvoice(idx, "seller_name", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="flex items-center flex-wrap gap-1">
                            NIP sprzedawcy
                            {invoice._aiConfidence?.seller_nip != null && (
                              <span className="text-[10px] font-normal text-muted-foreground">
                                AI {invoice._aiConfidence.seller_nip}%
                              </span>
                            )}
                          </Label>
                          <Input
                            className={cn(aiFieldClass(invoice, "seller_nip"))}
                            value={invoice.seller_nip || ""}
                            onChange={(e) => updateInvoice(idx, "seller_nip", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="flex items-center flex-wrap gap-1">
                            Kontrahent (nabywca)
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
                            NIP kontrahenta
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
                            Automat: klient/obiekt/numery na projekcie; NIP kontrahenta → domyślny projekt; słowa kluczowe
                            obiektu (Budowa) w opisie / pozycjach.
                          </p>
                        </div>
                        <div className="md:col-span-2">
                          <Label className="flex items-center flex-wrap gap-1">
                            Pozycje (JSON z OpenAI / XML)
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
