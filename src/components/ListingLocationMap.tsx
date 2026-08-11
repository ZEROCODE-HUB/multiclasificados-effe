import { Plus, Minus, LocateFixed } from "lucide-react";
import { useEffect, useRef } from "react";
import { pinAnclado } from "@/components/mapIcons";
import { useMapaDeGoogle, textoDeEstadoDelMapa } from "@/lib/googleMaps";

interface ListingLocationMapProps {
  lat: number;
  lng: number;
  price: number;
  currency: string;
}

// Mismo formato de precio que el mapa de búsqueda (ListingsMap).
const formatPrice = (price: number, currency: string) =>
  currency === "USD" ? `US$ ${price.toLocaleString()}` : `S/ ${price.toLocaleString()}`;

const DEFAULT_ZOOM = 15; // ≈ barrio: se reconoce la manzana sin dar la puerta exacta.

/**
 * Mapa de ubicación del aviso.
 *
 * Historia, porque explica las decisiones raras: primero fue un <iframe> del
 * embed de OpenStreetMap con `pointer-events-none` —el pin se dibujaba fijo en
 * el centro de la caja, así que había que impedir que el mapa se moviera— y en
 * iOS ese iframe atrapaba el toque y la página no scrolleaba (MOB-10). Después
 * fue Leaflet, con el pin ya anclado a la coordenada y la convivencia con el
 * scroll resuelta a mano con `touch-action` (clase .map-pan-y).
 *
 * Ahora es Google, y ese apaño ya no hace falta: `gestureHandling: "cooperative"`
 * hace exactamente lo que se buscaba, y además lo explica solo:
 *   · un dedo         → scrollea la página, y el mapa avisa de que se necesitan dos;
 *   · dos dedos       → mueven el mapa y hacen zoom;
 *   · rueda del ratón → scrollea la página; con Ctrl (o ⌘) hace zoom.
 */
export function ListingLocationMap({ lat, lng, price, currency }: ListingLocationMapProps) {
  const center = { lat, lng };

  const { contenedor, mapa, libs, estado } = useMapaDeGoogle({
    center,
    zoom: DEFAULT_ZOOM,
    gestureHandling: "cooperative",
    disableDefaultUI: true,
    clickableIcons: false,
  });

  const marcador = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  useEffect(() => {
    if (!mapa || !libs) return;
    const m = new libs.marker.AdvancedMarkerElement({
      map: mapa,
      position: center,
      content: pinAnclado(formatPrice(price, currency)),
    });
    marcador.current = m;
    return () => { m.map = null; marcador.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa, libs, lat, lng, price, currency]);

  const aviso = textoDeEstadoDelMapa(estado);

  return (
    <div className="absolute inset-0">
      <div ref={contenedor} className="w-full h-full" />

      {aviso && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <p className="text-sm text-muted-foreground">{aviso}</p>
        </div>
      )}

      {/* Controles propios (los de Google van desactivados con disableDefaultUI)
          para mantener el estilo de la app.
          z-10 y no z-[600] (MOB-06): el contenedor de esta sección no crea un
          contexto de apilamiento propio, así que un z-index alto aquí competía
          directamente contra el z-50 de la barra superior y se le montaba encima
          al scrollear. */}
      <div className="absolute right-2 top-2 z-10 flex flex-col overflow-hidden rounded-md border border-border bg-card shadow-md">
        <button
          type="button"
          aria-label="Acercar"
          onClick={() => mapa?.setZoom((mapa.getZoom() ?? DEFAULT_ZOOM) + 1)}
          className="flex h-8 w-8 items-center justify-center text-foreground hover:bg-muted disabled:opacity-40"
        >
          <Plus size={16} />
        </button>
        <div className="h-px bg-border" />
        <button
          type="button"
          aria-label="Alejar"
          onClick={() => mapa?.setZoom((mapa.getZoom() ?? DEFAULT_ZOOM) - 1)}
          className="flex h-8 w-8 items-center justify-center text-foreground hover:bg-muted disabled:opacity-40"
        >
          <Minus size={16} />
        </button>
        <div className="h-px bg-border" />
        {/* Volver a la ubicación del aviso (MOB-04): al arrastrar el mapa se
            podía dejar el pin fuera de vista y no había forma de recuperarlo
            salvo recargando la pantalla. */}
        <button
          type="button"
          aria-label="Centrar en la ubicación del aviso"
          title="Centrar en la ubicación del aviso"
          onClick={() => { mapa?.panTo(center); mapa?.setZoom(DEFAULT_ZOOM); }}
          className="flex h-8 w-8 items-center justify-center text-foreground hover:bg-muted disabled:opacity-40"
        >
          <LocateFixed size={16} />
        </button>
      </div>
    </div>
  );
}
