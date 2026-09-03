import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Download, Share, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  contarVisita, descartar, modoDeInstalacion, type ModoDeInstalacion,
} from "@/lib/instalable";

/**
 * La franja que ofrece instalar la web.
 *
 * En Chrome y compañía instala de un toque. En el iPhone no puede: Safari nunca
 * ha implementado `beforeinstallprompt`, así que allí solo se explican los dos
 * toques. Toda la decisión de A QUIÉN y CUÁNDO vive en `src/lib/instalable.ts`.
 *
 * Se pinta abajo y no arriba: arriba tapa el buscador, que es a lo que la gente
 * viene. Y se aparta de la barra inferior del móvil con `--nav-bottom`, nunca
 * con `env()` a mano (misma regla que los toasts y ShareListing).
 */

/** El evento de Chrome. No está en los tipos del DOM porque no es estándar. */
interface EventoDeInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function AvisoInstalar() {
  const [modo, setModo] = useState<ModoDeInstalacion>("ninguno");
  const [evento, setEvento] = useState<EventoDeInstalacion | null>(null);

  useEffect(() => {
    const nativa = Capacitor.isNativePlatform();
    if (nativa) return;

    // La visita se cuenta UNA vez por arranque, aquí y en ningún otro sitio.
    const visita = contarVisita();

    const decidir = (hayEvento: boolean) =>
      setModo(modoDeInstalacion({ nativa, hayEvento, visita }));

    // Chrome dispara esto cuando considera que la web es instalable. Hay que
    // cortarlo para que no salga su propio cartel y podamos elegir el momento.
    const alPoderInstalar = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoDeInstalacion);
      decidir(true);
    };
    window.addEventListener("beforeinstallprompt", alPoderInstalar);

    // El instructivo de iOS no depende de ningún evento, así que se decide ya.
    // Con un respiro: el arranque es lo que mide el usuario como "rápido", y un
    // cartel compitiendo con la primera pintura sobra.
    const t = window.setTimeout(() => decidir(false), 4000);

    // Cuando se instala de verdad, la franja se va sola. Sin esto se queda
    // ofreciendo lo que la persona acaba de hacer.
    const yaEstá = () => setModo("ninguno");
    window.addEventListener("appinstalled", yaEstá);

    return () => {
      window.removeEventListener("beforeinstallprompt", alPoderInstalar);
      window.removeEventListener("appinstalled", yaEstá);
      window.clearTimeout(t);
    };
  }, []);

  if (modo === "ninguno") return null;

  const cerrar = () => { descartar(); setModo("ninguno"); };

  const instalar = async () => {
    if (!evento) return;
    // Se cierra pase lo que pase: el navegador solo deja usar el evento UNA vez,
    // así que dejar la franja sería dejar un botón que ya no responde.
    setModo("ninguno");
    try {
      await evento.prompt();
      const { outcome } = await evento.userChoice;
      // Si dijo que no, se respeta igual que un "ahora no" del aspa.
      if (outcome === "dismissed") descartar();
    } catch {
      // Un `prompt()` que falla (ya consumido, o el navegador lo bloquea) no
      // puede reventar la pantalla; la franja ya se cerró.
    }
  };

  return (
    <div
      role="region"
      aria-label="Instalar la aplicación"
      className={
        "fixed inset-x-0 z-40 px-3 bottom-[calc(0.75rem+var(--nav-bottom))] " +
        "pointer-events-none animate-fade-in"
      }
    >
      <div
        className={
          "pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-xl border " +
          "bg-card/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80"
        }
      >
        <img
          src="/icon-192.png"
          alt=""
          className="h-10 w-10 shrink-0 rounded-lg"
          width={40}
          height={40}
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Instala eFFe en tu teléfono</p>
          {modo === "ios-manual" ? (
            // El instructivo. Los iconos van intercalados en el texto porque es
            // lo que la persona tiene que BUSCAR en su pantalla: describirlo con
            // palabras ("el cuadrado con la flecha") se entiende peor.
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted-foreground">
              Toca
              <Share size={13} className="inline shrink-0" aria-label="Compartir" />
              y luego
              <Plus size={13} className="inline shrink-0" aria-label="Añadir" />
              <span className="font-medium text-foreground">Añadir a pantalla de inicio</span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Se abre más rápido y sin la barra del navegador.
            </p>
          )}
        </div>

        {modo === "automatico" && (
          <Button size="sm" className="h-8 shrink-0 gap-1 px-3 text-xs" onClick={instalar}>
            <Download size={13} /> Instalar
          </Button>
        )}

        <button
          type="button"
          onClick={cerrar}
          aria-label="Ahora no"
          // 32px de zona táctil: es un aspa pequeña y pegada a un botón que
          // instala. Errar el dedo aquí tiene consecuencias.
          className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export default AvisoInstalar;
