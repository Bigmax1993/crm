import React, { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  monthlyCashFlowPaidPln,
  sumReceivablesPln,
  sumPayablesPln,
  globalPLPln,
  projectProfitabilityPln,
  getInvoicePlnAtIssue,
} from "@/lib/finance-pln";
import { getNbpTableAForBusinessDay, getMidFromTable } from "@/lib/nbp-rates";
import { FileSpreadsheet, FileType, Loader2 } from "lucide-react";
import { EXPORT_BRAND_EXCEL_ARGB, getExportReportTitle, EXPORT_ADDRESS, EXPORT_WEB } from "@/lib/brand-brief";
import ExecutivePdfSurface from "@/components/export/ExecutivePdfSurface";
import { displayInvoiceSeller } from "@/lib/invoice-schema";

function styleHeader(row) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXPORT_BRAND_EXCEL_ARGB } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
}

function statusFill(status) {
  if (status === "paid") return { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
  if (status === "overdue") return { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } };
  return { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFE0" } };
}

export default function ExportReports() {
  const [busy, setBusy] = useState(null);
  const pdfSurfaceRef = useRef(null);
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list(),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["construction-sites"],
    queryFn: () => base44.entities.ConstructionSite.list(),
  });

  const cashRows = useMemo(() => monthlyCashFlowPaidPln(invoices), [invoices]);
  const topProjects = useMemo(
    () => [...projectProfitabilityPln(invoices, projects)].sort((a, b) => b.wynik - a.wynik).slice(0, 5),
    [invoices, projects]
  );
  const kpi = useMemo(() => {
    const g = globalPLPln(invoices);
    return {
      naleznosci: sumReceivablesPln(invoices),
      zobowiazania: sumPayablesPln(invoices),
      wynik: g.brutto,
    };
  }, [invoices]);

  const exportExcel = async () => {
    setBusy("xlsx");
    try {
      const wb = new ExcelJS.Workbook();
      const dateStr = format(new Date(), "yyyy-MM-dd");

      const uniqueDates = [...new Set(invoices.map((i) => i.issue_date?.slice?.(0, 10)).filter(Boolean))];
      const rateCache = {};
      for (const d of uniqueDates) {
        rateCache[d] = await getNbpTableAForBusinessDay(d);
      }
      const resolveRowFx = (inv) => {
        const pln = getInvoicePlnAtIssue(inv);
        if (inv.nbp_mid_issue != null) {
          return {
            kwotaPLN: pln,
            mid: inv.nbp_mid_issue,
            tdate: inv.nbp_table_date_issue || "",
          };
        }
        const cur = (inv.currency || "PLN").toUpperCase();
        const d = inv.issue_date?.slice?.(0, 10);
        const t = d ? rateCache[d] : null;
        const mid = cur === "PLN" ? 1 : getMidFromTable(t, cur);
        return {
          kwotaPLN: pln,
          mid: mid ?? "",
          tdate: t?.effectiveDate || "",
        };
      };

      const titleLine = [getExportReportTitle("eksport Excel"), EXPORT_ADDRESS, EXPORT_WEB].filter(Boolean).join(" · ");
      const s1 = wb.addWorksheet("Faktury");
      s1.columns = [
        { header: "Numer", key: "nr", width: 18 },
        { header: "Kontrahent", key: "kontrahent", width: 28 },
        { header: "Typ", key: "typ", width: 12 },
        { header: "KwotaOryginalna", key: "kwota", width: 14 },
        { header: "WalutaOryginalna", key: "waluta", width: 14 },
        { header: "KursNBP", key: "mid", width: 12 },
        { header: "DataKursu", key: "tdate", width: 14 },
        { header: "KwotaPLN", key: "pln", width: 14 },
        { header: "Status", key: "status", width: 12 },
        { header: "Data wystawienia", key: "issue", width: 14 },
        { header: "Termin płatności", key: "due", width: 14 },
        { header: "RoznicaKursowaPLN", key: "fx", width: 16 },
      ];
      s1.insertRows(1, 1);
      s1.getRow(1).getCell(1).value = titleLine;
      s1.mergeCells(1, 1, 1, 12);
      s1.getRow(1).font = { bold: true, size: 11 };
      s1.getRow(1).alignment = { vertical: "middle", wrapText: true };
      styleHeader(s1.getRow(2));
      let sumPln = 0;
      invoices.forEach((inv) => {
        const fx = resolveRowFx(inv);
        if (typeof fx.kwotaPLN === "number") sumPln += fx.kwotaPLN;
        const row = s1.addRow({
          nr: inv.invoice_number,
          kontrahent:
            inv.invoice_type === "sales" ? inv.contractor_name : displayInvoiceSeller(inv) || inv.contractor_name,
          typ: inv.invoice_type === "sales" ? "sprzedaż" : "zakup",
          kwota: inv.amount,
          waluta: inv.currency || "PLN",
          mid: fx.mid,
          tdate: fx.tdate,
          pln: fx.kwotaPLN ?? "",
          status: inv.status,
          issue: inv.issue_date,
          due: inv.payment_deadline,
          fx: inv.fx_difference_pln ?? "",
        });
        row.getCell("status").fill = statusFill(inv.status);
      });
      const totalRow = s1.addRow({
        nr: "SUMA CAŁKOWITA (PLN)",
        kontrahent: "",
        typ: "",
        kwota: "",
        waluta: "",
        mid: "",
        tdate: "",
        pln: sumPln,
        status: "",
        issue: "",
        due: "",
        fx: "",
      });
      totalRow.font = { bold: true };
      if (s1.rowCount > 3) {
        s1.autoFilter = { from: "A2", to: `L${s1.rowCount - 1}` };
      }

      const s1b = wb.addWorksheet("Podsumowanie_walut");
      s1b.columns = [
        { header: "Waluta", key: "w", width: 12 },
        { header: "Liczba FV", key: "c", width: 12 },
        { header: "Suma kwot oryginalnych", key: "s", width: 22 },
      ];
      s1b.insertRows(1, 1);
      s1b.getRow(1).getCell(1).value = titleLine;
      s1b.mergeCells(1, 1, 1, 3);
      s1b.getRow(1).font = { bold: true };
      styleHeader(s1b.getRow(2));
      const byCur = {};
      invoices.forEach((inv) => {
        const w = (inv.currency || "PLN").toUpperCase();
        if (!byCur[w]) byCur[w] = { count: 0, sum: 0 };
        byCur[w].count += 1;
        byCur[w].sum += Number(inv.amount) || 0;
      });
      Object.entries(byCur)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([w, v]) => s1b.addRow({ w, c: v.count, s: v.sum }));
      s1b.addRow({ w: "SUMA PLN (przeliczenie NBP)", c: "", s: sumPln }).font = { bold: true };

      const s2 = wb.addWorksheet("Koszty per projekt");
      s2.columns = [
        { header: "Projekt", key: "p", width: 28 },
        { header: "Budżet", key: "b", width: 14 },
        { header: "Koszty", key: "k", width: 14 },
        { header: "% budżetu", key: "pct", width: 12 },
        { header: "Alert", key: "a", width: 24 },
      ];
      s2.insertRows(1, 1);
      s2.getRow(1).getCell(1).value = titleLine;
      s2.mergeCells(1, 1, 1, 5);
      s2.getRow(1).font = { bold: true };
      styleHeader(s2.getRow(2));
      let sumB = 0;
      let sumK = 0;
      projects.forEach((p) => {
        const budget = Number(p.budget_planned) || 0;
        const cost = invoices
          .filter((i) => i.project_id === p.id && i.invoice_type !== "sales")
          .reduce((s, i) => s + (getInvoicePlnAtIssue(i) ?? 0), 0);
        const pct = budget > 0 ? (cost / budget) * 100 : null;
        const alert = budget > 0 && pct >= 100 ? "Przekroczenie budżetu" : budget > 0 && pct >= 80 ? ">80% budżetu" : "";
        const row = s2.addRow({
          p: p.object_name || p.city,
          b: budget,
          k: cost,
          pct: pct != null ? Number(pct.toFixed(1)) : "",
          a: alert,
        });
        if (alert) row.getCell("a").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE0B2" } };
        sumB += budget;
        sumK += cost;
      });
      const t2 = s2.addRow({ p: "SUMA CAŁKOWITA", b: sumB, k: sumK, pct: "", a: "" });
      t2.font = { bold: true };

      const s3 = wb.addWorksheet("Cash flow");
      s3.columns = [
        { header: "Miesiąc", key: "m", width: 12 },
        { header: "Wpływy", key: "w", width: 14 },
        { header: "Wydatki", key: "y", width: 14 },
        { header: "Saldo", key: "s", width: 14 },
        { header: "Saldo narastające", key: "c", width: 18 },
      ];
      s3.insertRows(1, 1);
      s3.getRow(1).getCell(1).value = titleLine;
      s3.mergeCells(1, 1, 1, 5);
      s3.getRow(1).font = { bold: true };
      styleHeader(s3.getRow(2));
      cashRows.forEach((r) => s3.addRow({ m: r.month, w: r.wplywy, y: r.wydatki, s: r.saldo, c: r.saldoNarastajace }));
      const last = cashRows[cashRows.length - 1];
      const t3 = s3.addRow({
        m: "SUMA CAŁKOWITA",
        w: "",
        y: "",
        s: "",
        c: last ? last.saldoNarastajace : 0,
      });
      t3.font = { bold: true };

      const s4 = wb.addWorksheet("Należności vs zobowiązania");
      s4.columns = [
        { header: "Pozycja", key: "l", width: 36 },
        { header: "Kwota PLN", key: "v", width: 18 },
      ];
      s4.insertRows(1, 1);
      s4.getRow(1).getCell(1).value = titleLine;
      s4.mergeCells(1, 1, 1, 2);
      s4.getRow(1).font = { bold: true };
      styleHeader(s4.getRow(2));
      const n = sumReceivablesPln(invoices);
      const z = sumPayablesPln(invoices);
      s4.addRow({ l: "Należności (FV sprzedaż, niezapłacone)", v: n });
      s4.addRow({ l: "Zobowiązania (FV zakup, niezapłacone)", v: z });
      s4.addRow({ l: "Bilans należności − zobowiązania", v: n - z });
      const t4 = s4.addRow({ l: "SUMA CAŁKOWITA (netto pozycji)", v: n + z });
      t4.font = { bold: true };

      const s6 = wb.addWorksheet("Roznice_kursowe");
      s6.columns = [
        { header: "Numer", key: "n", width: 18 },
        { header: "Waluta", key: "w", width: 10 },
        { header: "Projekt", key: "p", width: 24 },
        { header: "Roznica PLN", key: "d", width: 16 },
      ];
      s6.insertRows(1, 1);
      s6.getRow(1).getCell(1).value = titleLine;
      s6.mergeCells(1, 1, 1, 4);
      s6.getRow(1).font = { bold: true };
      styleHeader(s6.getRow(2));
      invoices
        .filter((i) => i.fx_difference_pln != null && Number.isFinite(Number(i.fx_difference_pln)))
        .forEach((inv) => {
          s6.addRow({
            n: inv.invoice_number,
            w: inv.currency,
            p: inv.project_id || "",
            d: Number(inv.fx_difference_pln),
          });
        });

      const buf = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buf]), `Fakturowo_Raport_${dateStr}.xlsx`);
      toast.success("Wygenerowano plik Excel");
    } catch (e) {
      console.error(e);
      toast.error("Błąd eksportu Excel");
    } finally {
      setBusy(null);
    }
  };

  const exportPdf = async () => {
    setBusy("pdf");
    try {
      const node = pdfSurfaceRef.current;
      if (!node) {
        toast.error("Nie można przygotować warstwy PDF");
        return;
      }
      if (typeof document !== "undefined" && document.fonts?.ready) {
        await document.fonts.ready;
      }
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "hsl(40 7% 96%)",
        windowWidth: node.scrollWidth,
        windowHeight: node.scrollHeight,
      });
      const imgData = canvas.toDataURL("image/png", 1.0);
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "p" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 10;
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      const pageInnerH = pageH - margin * 2;

      doc.addImage(imgData, "PNG", margin, margin, imgW, imgH);
      let heightLeft = imgH - pageInnerH;
      let scroll = 0;

      while (heightLeft > 0) {
        scroll += pageInnerH;
        doc.addPage();
        doc.addImage(imgData, "PNG", margin, margin - scroll, imgW, imgH);
        heightLeft -= pageInnerH;
      }

      doc.save(`Fakturowo_Raport_${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast.success("Wygenerowano PDF");
    } catch (e) {
      console.error(e);
      toast.error("Błąd eksportu PDF");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] w-full items-center justify-center text-muted-foreground">
        <div className="h-10 w-10 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl md:text-4xl font-bold">Eksport Excel i PDF</h1>
          <p className="text-muted-foreground mt-1">
            Raport zbiorczy dla zarządu, banku lub inwestora — ExcelJS; PDF z układem jak w Power BI (HTML + polskie znaki)
          </p>
        </motion.div>

        <Card>
          <CardHeader>
            <CardTitle>Excel — arkusze raportu</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              <li>Faktury (NBP: kwota oryginał, waluta, kurs, data kursu, PLN) + autofilter</li>
              <li>Podsumowanie_walut oraz Roznice_kursowe (per faktura)</li>
              <li>Koszty per projekt z alertem budżetu (PLN NBP)</li>
              <li>Cash flow miesięczny z saldem narastającym</li>
              <li>Bilans należności vs zobowiązania</li>
              <li>Wiersz SUMA CAŁKOWITA w każdym arkuszu; suma zbiorcza w PLN</li>
              <li>Nagłówki: granat #1F4E79, biały tekst</li>
            </ul>
            <Button onClick={exportExcel} disabled={!!busy} className="gap-2">
              {busy === "xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Pobierz Fakturowo_Raport_YYYY-MM-DD.xlsx
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PDF — raport zarządu</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Karty KPI, wykres słupkowy cash flow, tabela top projektów — render w przeglądarce (Segoe UI), potem zapis do PDF —
              poprawne polskie litery.
            </p>
            <Button variant="secondary" onClick={exportPdf} disabled={!!busy} className="gap-2">
              {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileType className="h-4 w-4" />}
              Pobierz PDF
            </Button>
          </CardContent>
        </Card>
      </div>

      <div
        aria-hidden
        className="pointer-events-none fixed left-[-12000px] top-0 z-0 overflow-visible"
        style={{ width: 794 }}
      >
        <ExecutivePdfSurface
          ref={pdfSurfaceRef}
          kpi={kpi}
          cashRows={cashRows}
          topProjects={topProjects}
          generatedLabel={format(new Date(), "d MMMM yyyy, HH:mm", { locale: pl })}
        />
      </div>
    </div>
  );
}
