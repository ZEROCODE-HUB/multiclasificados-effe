import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { toast } from "sonner";
import { useSession } from "@/hooks/useSession";
import { reconciliarOrdenesPendientes } from "@/lib/payments";

// Rescata los pagos que se quedaron a medias.
//
// Todo el cobro depende de que Izipay nos avise por el webhook. Cuando ese aviso
// no llega —se cortó la conexión del comprador justo entonces, la función estuvo
// caída un minuto— el usuario paga y no recibe nada, y la única salida era que
// escribiera a soporte. Ahora, al abrir la app o al volver a ella, se repasan
// sus órdenes sin confirmar y se resuelven contra la pasarela.
//
// No acredita nada por su cuenta: la Edge Function llama a `settle_paid_order`,
// que es idempotente, así que repasar de más nunca duplica un abono.

// Margen entre repasos: volver de segundo plano tres veces en un minuto no debe
// disparar tres rondas de consultas.
const ESPERA_MINIMA_MS = 30_000;

export function ReconciliadorDePagos() {
  const session = useSession();
  const ultimo = useRef(0);
  const corriendo = useRef(false);

  useEffect(() => {
    // Sin sesión de Supabase no hay órdenes que mirar (los modos demo no pagan).
    if (!session?.supabase) return;

    let vivo = true;

    const repasar = async () => {
      if (corriendo.current) return;
      if (Date.now() - ultimo.current < ESPERA_MINIMA_MS) return;
      corriendo.current = true;
      ultimo.current = Date.now();
      try {
        const acreditadas = await reconciliarOrdenesPendientes();
        if (!vivo || acreditadas === 0) return;
        toast.success("Tu pago se confirmó", {
          description: acreditadas === 1
            ? "Ya tienes tu saldo acreditado."
            : `Se confirmaron ${acreditadas} pagos pendientes.`,
        });
        // Las pantallas de comprobantes ya escuchan este evento para recargar.
        window.dispatchEvent(new Event("effe:invoices-updated"));
      } catch {
        // Si la pasarela no contesta, se reintentará en el próximo regreso a la
        // app (y el barrido del servidor sigue por su cuenta).
      } finally {
        corriendo.current = false;
      }
    };

    void repasar();

    const alVolver = () => { if (document.visibilityState === "visible") void repasar(); };
    document.addEventListener("visibilitychange", alVolver);

    // En el APK el navegador del pago se abre encima: al cerrarlo, la app vuelve
    // a primer plano y este es el momento exacto de comprobar.
    let quitarNativo: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      const p = App.addListener("appStateChange", ({ isActive }) => { if (isActive) void repasar(); });
      void p.then((h) => { quitarNativo = () => h.remove(); });
    }

    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", alVolver);
      quitarNativo?.();
    };
  }, [session?.supabase]);

  return null;
}
