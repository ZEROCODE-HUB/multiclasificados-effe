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
const KR_THEME_CSS = "/static/js/krypton-client/V4.0/ext/classic-reset.css";

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
let krLoad: Promise<KrApi> | null = null;
function loadKrypton(endpoint: string, publicKey: string): Promise<KrApi> {
  const existing = krFromWindow();
  if (existing) return Promise.resolve(existing);
  if (krLoad) return krLoad;

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
    script.async = true;
    script.onload = () => {
      const KR = krFromWindow();
      if (KR) resolve(KR);
      else reject(new Error("El formulario de pago no se inicializó."));
    };
    script.onerror = () => {
      krLoad = null; // permite reintentar
      reject(new Error("No se pudo cargar el formulario de pago."));
    };
    document.head.appendChild(script);
  });
  return krLoad;
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
        await KR.setFormConfig({ formToken, "kr-language": "es-ES" });
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
