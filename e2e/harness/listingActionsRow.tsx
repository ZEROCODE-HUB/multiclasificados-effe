import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Heart, Share2, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACTION_ROW, ACTION_BTN, ACTION_BTN_SAVE } from "@/pages/listingActions.styles";

// La fila de acciones del detalle de aviso, con las clases REALES (importadas de
// listingActions.styles.ts) y los botones reales. Montar ListingDetail entero
// aquí exigiría stubear media app; lo que hay que medir es el layout de esta
// fila con los textos que de verdad se muestran.
function Fila() {
  const [fav, setFav] = useState(false);
  return (
    <div className={ACTION_ROW} data-testid="fila-acciones">
      <Button variant="outline" size="sm" className={ACTION_BTN_SAVE} onClick={() => setFav((v) => !v)}>
        <Heart size={14} className={fav ? "fill-secondary text-secondary" : ""} /> {fav ? "Guardado" : "Guardar"}
      </Button>
      <Button variant="outline" size="sm" className={ACTION_BTN}>
        <Share2 size={14} /> Compartir
      </Button>
      <Button variant="outline" size="sm" className={ACTION_BTN}>
        <Flag size={14} /> Reportar
      </Button>
    </div>
  );
}

// 375px = iPhone SE, el ancho más angosto que soporta la app; el `px-4` imita el
// padding de la columna de la ficha.
createRoot(document.getElementById("root")!).render(
  <div style={{ width: 375 }} className="px-4">
    <Fila />
  </div>,
);
