// Utilidades de exportación de reportes (sin librerías externas).
// - CSV: archivo .csv (UTF-8 con BOM, abre bien en Excel).
// - Excel: tabla HTML con mimetype de Excel (.xls) → abre como hoja de cálculo.
// - PDF: abre una ventana con la tabla y dispara la impresión (Guardar como PDF).

type Row = Record<string, string | number>;

function descargar(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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

export function exportExcel(filename: string, rows: Row[], title = "Reporte") {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const thead = `<tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>`;
  const tbody = rows.map((r) => `<tr>${headers.map((h) => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`).join("");
  const html =
    `<html><head><meta charset="utf-8"></head><body><h3>${title}</h3>` +
    `<table border="1">${thead}${tbody}</table></body></html>`;
  descargar(new Blob([html], { type: "application/vnd.ms-excel" }), `${filename}.xls`);
}

export function exportPDF(title: string, rows: Row[]) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const thead = `<tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>`;
  const tbody = rows.map((r) => `<tr>${headers.map((h) => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`).join("");
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`
    <html><head><meta charset="utf-8"><title>${title}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:24px;color:#1f2937;}
      h2{margin:0 0 4px;} p{color:#6b7280;margin:0 0 16px;font-size:12px;}
      table{width:100%;border-collapse:collapse;font-size:13px;}
      th,td{border:1px solid #e5e7eb;padding:8px 10px;text-align:left;}
      th{background:#f9fafb;text-transform:capitalize;}
    </style></head><body>
    <h2>eFFe Multiclasificados — ${title}</h2>
    <p>Generado el ${new Date().toLocaleString("es-PE")}</p>
    <table>${thead}${tbody}</table>
    <script>window.onload=function(){window.print();}</script>
    </body></html>`);
  w.document.close();
}

// Despacha según el formato elegido en los botones de la UI.
export function exportRows(format: string, filename: string, title: string, rows: Row[]) {
  if (format === "csv") exportCSV(filename, rows);
  else if (format === "xlsx") exportExcel(filename, rows, title);
  else exportPDF(title, rows);
}
