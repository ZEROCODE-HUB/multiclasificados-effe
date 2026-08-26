// Ver un vídeo del aviso sin salir de la ficha.
//
// Antes el vídeo se pintaba incrustado y ocupaba hasta 420 px de alto: con tres
// vídeos eran más de 1 200 px de rectángulos negros entre la descripción y el
// contacto. Ahora hay un botón, y el vídeo se abre aquí.
//
// Lo que se cuida, que es donde estas cosas se rompen:
//
//   · **Vídeos verticales.** Los grabados con el móvil son 9:16 y son los que
//     desbordan: limitar solo el ancho no sirve de nada. El alto se topa contra
//     el hueco real de pantalla —descontando el notch y la barra de abajo— y el
//     vídeo se ajusta con `object-contain`, sin recortes ni barras de scroll.
//   · **El notch.** `DialogContent` ya se centra descontando `--safe-top` y
//     `--safe-bottom`; aquí solo hay que no pelearse con eso.
//   · **Que el sonido no siga sonando al cerrar.** Radix desmonta el contenido,
//     pero durante la animación de salida el vídeo sigue vivo unas décimas y se
//     oye. Se pausa explícitamente.
//   · **La X sobre negro.** La del diálogo hereda el color del texto, que sobre
//     un vídeo negro es invisible en tema claro. Se pone una propia, blanca y
//     con fondo, para que se vea siempre y no dependa del tema.
//   · **`playsInline`.** Sin esto, iPhone se lleva el vídeo a pantalla completa
//     él solo y el modal deja de pintar nada.
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import {
  Dialog, DialogClose, DialogContent, DialogTitle,
} from "@/components/ui/dialog";

export interface VideoDialogProps {
  /** URL del vídeo. `null` mantiene el diálogo cerrado. */
  url: string | null;
  onClose: () => void;
  /** Para el título accesible: "Video 2 del aviso". */
  titulo?: string;
}

export function VideoDialog({ url, onClose, titulo = "Video del aviso" }: VideoDialogProps) {
  const ref = useRef<HTMLVideoElement>(null);

  // Al cerrar, parar. Radix desmonta el contenido, pero la animación de salida
  // dura unas décimas y en ese rato el vídeo se sigue oyendo.
  useEffect(() => {
    if (url) return;
    const v = ref.current;
    if (!v) return;
    try { v.pause(); } catch { /* el navegador puede haberlo soltado ya */ }
  }, [url]);

  return (
    <Dialog open={!!url} onOpenChange={(abierto) => { if (!abierto) onClose(); }}>
      <DialogContent
        hideClose
        // Sin esto Radix avisa por consola en CADA apertura de que falta una
        // descripción. Aquí no hay nada que describir —es un vídeo con sus
        // controles— y `undefined` explícito es la forma que da Radix de decir
        // "no la hay". Un aviso repetido acaba enseñando a ignorar la consola.
        aria-describedby={undefined}
        className="max-w-3xl p-0 overflow-hidden border-0 bg-black sm:rounded-lg"
      >
        {/* Radix exige un título para lectores de pantalla; aquí sobra a la vista. */}
        <DialogTitle className="sr-only">{titulo}</DialogTitle>

        <DialogClose
          aria-label="Cerrar"
          className="absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white/70"
        >
          <X className="h-5 w-5" />
        </DialogClose>

        {url && (
          <video
            ref={ref}
            src={url}
            controls
            autoPlay
            playsInline
            preload="metadata"
            // El alto es lo que decide si esto desborda o no: un vídeo vertical
            // con solo `w-full` se sale de la pantalla por abajo.
            className="block w-full max-h-[calc(100dvh-6rem-var(--safe-top)-var(--safe-bottom))] object-contain bg-black"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default VideoDialog;
