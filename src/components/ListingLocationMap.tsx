interface ListingLocationMapProps {
  lat: number;
  lng: number;
  /** Radio aproximado del encuadre en grados (~0.02 ≈ barrio/ciudad). */
  span?: number;
}

// Mapa de ubicación del aviso. Se incrusta OpenStreetMap vía iframe (su propio
// documento): muestra la ubicación real con un marcador y es inmune a los
// problemas de compositing/CSS que impiden pintar los tiles de Leaflet dentro
// del layout del detalle. Mismo proveedor de mapa que la vista /buscar.
export function ListingLocationMap({ lat, lng, span = 0.02 }: ListingLocationMapProps) {
  const bbox = [lng - span, lat - span, lng + span, lat + span]
    .map((n) => n.toFixed(6))
    .join("%2C");
  const src =
    `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}` +
    `&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`;

  return (
    <iframe
      title="Ubicación en el mapa"
      src={src}
      loading="lazy"
      className="absolute inset-0 w-full h-full border-0"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
