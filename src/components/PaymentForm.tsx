import { useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";

// Formulario de pago embebido de Izipay/Lyra (Krypton). Carga la librería desde
// el CDN de micuentaweb con la clave pública + el formToken que devolvió el
// backend, renderiza los campos de tarjeta (en iframes de Lyra, PCI reducido) y
// avisa por onPaid cuando la transacción queda PAGADA. NO acredita nada: de eso
// se encarga el webhook; la app solo confirma el estado de la orden después.
//
// Equivale a @lyracom/embedded-form-glue pero sin dependencia npm: inyectamos el
// script del CDN nosotros mismos (lo que hace la librería por dentro).

const KR_SCRIPT = "/static/js/krypton-client/V4.0/stable/kr-payment-form.min.js";
// El tema son DOS archivos y hasta ahora solo se cargaba el reset: por eso el
// formulario salía sin estilar (campos planos, sin etiqueta flotante ni icono
// de la marca de la tarjeta). `classic.js` es el que aporta el aspecto.
const KR_THEME_CSS = "/static/js/krypton-client/V4.0/ext/classic-reset.css";
const KR_THEME_JS = "/static/js/krypton-client/V4.0/ext/classic.js";

interface KrSubmitResponse {
  clientAnswer?: { orderStatus?: string };
}
interface KrApi {
  setFormConfig(cfg: Record<string, unknown>): Promise<{ KR: KrApi }>;
  onSubmit(cb: (r: KrSubmitResponse) => boolean): Promise<{ KR: KrApi }>;
  attachForm(selector: string): Promise<{ KR: KrApi; result: { formId: string } }>;
  showForm(formId: string): Promise<unknown>;
}

function krFromWindow(): KrApi | undefined {
  return (window as unknown as { KR?: KrApi }).KR;
}

// Carga (una sola vez) la librería Krypton con la clave pública dada.
//
// OJO CON EL CACHÉ: el script se carga UNA vez y la clave pública viaja como
// atributo suyo (`kr-public-key`). Si más tarde alguien pide cargarlo con otra
// clave, esto devuelve el que ya está y el atributo NO cambia. Eso convertía la
// precarga —que se hace con la clave del build, antes de hablar con el
// servidor— en la que mandaba de verdad: la clave que devuelve el backend
// llegaba tarde y se ignoraba en silencio. En el APK eso significa cobrar con
// `testpublickey_` contra un backend de producción.
//
// Lo que lo arregla de verdad está abajo, en `setFormConfig`, que refija la
// clave definitiva sobre el script ya cargado. Aquí solo se guarda con cuál se
// cargó para poder avisar si no coinciden.
let krLoad: Promise<KrApi> | null = null;
let krClaveCargada = "";
function loadKrypton(endpoint: string, publicKey: string): Promise<KrApi> {
  const existing = krFromWindow();
  if (existing) return Promise.resolve(existing);
  if (krLoad) return krLoad;
  krClaveCargada = publicKey;

  krLoad = new Promise<KrApi>((resolve, reject) => {
    // CSS del tema (no bloquea el flujo si falla).
    if (!document.querySelector(`link[href="${endpoint}${KR_THEME_CSS}"]`)) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = endpoint + KR_THEME_CSS;
      document.head.appendChild(css);
    }
    const script = document.createElement("script");
    script.src = endpoint + KR_SCRIPT;
    script.setAttribute("kr-public-key", publicKey);
    // En modo TEST, Krypton engancha al pie de la página una barra con tarjetas
    // de prueba ("Información · Métodos de prueba"). Va como ATRIBUTO del
    // script: por `setFormConfig` se ignora — comprobado montando el formulario
    // real de las dos formas. En producción no aparece nunca, pero así las
    // pruebas se ven como las verá el cliente. Las tarjetas de prueba están en
    // el Back Office → Ayuda → Tarjetas de prueba.
    script.setAttribute("kr-hide-debug-toolbar", "true");
    script.async = true;
    script.onload = () => {
      const KR = krFromWindow();
      if (!KR) {
        reject(new Error("El formulario de pago no se inicializó."));
        return;
      }
      // El JS del tema va DESPUÉS de la librería. Si no llega (CDN caído), el
      // formulario sigue funcionando: solo se vería con el estilo básico, así
      // que no se bloquea el cobro por una hoja de estilos.
      const tema = document.createElement("script");
      tema.src = endpoint + KR_THEME_JS;
      tema.async = true;
      tema.onload = () => resolve(KR);
      tema.onerror = () => resolve(KR);
      document.head.appendChild(tema);
    };
    script.onerror = () => {
      krLoad = null; // permite reintentar
      krClaveCargada = "";
      reject(new Error("No se pudo cargar el formulario de pago."));
    };
    document.head.appendChild(script);
  });
  return krLoad;
}

