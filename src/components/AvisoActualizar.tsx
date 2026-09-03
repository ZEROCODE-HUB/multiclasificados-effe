import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hayVersionNueva } from "@/lib/versionDesplegada";
import { recargarSaltandoCache } from "@/lib/cargaDiferida";

/**
 * Avisa cuando la página lleva abierta desde antes del último despliegue.
 *
 * POR QUÉ EXISTE: se arregló el formulario de «Trabaje con nosotros», se
 * desplegó, y el cliente seguía viendo el mismo error horas después. Su pestaña
 * seguía ejecutando el JavaScript anterior, hablando con una base que ya había
 * cambiado. Nada se lo dijo. Ver `versionDesplegada.ts`.
 *
 * NO RECARGA SOLO, y es deliberado: recargar por sorpresa a alguien que está a
 * medio rellenar el formulario de publicar un aviso —o el de postular— le borra
 * lo escrito. El aviso se ve, se decide y se pulsa.
 *
 * Tampoco se puede cerrar. Es la diferencia entre esto y el aviso de instalar:
 * aquello es una oferta, y esto significa que la aplicación que se está usando
 * ya no es la que hay. Quedarse en ella es toparse con errores que ya están
 * arreglados.
 */

/** Cada cuánto se pregunta mientras la pestaña está a la vista. */
const CADA_MS = 10 * 60 * 1000;

export function AvisoActualizar() {
  const [hayNueva, setHayNueva] = useState(false);

  useEffect(() => {
    // En el APK y en el iPhone la versión la gobierna `UpdateGate` contra la
    // base de datos: allí actualizar es bajarse otro paquete, no recargar.
    if (Capacitor.isNativePlatform()) return;

    let vivo = true;
    const mirar = () => {
      // Sin conexión no se pregunta: `hayVersionNueva` ya devuelve null ante la
      // duda, pero ni siquiera vale la pena intentarlo.
      if (!navigator.onLine) return;
      void hayVersionNueva().then((nueva) => {
        if (vivo && nueva) setHayNueva(true);
      });
    };

    // Al arrancar no: una pestaña recién abierta ACABA de traerse el HTML, así
    // que preguntar es gastar una petición para oír que sí. El caso real es el
    // contrario — la pestaña que llevaba horas abierta —, y ese se cubre al
    // volver a ella.
    const alVolver = () => { if (document.visibilityState === "visible") mirar(); };
    document.addEventListener("visibilitychange", alVolver);
    const t = window.setInterval(mirar, CADA_MS);

    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", alVolver);
      window.clearInterval(t);
    };
  }, []);

  if (!hayNueva) return null;

  return (
    <div
      role="alert"
      className={
        "fixed inset-x-0 z-50 px-3 top-[calc(0.75rem+var(--nav-top))] " +
        "pointer-events-none animate-fade-in"
      }
    >
      <div
        className={
          "pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-xl border " +
          "bg-card/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80"
        }
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Hay una versión nueva</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Estás viendo una copia antigua de la página. Actualiza para seguir.
          </p>
        </div>
        <Button
          size="sm"
          className="h-8 shrink-0 gap-1 px-3 text-xs"
          // La misma recarga que usa `cargaDiferida`: un `location.reload()` a
          // secas no basta —Chrome en Android puede devolver el HTML de su
          // caché— y volveríamos a quedarnos con la copia vieja.
          onClick={() => recargarSaltandoCache()}
        >
          <RefreshCw size={13} /> Actualizar
        </Button>
      </div>
    </div>
  );
}

export default AvisoActualizar;
