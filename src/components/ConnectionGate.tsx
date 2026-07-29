import { useEffect, useState, type ReactNode } from "react";
import { BootError } from "@/components/BootError";
import { checkSupabaseHealth, type HealthResult } from "@/lib/bootDiagnostics";

/**
 * Verifica al arrancar que la app puede hablar de verdad con su backend.
 *
 * `supabase.ts` solo comprueba que las variables del build tengan buena FORMA.
 * Con una URL bien escrita pero de otro proyecto, o con una clave anónima
 * caducada o copiada a medias, la app arrancaba con normalidad y después no
 * dejaba iniciar sesión ni mostraba un solo aviso, sin explicar nada —el caso
 * que apareció en el iPhone de TestFlight—. Aquí eso se convierte en una
 * pantalla que dice exactamente qué falla.
 *
 * La comprobación NO bloquea el arranque: la app se monta y se pinta igual, y la
 * pantalla solo aparece si el chequeo (dos peticiones pequeñas) falla.
 */
// Un fallo puede ser un bache momentáneo de red o del backend. Antes de tapar la
// app con la pantalla de diagnóstico se reintenta una vez: así un 5xx suelto o
// un cambio de antena no dejan sin app a quien la tenía funcionando.
const REINTENTO_MS = 2500;

export function ConnectionGate({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthResult | null>(null);

  useEffect(() => {
    let vigente = true;
    const consultar = () =>
      checkSupabaseHealth(
        import.meta.env.VITE_SUPABASE_URL as string | undefined,
        import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
      );

    const revisar = () => {
      void consultar().then((r) => {
        if (!vigente) return;
        if (r.status === "ok") {
          setHealth(r);
          return;
        }
        // Una clave rechazada no mejora esperando: es config del build.
        if (r.status === "invalid-key") {
          setHealth(r);
          return;
        }
        setTimeout(() => {
          void consultar().then((r2) => vigente && setHealth(r2));
        }, REINTENTO_MS);
      });
    };
    revisar();
    // Si el móvil recupera la conexión, se reevalúa: un corte de red pasajero no
    // debe dejar al usuario mirando la pantalla de error hasta que reinicie.
    window.addEventListener("online", revisar);
    return () => {
      vigente = false;
      window.removeEventListener("online", revisar);
    };
  }, []);

  if (health && health.status !== "ok") {
    return <BootError variant="connection" health={health} />;
  }
  return <>{children}</>;
}

export default ConnectionGate;
