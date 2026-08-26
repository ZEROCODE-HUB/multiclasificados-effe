import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { appVersionLabel } from "@/lib/version";
import {
  REQUIRED_ENV,
  OPTIONAL_ENV,
  computeEnvDiagnostics,
  normalizeSupabaseUrl,
  probeSupabase,
  type HealthResult,
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

/**
 * Recarga forzando al navegador a pedir el index.html otra vez.
 *
 * Vive aquí y no en cargaDiferida porque esta pantalla tiene que poder mostrarse
 * aunque el resto de la app no haya llegado a cargar.
 */
function recargarDeCero(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("_r", Date.now().toString(36));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

const PROBE_LABEL: Record<ProbeResult, string> = {
  ok: "alcanzable ✓",
  unreachable: "no se pudo conectar (red / CSP / DNS) ✗",
  skipped: "no evaluada (URL ausente)",
};

// Qué decirle a quien mira la pantalla, según lo que falló al conectar.
const HEALTH_COPY: Record<string, { titulo: string; explicacion: string }> = {
  offline: {
    titulo: "Sin conexión a internet",
    explicacion: "El dispositivo no tiene red. Conéctate y pulsa Reintentar.",
  },
  unreachable: {
    titulo: "No se puede contactar con el servidor",
    explicacion:
      "La dirección del proyecto no responde. Suele ser una VITE_SUPABASE_URL equivocada en el build, o la red del dispositivo bloqueando la conexión.",
  },
  "invalid-key": {
    titulo: "La clave de conexión fue rechazada",
    explicacion:
      "El proyecto responde, pero no acepta VITE_SUPABASE_ANON_KEY. Suele estar copiada a medias, caducada o ser la de otro proyecto. Este build no puede iniciar sesión ni mostrar avisos.",
  },
  "server-error": {
    titulo: "El servidor respondió con un error",
    explicacion: "El proyecto está respondiendo mal. Si persiste, revisa el estado del proyecto en Supabase.",
  },
};

export function BootError({
  variant,
  error,
  detail,
  health,
}: {
  variant: "config" | "crash" | "connection";
  error?: unknown;
  /** Motivo específico (p. ej. supabaseConfigError) para el variant "config". */
  detail?: string | null;
  /** Resultado del chequeo de conexión, para el variant "connection". */
  health?: HealthResult;
}) {
  const env = computeEnvDiagnostics();
  const [probe, setProbe] = useState<ProbeResult | "checking">("checking");

  // El diagnóstico técnico NO se enseña de entrada.
  //
  // Esta pantalla nació para depurar, y hace su trabajo: es la que permitió
  // encontrar el IPA que arrancaba y contestaba "Invalid API key" a todo. Pero
  // quien se la encuentra en producción es un anunciante, y a él una lista de
  // VITE_SUPABASE_ANON_KEY no le dice nada: le dice que la app está rota y que
  // quien la hizo no lo previó.
  //
  // Así que la herramienta se queda entera y cambia la cara: mensaje corto,
  // botón de reintentar, y las tripas detrás de "Ver detalles" — o de `?diag=1`,
  // para poder pedirle a alguien que abra un enlace y mande una captura sin
  // explicarle dónde pulsar.
  const [verDetalle, setVerDetalle] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("diag") === "1";
    } catch {
      return false;
    }
  });

  // ── Caso especial: la app está desfasada, no rota ──
  // Pasa a quien tenía la pestaña abierta cuando se desplegó: los archivos que
  // pide su versión ya no existen. NO es un fallo de configuración ni de red, y
  // enseñarle un diagnóstico de variables de entorno lo único que consigue es
  // asustarle. Lo que necesita es traerse la versión nueva.
  const esVersionDesfasada = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i
    .test(String((error as Error)?.message ?? error ?? ""));

  const copy = esVersionDesfasada
    ? {
        titulo: "Hay una versión nueva",
        explicacion:
          "Tenías la app abierta desde antes de la última actualización, así que "
          + "algunos archivos ya no están disponibles. Pulsa Actualizar y seguimos.",
      }
    : health ? HEALTH_COPY[health.status] : undefined;

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
  // De la clave solo se enseña el inicio y su longitud: basta para ver si vino
  // truncada o si es la de otro proyecto, sin dejarla escrita en pantalla.
  const rawKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
  const keyHint = rawKey
    ? `${rawKey.slice(0, 12)}… (${rawKey.length} caracteres)`
    : "(vacía)";

  return (
    <div style={S.wrap} role="alert">
      <div style={S.brand}>
        eFFe <span style={{ color: "#f97316" }}>Multiclasificados</span>
      </div>
      <div style={S.card}>
        <h1 style={S.h1}>{copy ? copy.titulo : "No se pudo iniciar la app"}</h1>
        <p style={S.p}>
          {copy
            ? copy.explicacion
            : variant === "config"
              // Antes decía "revisa las variables del build". A quien lo lee no
              // le toca revisar nada: le toca poder avisar de que no va.
              ? "No pudimos conectar con el servidor. Vuelve a intentarlo en un momento; si sigue igual, escríbenos."
              : "Algo falló al abrir la aplicación. Vuelve a intentarlo."}
        </p>

        {/* ── A partir de aquí, SOLO con "Ver detalles" ── */}
        {verDetalle && (
        <>
        {/* Checklist de variables de entorno requeridas.
            No se pinta cuando lo único que pasa es que la versión está vieja:
            ahí las variables están bien y enseñarlas solo despista a quien lo
            lee, que además suele ser el propio usuario y no un técnico. */}
        {!esVersionDesfasada && (
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
          {/* No bloquean el arranque, pero si faltan varias es señal de que el
              build salió sin su configuración (el caso del IPA de TestFlight). */}
          {OPTIONAL_ENV.map((key) => {
            const present = !!String(import.meta.env[key] ?? "").trim();
            return (
              <div key={key} style={{ ...S.row, opacity: 0.75 }}>
                <span style={{ color: present ? "#16a34a" : "#b45309", fontWeight: 700 }}>
                  {present ? "✓" : "!"}
                </span>
                <span style={S.code}>{key}</span>
                <span style={{ color: present ? "#16a34a" : "#b45309" }}>
                  {present ? "presente" : "ausente (opcional)"}
                </span>
              </div>
            );
          })}
        </div>
        )}

        {variant === "config" && detail && (
          <div style={S.errBox}>
            {detail}
            {"\n"}Valor recibido para VITE_SUPABASE_URL: {rawUrl ? `«${rawUrl}»` : "(vacío)"}
          </div>
        )}

        {variant === "connection" && health && (
          <div style={S.errBox}>
            {health.detail ?? "Sin detalle del servidor."}
            {health.httpStatus ? `\nRespuesta HTTP: ${health.httpStatus}` : ""}
            {"\n"}URL usada: {normalizeSupabaseUrl(rawUrl) || "(vacía)"}
            {"\n"}Clave anónima: {keyHint}
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
        </>
        )}

        {/* Discreto a propósito: quien tenga que usarlo sabe que está, y quien
            no, no se distrae con él. La versión sí se deja siempre a la vista:
            es el primer dato que se pregunta cuando alguien reporta un fallo, y
            leerlo de una captura ahorra media conversación. */}
        {!verDetalle && (
          <div style={S.meta}>
            {appVersionLabel()}
            {" · "}
            <button
              type="button"
              onClick={() => setVerDetalle(true)}
              style={{
                background: "none", border: "none", padding: 0,
                color: "#64748b", textDecoration: "underline",
                font: "inherit", cursor: "pointer",
              }}
            >
              Ver detalles
            </button>
          </div>
        )}
      </div>

      {/* `location.reload()` a secas puede devolver el MISMO index.html viejo
          desde la caché del navegador —pasó de verdad: un usuario seguía viendo
          la v4.5 con la v6.8 desplegada, por muchas veces que pulsara—. Con un
          parámetro nuevo en la URL no hay copia que reutilizar. */}
      <button style={S.btn} onClick={recargarDeCero}>
        {esVersionDesfasada ? "Actualizar" : "Reintentar"}
      </button>
    </div>
  );
}

export default BootError;
