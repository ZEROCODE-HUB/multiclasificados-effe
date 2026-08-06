import { useEffect, useState } from "react";
import { Plus, Minus, LocateFixed } from "lucide-react";
import { MapContainer, TileLayer, Marker, AttributionControl, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

// Pin de precio anclado a la coordenada (mismo divIcon que ListingsMap). El
// wrapper se desplaza -50%/-100% para que la puntita caiga justo en el punto.
function priceIcon(label: string): L.DivIcon {
  return L.divIcon({
    className: "!bg-transparent !border-0",
    html:
      `<div class="flex flex-col items-center" style="transform:translate(-50%,-100%)">` +
      `<span class="inline-flex items-center whitespace-nowrap rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-secondary-foreground shadow-lg ring-2 ring-secondary/20">${label}</span>` +
      `<span class="-mt-0.5 h-2 w-2 rotate-45 bg-secondary"></span>` +
      `</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

// Expone la instancia del mapa al padre (para los botones +/−) y corrige el
// tamaño tras montar: el contenedor tiene alto fijo por CSS y sin esto Leaflet
// a veces calcula el viewport antes de que el layout se asiente y deja tiles
// grises.
function MapBridge({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    onReady(map);
  }, [map, onReady]);
  return null;
}

// Mapa de ubicación del aviso.
//
// Antes era un <iframe> del embed de OpenStreetMap con `pointer-events-none`:
// el pin de precio se dibujaba fijo en el centro de la caja, así que había que
// impedir que el mapa se moviera para que no se despegara de la ubicación. En
// iOS ese iframe además atrapaba el toque y la página no scrolleaba (MOB-10).
//
// Con Leaflet el pin es un Marker real anclado a la coordenada, así que el mapa
// puede moverse libremente. La convivencia con el scroll de la página se
// resuelve por `touch-action` (clase .map-pan-y en index.css):
//   · un dedo en vertical  → scrollea la página;
//   · un dedo en horizontal → desplaza el mapa;
//   · dos dedos            → mueven el mapa y hacen zoom (TouchZoom de Leaflet
//                            hace pan y zoom a la vez).
// En escritorio se arrastra con el ratón; la rueda NO hace zoom (robaba el
// scroll de la página), para eso están los botones +/−.
export function ListingLocationMap({ lat, lng, price, currency }: ListingLocationMapProps) {
  const [map, setMap] = useState<L.Map | null>(null);
  const center: [number, number] = [lat, lng];

  return (
    <div className="map-pan-y absolute inset-0">
      <MapContainer
        center={center}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom={false}
        zoomControl={false}
        className="w-full h-full z-0"
        // Igual que en ListingsMap: sin el prefijo "Leaflet | Reporta un
        // problema", solo el crédito que exige la licencia de OSM (IT2-029).
        attributionControl={false}
      >
        <AttributionControl prefix={false} />
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={center} icon={priceIcon(formatPrice(price, currency))} />
        <MapBridge onReady={setMap} />
      </MapContainer>

      {/* Controles propios (reemplazan a los de Leaflet, desactivados arriba con
          zoomControl={false}) para mantener el estilo de la app.
          z-10 y no z-[600] (MOB-06): el contenedor de esta sección no crea un
          contexto de apilamiento propio, así que un z-index alto aquí competía
          directamente contra el z-50 de la barra superior y se le montaba encima
          al scrollear. Con z-10 sigue por encima del mapa —que está aislado en
          su propio contexto por el z-0 de .leaflet-container— y por debajo de la
          barra. */}
      <div className="absolute right-2 top-2 z-10 flex flex-col overflow-hidden rounded-md border border-border bg-card shadow-md">
        <button
          type="button"
          aria-label="Acercar"
          onClick={() => map?.zoomIn()}
          className="flex h-8 w-8 items-center justify-center text-foreground hover:bg-muted disabled:opacity-40"
        >
          <Plus size={16} />
        </button>
        <div className="h-px bg-border" />
        <button
          type="button"
          aria-label="Alejar"
          onClick={() => map?.zoomOut()}
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
          onClick={() => map?.flyTo(center, DEFAULT_ZOOM)}
          className="flex h-8 w-8 items-center justify-center text-foreground hover:bg-muted disabled:opacity-40"
        >
          <LocateFixed size={16} />
        </button>
      </div>

      {/* Solo en pantallas táctiles: sin esta pista, mover el mapa con un dedo
          parece roto (lo que ocurre es que la página está scrolleando).
          z-10 por el mismo motivo que los controles de arriba (MOB-06). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-6 [@media(hover:hover)]:hidden">
        <span className="rounded-full bg-primary/85 px-3 py-1 text-[11px] font-semibold text-primary-foreground shadow-lg backdrop-blur-sm">
          Usa dos dedos para mover el mapa
        </span>
      </div>
    </div>
  );
}
