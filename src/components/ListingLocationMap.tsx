import { useState } from "react";
import { Plus, Minus } from "lucide-react";

interface ListingLocationMapProps {
  lat: number;
  lng: number;
  price: number;
  currency: string;
}

// Mismo formato de precio que el mapa de búsqueda (ListingsMap).
const formatPrice = (price: number, currency: string) =>
  currency === "USD" ? `US$ ${price.toLocaleString()}` : `S/ ${price.toLocaleString()}`;

// Niveles de zoom = radio del encuadre en grados (más chico = más cerca).
const SPANS = [0.003, 0.006, 0.012, 0.025, 0.05, 0.1];
const DEFAULT_LEVEL = 3; // 0.025 ≈ ciudad

// Mapa de ubicación del aviso. Se incrusta OpenStreetMap vía iframe (su propio
// documento) para evitar el problema de compositing que impide pintar los tiles
// de Leaflet en el layout del detalle. El iframe NO es arrastrable, así el
// centro es siempre la ubicación del aviso y el pin de precio queda fijo. El
// zoom lo maneja este componente cambiando el encuadre alrededor del mismo
// punto (botones +/−), por lo que la ubicación se mantiene fija al hacer zoom.
export function ListingLocationMap({ lat, lng, price, currency }: ListingLocationMapProps) {
  const [level, setLevel] = useState(DEFAULT_LEVEL);
  const span = SPANS[level];

  const bbox = [lng - span, lat - span, lng + span, lat + span]
    .map((n) => n.toFixed(6))
    .join("%2C");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`;

  const zoomIn = () => setLevel((l) => Math.max(0, l - 1));
  const zoomOut = () => setLevel((l) => Math.min(SPANS.length - 1, l + 1));

  return (
    <>
      {/* Mapa estático (no arrastrable): el centro es siempre la ubicación. */}
      <iframe
        title="Ubicación en el mapa"
        src={src}
        loading="lazy"
        tabIndex={-1}
        className="pointer-events-none absolute inset-0 w-full h-full border-0 select-none"
        referrerPolicy="no-referrer-when-downgrade"
      />

      {/* Controles de zoom propios (cubren los del iframe, que quedan inertes). */}
      <div className="absolute right-2 top-2 z-[600] flex flex-col overflow-hidden rounded-md border border-border bg-card shadow-md">
        <button
          type="button"
          aria-label="Acercar"
          onClick={zoomIn}
          disabled={level === 0}
          className="flex h-8 w-8 items-center justify-center text-foreground hover:bg-muted disabled:opacity-40"
        >
          <Plus size={16} />
        </button>
        <div className="h-px bg-border" />
        <button
          type="button"
          aria-label="Alejar"
          onClick={zoomOut}
          disabled={level === SPANS.length - 1}
          className="flex h-8 w-8 items-center justify-center text-foreground hover:bg-muted disabled:opacity-40"
        >
          <Minus size={16} />
        </button>
      </div>

      {/* Pin de precio (naranja), fijo en el centro = ubicación del aviso. */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] flex -translate-x-1/2 -translate-y-full flex-col items-center">
        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-secondary-foreground shadow-lg ring-2 ring-secondary/20">
          {formatPrice(price, currency)}
        </span>
        <span className="-mt-0.5 h-2 w-2 rotate-45 bg-secondary" />
      </div>
    </>
  );
}
