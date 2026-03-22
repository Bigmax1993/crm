import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";

function rowsToPdf(doc, title, columns, rows, startY = 14) {
  let y = startY;
  doc.setFontSize(14);
  doc.text(title, 14, y);
  y += 8;
  doc.setFontSize(9);
  const lineH = 5;
  const maxY = 280;
  const header = columns.join(" | ");
  doc.text(header.substring(0, 120), 14, y);
  y += lineH;
  for (const row of rows) {
    const line = row.map((c) => String(c ?? "")).join(" | ");
    const chunks = doc.splitTextToSize(line, 180);
    for (const ch of chunks) {
      if (y > maxY) {
        doc.addPage();
        y = 14;
      }
      doc.text(ch, 14, y);
      y += lineH;
    }
  }
}

export async function exportPrognozyExcel(filename, sheetName, columns, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName || "Prognoza");
  ws.addRow(columns);
  for (const r of rows) {
    ws.addRow(r);
  }
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), filename);
}

export function exportPrognozyPdf(filename, title, columns, rows) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  rowsToPdf(doc, title, columns, rows);
  doc.save(filename);
}