/**
 * Trae la librería del CDN antes de que haga falta.
 *
 * Son tres recursos encadenados (script → tema JS → configuración), así que
 * cargarlos al llegar al paso de pago añadía 1-3 s de pantalla en blanco. Se
 * pide al abrir el cuadro de compra, mientras el usuario elige qué comprar.
 * Si falla no pasa nada: al montar el formulario se reintenta.
 *
 * La clave que se le pasa aquí es la del build, y sirve ÚNICAMENTE para traer
 * el script del CDN: no decide con qué cuenta se cobra. Eso lo fija después
 * `PaymentForm` con la que devuelve el servidor.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function precargarKrypton(endpoint: string | undefined, publicKey: string): void {
  if (!publicKey) return;
  const host = endpoint
    || (import.meta.env.VITE_IZIPAY_STATIC_ENDPOINT as string | undefined)
    || "https://static.micuentaweb.pe";
  void loadKrypton(host, publicKey).catch(() => {});
}

interface Props {
  formToken: string;
  publicKey: string;
  endpoint?: string;
  onPaid: () => void;
  onError?: (message: string) => void;
}

export function PaymentForm({ formToken, publicKey, endpoint, onPaid, onError }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Refs para no re-suscribir onSubmit con closures viejos.
  const onPaidRef = useRef(onPaid);
  const onErrorRef = useRef(onError);
  onPaidRef.current = onPaid;
  onErrorRef.current = onError;

  const host = endpoint
    || (import.meta.env.VITE_IZIPAY_STATIC_ENDPOINT as string | undefined)
    || "https://static.micuentaweb.pe";

  useEffect(() => {
    let cancelled = false;

    if (!publicKey) {
      setError("Falta la clave pública de la pasarela.");
      setLoading(false);
      onErrorRef.current?.("Falta la clave pública de la pasarela.");
      return;
    }

    (async () => {
      try {
        const KR = await loadKrypton(host, publicKey);
        if (cancelled) return;
        if (krClaveCargada && krClaveCargada !== publicKey) {
          // La precarga trajo el script con otra clave (la del build). No es
          // fatal —`setFormConfig` la refija justo aquí abajo— pero si pasa
          // conviene verlo, porque significa que el build y el servidor no
          // están de acuerdo en con qué cuenta se cobra.
          console.warn(
            "[pago] la clave pública del build no coincide con la del servidor; manda la del servidor",
          );
        }
        // `kr-public-key` va SIEMPRE, no solo el formToken: es lo que hace que
        // la clave del servidor gobierne aunque el script se cargara con otra.
        await KR.setFormConfig({
          formToken,
          "kr-public-key": publicKey,
          "kr-language": "es-ES",
        });
        await KR.onSubmit((resp) => {
          if (resp?.clientAnswer?.orderStatus === "PAID") onPaidRef.current();
          else onErrorRef.current?.("El pago no se completó.");
          return false; // no hacemos el POST automático: la fuente de verdad es el webhook
        });
        const { result } = await KR.attachForm("#kr-payment-form");
        if (cancelled) return;
        await KR.showForm(result.formId);
        if (!cancelled) setLoading(false);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "No se pudo iniciar el pago.";
        setError(msg);
        setLoading(false);
        onErrorRef.current?.(msg);
      }
    })();

    return () => { cancelled = true; };
  }, [formToken, publicKey, host]);

  return (
    <div className="space-y-3">
      {loading && !error && (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Cargando el pago seguro…
        </p>
      )}
      {error && (
        <p className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
      {/* Contenedor del formulario embebido de Krypton. */}
      <div id="kr-payment-form"><div className="kr-embedded" /></div>
    </div>
  );
}
