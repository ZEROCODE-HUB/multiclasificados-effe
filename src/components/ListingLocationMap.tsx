interface ListingLocationMapProps {
  lat: number;
  lng: number;
  price: number;
  currency: string;
  /** Radio aproximado del encuadre en grados (~0.02 ≈ barrio/ciudad). */
  span?: number;
}

// Mismo formato de precio que el mapa de búsqueda (ListingsMap).
const formatPrice = (price: number, currency: string) =>
  currency === "USD" ? `US$ ${price.toLocaleString()}` : `S/ ${price.toLocaleString()}`;

// Mapa de ubicación del aviso. Se incrusta OpenStreetMap vía iframe (su propio
// documento): muestra la ubicación real y es inmune a los problemas de
// compositing/CSS que impiden pintar los tiles de Leaflet dentro del layout del
// detalle. El iframe va SIN marcador; encima se superpone el pin naranja con el
// precio, centrado (el mapa está centrado en las coordenadas del aviso), para
// que se vea igual que la vista /buscar.
export function ListingLocationMap({ lat, lng, price, currency, span = 0.02 }: ListingLocationMapProps) {
  const bbox = [lng - span, lat - span, lng + span, lat + span]
    .map((n) => n.toFixed(6))
    .join("%2C");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`;

  return (
    <>
      <iframe
        title="Ubicación en el mapa"
        src={src}
        loading="lazy"
        className="absolute inset-0 w-full h-full border-0"
        referrerPolicy="no-referrer-when-downgrade"
      />
      {/* Pin de precio (naranja), centrado sobre la ubicación. */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full z-[500] flex flex-col items-center">
        <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-secondary-foreground shadow-lg ring-2 ring-secondary/20 whitespace-nowrap">
          {formatPrice(price, currency)}
        </span>
        <span className="-mt-0.5 h-2 w-2 rotate-45 bg-secondary" />
      </div>
    </>
  );
}
