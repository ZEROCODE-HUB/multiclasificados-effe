import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { appVersionLabel } from "@/lib/version";
import {
  REQUIRED_ENV,
  computeEnvDiagnostics,
  normalizeSupabaseUrl,
  probeSupabase,
  type ProbeResult,
} from "@/lib/bootDiagnostics";

/**
 * Pantalla de diagnóstico de arranque. Se muestra SOLO cuando la app no puede
 * iniciar (env faltante o una excepción durante el arranque), en vez de dejar el
 * splash pegado sin explicación. En un build sano nunca se ve.
 *
 * Usa estilos INLINE a propósito: no depende de Tailwind ni del CSS global (que
 * también podrían haber fallado) y cumple la CSP (los estilos inline sí están
 * permitidos; los scripts inline no). Ver plan del arranque.
 */

// Estilos inline reutilizables (objetos, no clases: independientes del CSS).
const S = {
  wrap: {
    position: "fixed",
    inset: 0,
    zIndex: 10000,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
    background: "#ffffff",
    color: "#1e293b",
    fontFamily: "Arial, Helvetica, sans-serif",
    overflowY: "auto",
    textAlign: "center",
  },
  brand: { fontWeight: 800, fontSize: 22, letterSpacing: 1, color: "#1e3a5f" },
  card: {
    maxWidth: 520,
    width: "100%",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 20,
    textAlign: "left",
    background: "#f8fafc",
  },
  h1: { fontSize: 18, fontWeight: 700, margin: "0 0 6px" },
  p: { fontSize: 13, lineHeight: 1.5, color: "#475569", margin: "0 0 14px" },
  row: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, margin: "4px 0" },
  code: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    background: "#eef2f7",
    padding: "1px 6px",
    borderRadius: 5,
  },
  meta: { fontSize: 12, color: "#64748b", marginTop: 12, wordBreak: "break-word" },
  errBox: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    color: "#b91c1c",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: "8px 10px",
    margin: "10px 0",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  btn: {
    marginTop: 16,
    border: "none",
    borderRadius: 9,
    background: "#f97316",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: 14,
    padding: "10px 22px",
    cursor: "pointer",
  },
} satisfies Record<string, React.CSSProperties>;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

const PROBE_LABEL: Record<ProbeResult, string> = {
  ok: "alcanzable ✓",
  unreachable: "no se pudo conectar (red / CSP / DNS) ✗",
  skipped: "no evaluada (URL ausente)",
};

export function BootError({
  variant,
  error,
  detail,
}: {
  variant: "config" | "crash";
  error?: unknown;
  /** Motivo específico (p. ej. supabaseConfigError) para el variant "config". */
  detail?: string | null;
}) {
  const env = computeEnvDiagnostics();
  const [probe, setProbe] = useState<ProbeResult | "checking">("checking");

  useEffect(() => {
    // React está vivo y ya mostramos el diagnóstico: silencia el watchdog externo.
    (window as unknown as { __EFFE_BOOTED__?: boolean }).__EFFE_BOOTED__ = true;

    let vigente = true;
    const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
    probeSupabase(url).then((r) => vigente && setProbe(r));
    return () => {
      vigente = false;
    };
  }, []);

  const platform = Capacitor.getPlatform();
  // La URL del proyecto es PÚBLICA (ya está en el <link preconnect> de index.html),
  // así que mostrar el valor recibido ayuda a depurar sin exponer secretos.
  const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;

  return (
    <div style={S.wrap} role="alert">
      <div style={S.brand}>
        eFFe <span style={{ color: "#f97316" }}>Multiclasificados</span>
      </div>
      <div style={S.card}>
        <h1 style={S.h1}>No se pudo iniciar la app</h1>
        <p style={S.p}>
          {variant === "config"
            ? "Falta configuración de conexión. Revisa las variables del build."
            : "Ocurrió un error durante el arranque. Detalles abajo."}
        </p>

        {/* Checklist de variables de entorno requeridas */}
        <div>
          {REQUIRED_ENV.map((key) => {
            const present = env.present.includes(key);
            return (
              <div key={key} style={S.row}>
                <span style={{ color: present ? "#16a34a" : "#dc2626", fontWeight: 700 }}>
                  {present ? "✓" : "✗"}
                </span>
                <span style={S.code}>{key}</span>
                <span style={{ color: present ? "#16a34a" : "#dc2626" }}>
                  {present ? "presente" : "FALTA"}
                </span>
              </div>
            );
          })}
        </div>

        {variant === "config" && detail && (
          <div style={S.errBox}>
            {detail}
            {"\n"}Valor recibido para VITE_SUPABASE_URL: {rawUrl ? `«${rawUrl}»` : "(vacío)"}
          </div>
        )}

        {variant === "crash" && error != null && (
          <div style={S.errBox}>{errorMessage(error)}</div>
        )}

        <div style={S.meta}>
          Conexión a Supabase: {probe === "checking" ? "comprobando…" : PROBE_LABEL[probe]}
        </div>
        <div style={S.meta}>
          Plataforma: <b>{platform}</b> · {appVersionLabel()}
        </div>
      </div>

      <button style={S.btn} onClick={() => window.location.reload()}>
        Reintentar
      </button>
    </div>
  );
}

export default BootError;
