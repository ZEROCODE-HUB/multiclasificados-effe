import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * LLEGAR A UNA LISTA SEÑALANDO LA FILA CONCRETA.
 *
 * Una notificación que deja al usuario en una lista general no ha terminado su
 * trabajo: le ha dicho que algo pasó y le ha pedido que lo busque. Con veinte
 * avisos, o con la lista de postulaciones de una semana, eso es exactamente lo
 * que hace que no se mire.
 *
 * Lo pidió el cliente para los avisos («te marca el aviso») y se resolvió a mano
 * en «Mis avisos». Esto es esa misma mecánica, sacada de allí para que las demás
 * pantallas a las que llevan las notificaciones no tengan cada una su versión:
 *
 *   campana → /ruta?<param>=<id> → se abre la lista, sube hasta esa fila y la
 *   resalta unos segundos.
 *
 * EL RESALTADO SE APAGA SOLO, y no es un detalle: es para *encontrar* la fila,
 * no para dejarla marcada. Un resaltado permanente se lee como un estado del
 * elemento ("esta postulación es especial") y no como lo que es.
 *
 * SE LEE CON `useSearchParams` Y NO DE `window.location`: si el usuario ya está
 * en la pantalla y pulsa otra notificación, React Router cambia la URL pero NO
 * remonta el componente. Leyéndolo del hook, el efecto se vuelve a disparar con
 * el id nuevo; leyéndolo una vez al montar, no pasaría nada — que es el fallo
 * que tenía la pantalla de mensajes.
 */
export interface FilaSenalada {
  /** El id que pide la URL. "" si no viene ninguno. */
  senalado: string;
  /** El id que se está resaltando AHORA (se apaga solo). */
  resaltado: string;
  /** `ref` que hay que poner en la fila señalada para que se suba hasta ella. */
  filaRef: React.MutableRefObject<HTMLDivElement | null>;
  /** Clases del resaltado, para no repetirlas en cada pantalla. */
  clasesDeResaltado: (id: string) => string;
}

/** Milisegundos que dura el resaltado y lo que se espera antes de saltar. */
const DURACION = 2600;
const ESPERA_DOM = 120;

export function useFilaSenalada(
  param: string,
  /**
   * `false` mientras la lista se está cargando: sin esto se intentaría saltar a
   * una fila que todavía no está en el DOM y no pasaría nada.
   */
  listo = true,
  /**
   * Se llama con el id antes de saltar. Sirve para lo que haga falta preparar
   * —cambiar de pestaña, por ejemplo— para que la fila llegue a existir.
   */
  alLlegar?: (id: string) => void,
): FilaSenalada {
  const [searchParams] = useSearchParams();
  const senalado = searchParams.get(param) ?? "";
  const [resaltado, setResaltado] = useState("");
  const filaRef = useRef<HTMLDivElement | null>(null);

  // `alLlegar` se guarda en una ref para que redefinirla en cada render (que es
  // lo normal con una función en línea) no vuelva a disparar el efecto y deje
  // el resaltado parpadeando.
  const alLlegarRef = useRef(alLlegar);
  alLlegarRef.current = alLlegar;

  useEffect(() => {
    if (!senalado || !listo) return;
    alLlegarRef.current?.(senalado);
    setResaltado(senalado);
    // El salto va DESPUÉS de que React pinte: si se hace en el mismo ciclo, la
    // fila —o la pestaña que la contiene— todavía no está y no encuentra nada.
    const irAlla = window.setTimeout(() => {
      filaRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, ESPERA_DOM);
    const apagar = window.setTimeout(() => setResaltado(""), DURACION);
    return () => { window.clearTimeout(irAlla); window.clearTimeout(apagar); };
  }, [senalado, listo]);

  const clasesDeResaltado = (id: string) =>
    id && id === resaltado ? "bg-secondary/10 ring-2 ring-inset ring-secondary/40" : "";

  return { senalado, resaltado, filaRef, clasesDeResaltado };
}
