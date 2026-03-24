import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FileType, Copy, Mail } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { buildCrmContextForAi, stringifyCrmContext } from "@/lib/ai-crm-context";
import { openaiChatCompletions, isOpenAiConfigured, estimateCostUsd } from "@/lib/openai-crm";
import { toast } from "sonner";
import jsPDF from "jspdf";

const REPORT_TYPES = [
  { id: "zarzad", label: "Raport miesięczny dla zarządu" },
  { id: "bank", label: "Analiza cash flow dla banku" },
  { id: "projekt", label: "Podsumowanie projektu" },
  { id: "rent", label: "Analiza rentowności" },
];

const PERIODS = [
  { id: "m1", label: "Ostatni miesiąc" },
  { id: "q1", label: "Ostatni kwartał" },
  { id: "y1", label: "Ostatni rok" },
];

const SYSTEM = `Jesteś analitykiem finansowym. Napisz profesjonalny raport finansowy po polsku na podstawie poniższych danych i typu raportu.
Raport powinien zawierać:
1. Podsumowanie wykonawcze (3-5 zdań)
2. Kluczowe wskaźniki finansowe
3. Analiza trendów
4. Ryzyka i szanse
5. Rekomendacje dla zarządu
Formatuj liczby jako: 1 234 567,89 PLN.
Używaj profesjonalnego języka biznesowego.`;

export function AiReportModal({ open, onOpenChange }) {
  const [type, setType] = useState("zarzad");
  const [period, setPeriod] = useState("m1");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!isOpenAiConfigured()) {
      toast.error("Brak klucza OpenAI");
      return;
    }
    setLoading(true);
    setText("");
    try {
      const ctx = await buildCrmContextForAi(base44);
      const rt = REPORT_TYPES.find((r) => r.id === type)?.label || type;
      const pr = PERIODS.find((p) => p.id === period)?.label || period;
      const user = `${SYSTEM}\n\nTyp raportu: ${rt}\nOkres: ${pr}\n\nDane JSON:\n${stringifyCrmContext(ctx)}`;

      const { text: out } = await openaiChatCompletions({
        messages: [
          { role: "system", content: "Piszesz raporty finansowe dla użytkownika aplikacji Fakturowo CRM." },
          { role: "user", content: user },
        ],
        max_tokens: 3500,
        temperature: 0.35,
      });
      setText(out || "");
      toast.success("Wygenerowano raport");
    } catch (e) {
      toast.error(e?.message || "Błąd generowania");
    } finally {
      setLoading(false);
    }
  };

  const exportPdf = () => {
    if (!text) return;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const lines = doc.splitTextToSize(text, 180);
    let y = 14;
    doc.setFontSize(11);
    lines.forEach((line) => {
      if (y > 280) {
        doc.addPage();
        y = 14;
      }
      doc.text(line, 14, y);
      y += 5;
    });
    doc.save(`Fakturowo_raport_AI_${type}.pdf`);
    toast.success("PDF pobrany");
  };

  const exportWord = () => {
    if (!text) return;
    const html = `<html><head><meta charset="utf-8"></head><body><pre style="font-family:Calibri;font-size:11pt;white-space:pre-wrap">${text.replace(/</g, "&lt;")}</pre></body></html>`;
    const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Fakturowo_raport_AI_${type}.doc`;
    a.click();
    toast.success("Plik Word (.doc) pobrany");
  };

  const copy = () => {
    navigator.clipboard.writeText(text);
    toast.success("Skopiowano");
  };

  const email = () => {
    const sub = encodeURIComponent("Raport finansowy Fakturowo (AI)");
    const body = encodeURIComponent(text.slice(0, 12000));
    window.location.href = `mailto:?subject=${sub}&body=${body}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Generator raportów AI</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Typ raportu</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Okres</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Szacowany koszt: ~${estimateCostUsd(4000).toFixed(2)} (duży kontekst + raport)
          </p>
          <Button type="button" onClick={generate} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Generuj raport
          </Button>
          <Textarea
            rows={14}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tu pojawi się raport — możesz edytować przed eksportem."
            className="font-sans text-sm"
          />
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={exportPdf} disabled={!text}>
            <FileType className="h-4 w-4 mr-1" />
            PDF
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={exportWord} disabled={!text}>
            Word
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={copy} disabled={!text}>
            <Copy className="h-4 w-4 mr-1" />
            Kopiuj
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={email} disabled={!text}>
            <Mail className="h-4 w-4 mr-1" />
            E-mail
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
