// Utilidades de exportación de reportes (sin librerías externas).
// - CSV: archivo .csv (UTF-8 con BOM, abre bien en Excel).
// - Excel: tabla HTML con mimetype de Excel (.xls) → abre como hoja de cálculo.
// - PDF: archivo .pdf generado a mano (ver lib/pdf.ts) y descargado como los demás.

import { renderTablePDF } from "@/lib/pdf";

type Row = Record<string, string | number>;

function descargar(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revocar en la misma vuelta del bucle de eventos aborta la descarga en
  // algunos navegadores: se libera el blob antes de que empiecen a leerlo.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function escaparCSV(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCSV(filename: string, rows: Row[]) {
  if (!rows.length) {
    descargar(new Blob(["﻿Sin datos"], { type: "text/csv;charset=utf-8;" }), `${filename}.csv`);
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => escaparCSV(r[h])).join(";")),
  ];
  descargar(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" }), `${filename}.csv`);
}

function escaparHTML(v: string | number): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Excel abre las columnas con el ancho por defecto (~8 caracteres). Si el valor
// es una fecha y no entra, no encoge la celda: la rellena con "#######". Un CSV
// no tiene dónde declarar el ancho; el HTML de Excel sí, vía <col>.
function anchoPx(header: string, rows: Row[]): number {
  const largos = rows.map((r) => String(r[header] ?? "").length);
  const max = Math.max(header.length, ...(largos.length ? largos : [0]));
  return Math.min(360, Math.max(72, max * 8 + 24));
}

export function exportExcel(filename: string, rows: Row[], title = "Reporte") {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const colgroup = `<colgroup>${headers.map((h) => `<col style="width:${anchoPx(h, rows)}px">`).join("")}</colgroup>`;
  const thead = `<tr>${headers.map((h) => `<th>${escaparHTML(h)}</th>`).join("")}</tr>`;
  const tbody = rows
    .map((r) => `<tr>${headers.map((h) => `<td>${escaparHTML(r[h])}</td>`).join("")}</tr>`)
    .join("");
  const html =
    `<html><head><meta charset="utf-8"></head><body><h3>${escaparHTML(title)}</h3>` +
    `<table border="1">${colgroup}${thead}${tbody}</table></body></html>`;
  // BOM: sin él, Excel puede leer el HTML como latin-1 y romper las tildes.
  descargar(new Blob(["﻿" + html], { type: "application/vnd.ms-excel" }), `${filename}.xls`);
}

export function exportPDF(filename: string, title: string, rows: Row[], landscape = false) {
  const bytes = renderTablePDF({
    title: `eFFe Multiclasificados — ${title}`,
    subtitle: `Generado el ${new Date().toLocaleString("es-PE")}`,
    headers: rows.length ? Object.keys(rows[0]) : [],
    rows,
    landscape,
  });
  descargar(new Blob([bytes], { type: "application/pdf" }), `${filename}.pdf`);
}

// Despacha según el formato elegido en los botones de la UI. `landscape` solo
// afecta al PDF (tablas anchas como transacciones se generan apaisadas).
export function exportRows(format: string, filename: string, title: string, rows: Row[], opts?: { landscape?: boolean }) {
  if (format === "csv") exportCSV(filename, rows);
  else if (format === "xlsx") exportExcel(filename, rows, title);
  else exportPDF(filename, title, rows, opts?.landscape);
}
