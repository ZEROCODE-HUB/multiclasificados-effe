import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initNative } from "./lib/nativeInit";
import { supabaseConfigError } from "@/lib/supabase";
import { BootError } from "@/components/BootError";
import { BootErrorBoundary } from "@/components/BootErrorBoundary";
import { ConnectionGate } from "@/components/ConnectionGate";
import { vigilarPrecargas, limpiarMarcaDeRecarga } from "@/lib/cargaDiferida";
import { cargarImagenPorDefecto } from "@/lib/imagenPorDefecto";

// Promueve el preload de la fuente Montserrat a stylesheet. Antes esto se hacía
// con un `onload` inline en el <link> del index.html, pero un manejador en línea
// choca con la CSP que ahora incluye `script-src` sin unsafe-inline (IT2-003).
// Al hacerlo desde el bundle (script de 'self') no se viola la política.
const fontLink = document.getElementById("montserrat-font") as HTMLLinkElement | null;
if (fontLink) fontLink.rel = "stylesheet";

// El bundle llegó a ejecutarse → marca el arranque para que el watchdog externo
// (public/boot-watchdog.js) NO muestre su pantalla de "no cargó". A partir de
// aquí, cualquier fallo lo diagnostican las capas de React (BootError / boundary).
(window as unknown as { __EFFE_BOOTED__?: boolean }).__EFFE_BOOTED__ = true;

// Tras un despliegue, los trozos de código del build anterior desaparecen. Quien
// tuviera la app abierta se quedaba con un "Failed to fetch dynamically imported
// module" al entrar en cualquier sección del panel. Esto la recarga una vez para
// coger la versión nueva; el mismo cuidado está en cada ruta diferida.
vigilarPrecargas();
// Si venimos de una recarga forzada, se quita el parámetro de la barra de
// direcciones: la app ya arrancó y nadie tiene por qué copiar una URL con él.
limpiarMarcaDeRecarga();

// Imagen de los avisos sin foto, configurable desde el panel. Se pide una vez al
// arrancar y se guarda en el navegador, así que a partir de la segunda visita
// está disponible desde el primer render. En la primerísima visita las tarjetas
// pueden salir con la imagen del bundle hasta que responda: es un cambio de una
// imagen de marca por otra, no un hueco vacío, y no compensa retrasar el
// arranque de toda la app por eso.
void cargarImagenPorDefecto();

const root = createRoot(document.getElementById("root")!);

if (supabaseConfigError) {
  // Sin conexión configurada la app no puede operar: mostramos el diagnóstico en
  // vez de una app a medias. No arrancamos lo nativo (depende del cliente real).
  root.render(<BootError variant="config" detail={supabaseConfigError} />);
} else {
  initNative();
  root.render(
    <BootErrorBoundary>
      {/* Las variables pueden tener buena forma y aun así no servir (URL de otro
          proyecto, clave caducada). Sin esto la app arrancaba entera y fallaba
          en silencio: ni login ni avisos ni un mensaje. */}
      <ConnectionGate>
        <App />
      </ConnectionGate>
    </BootErrorBoundary>,
  );
}
