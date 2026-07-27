/*
 * Watchdog de arranque — última red de seguridad.
 *
 * Vive en public/ (Vite NO lo procesa) y se carga como script EXTERNO de 'self',
 * así que es independiente del bundle principal y cumple la CSP (script-src 'self'
 * sin unsafe-inline). Su trabajo: si tras unos segundos la app NO marcó
 * `window.__EFFE_BOOTED__` (lo hace main.tsx en cuanto el bundle ejecuta),
 * asumimos que el bundle no llegó a correr (chunk 404, error de parseo en el
 * WebView de iOS, etc.) y reemplazamos el splash pegado por un aviso legible.
 *
 * Cuando el bundle SÍ ejecuta, las capas de React (BootError / ErrorBoundary) se
 * encargan del diagnóstico detallado y este watchdog no hace nada.
 */
(function () {
  var TIMEOUT_MS = 8000;

  function showFallback() {
    if (window.__EFFE_BOOTED__) return; // el bundle arrancó: no tocamos nada.
    var host = document.getElementById("boot-loader") || document.getElementById("root");
    if (!host) return;

    var ua = (navigator.userAgent || "").slice(0, 140);
    host.innerHTML =
      '<div style="position:fixed;inset:0;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:14px;padding:24px;background:#fff;' +
      'color:#1e293b;font-family:Arial,Helvetica,sans-serif;text-align:center;z-index:10000;">' +
      '<div style="font-weight:800;font-size:22px;letter-spacing:1px;color:#1e3a5f;">' +
      'eFFe <span style="color:#f97316;">Multiclasificados</span></div>' +
      '<div style="max-width:480px;border:1px solid #e5e7eb;border-radius:12px;padding:18px;' +
      'background:#f8fafc;text-align:left;">' +
      '<div style="font-size:18px;font-weight:700;margin:0 0 6px;">La app no pudo iniciar</div>' +
      '<div style="font-size:13px;line-height:1.5;color:#475569;">No se cargó el código de la ' +
      'aplicación. Revisa tu conexión e inténtalo de nuevo; si persiste, avísanos indicando este ' +
      'dato:</div>' +
      '<div style="font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#64748b;' +
      'margin-top:10px;word-break:break-word;">' + ua + '</div>' +
      '</div>' +
      '<button id="boot-watchdog-retry" style="margin-top:8px;border:none;border-radius:9px;' +
      'background:#f97316;color:#fff;font-weight:700;font-size:14px;padding:10px 22px;' +
      'cursor:pointer;">Reintentar</button>' +
      '</div>';

    var btn = document.getElementById("boot-watchdog-retry");
    if (btn) btn.addEventListener("click", function () { window.location.reload(); });
  }

  function arm() { setTimeout(showFallback, TIMEOUT_MS); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arm);
  } else {
    arm();
  }
})();
