import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initNative } from "./lib/nativeInit";

// Promueve el preload de la fuente Montserrat a stylesheet. Antes esto se hacía
// con un `onload` inline en el <link> del index.html, pero un manejador en línea
// choca con la CSP que ahora incluye `script-src` sin unsafe-inline (IT2-003).
// Al hacerlo desde el bundle (script de 'self') no se viola la política.
const fontLink = document.getElementById("montserrat-font") as HTMLLinkElement | null;
if (fontLink) fontLink.rel = "stylesheet";

initNative();

createRoot(document.getElementById("root")!).render(<App />);
