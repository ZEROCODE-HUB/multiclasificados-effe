// Cuántos pagos por Yape/Plin esperan una respuesta del equipo.
//
// Alimenta el aviso del menú del panel. Detrás de cada número hay alguien
// parado —su saldo no entra o su aviso no sale hasta que alguien mire—, así que
// el contador se refresca sin recargar la página: al volver a la pestaña, cada
// pocos minutos, y en cuanto se aprueba o rechaza uno.
import { useEffect, useState } from "react";
import { contarPagosManualesPendientes } from "@/lib/pagoManual";

/** Evento que emite la bandeja tras revisar un pago. */
export const EVENTO_PAGOS_REVISADOS = "effe:pagos-manuales-actualizados";

const CADA = 3 * 60 * 1000;

export function usePagosManualesPendientes(activo = true): number {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!activo) { setN(0); return; }

    let vivo = true;
    const refrescar = () => {
      // La cuenta la filtra el servidor por permiso: sin él devuelve 0 en vez
      // de fallar, así que aquí no hace falta comprobar nada.
      void contarPagosManualesPendientes().then((v) => { if (vivo) setN(v); });
    };

    refrescar();
    const timer = window.setInterval(refrescar, CADA);
    // Al volver a la pestaña: quien deja el panel abierto en segundo plano no
    // tiene por qué esperar al siguiente ciclo para enterarse.
    const alVolver = () => { if (document.visibilityState === "visible") refrescar(); };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener(EVENTO_PAGOS_REVISADOS, refrescar);

    return () => {
      vivo = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener(EVENTO_PAGOS_REVISADOS, refrescar);
    };
  }, [activo]);

  return n;
}
