import { useEffect, useMemo, useRef } from "react";
import { imgUrl } from "@/lib/imageUrl";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import type { Listing } from "@/data/mockData";

// Centro por defecto: Lima Metropolitana.
const LIMA_CENTER: [number, number] = [-12.0464, -77.0428];

const formatPrice = (price: number, currency: string) =>
  currency === "USD" ? `US$ ${(price / 1000).toFixed(0)}K` : `S/ ${price.toLocaleString()}`;

// Un aviso con coordenadas válidas (lat/lng no nulos).
type GeoListing = Listing & { lat: number; lng: number };

const hasCoords = (l: Listing): l is GeoListing =>
  typeof l.lat === "number" && typeof l.lng === "number" &&
  !Number.isNaN(l.lat) && !Number.isNaN(l.lng);

// Pin de precio como divIcon (respeta el diseño de la app con clases Tailwind).
function priceIcon(label: string, active: boolean): L.DivIcon {
  const cls = active
    ? "bg-primary text-primary-foreground scale-110 ring-4 ring-primary/20"
    : "bg-secondary text-secondary-foreground ring-2 ring-secondary/20";
  return L.divIcon({
    className: "!bg-transparent !border-0",
    html: `<div class="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold shadow-lg whitespace-nowrap transition-all ${cls}">${label}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

// Ícono de clúster (varios avisos cercanos agrupados) con el color de marca.
// El tamaño crece un poco con la cantidad para que se lea la densidad.
function clusterIcon(cluster: { getChildCount: () => number }): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 40 : count < 50 ? 48 : 56;
  return L.divIcon({
    className: "!bg-transparent !border-0",
    html: `<div class="flex items-center justify-center rounded-full bg-secondary text-secondary-foreground font-extrabold shadow-lg ring-4 ring-secondary/25" style="width:${size}px;height:${size}px;font-size:${count < 100 ? 14 : 12}px">${count}</div>`,
    iconSize: L.point(size, size, true),
    iconAnchor: [size / 2, size / 2],
  });
}

// Encuadra el mapa a los avisos con coordenadas; si cambia el activo, vuela a él.
function MapController({ points, active }: { points: GeoListing[]; active: string | null }) {
  const map = useMap();
  const inited = useRef(false);

  // Encuadra el mapa a TODOS los avisos con coordenadas (vista panorámica).
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
    inited.current = false; // permite re-ajustar; el próximo "active" no debe pisar el encuadre
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.map((p) => p.id).join(",")]);

  // Al pasar el mouse por la lista: pan suave al aviso (sin cambiar el zoom).
  // Se omite la primera selección automática para no pisar el encuadre inicial.
  useEffect(() => {
    if (!active) return;
    if (!inited.current) { inited.current = true; return; }
    const p = points.find((x) => x.id === active);
    if (p) map.panTo([p.lat, p.lng], { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return null;
}

interface ListingsMapProps {
  listings: Listing[];
  active: string | null;
  onActive: (id: string) => void;
  /** Ruta a la que navega el pin (permite anteponer /auth si no hay sesión). */
  hrefFor: (id: string) => string;
}

export function ListingsMap({ listings, active, onActive, hrefFor }: ListingsMapProps) {
  const points = useMemo(() => listings.filter(hasCoords), [listings]);
  const missing = listings.length - points.length;

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={LIMA_CENTER}
        zoom={12}
        scrollWheelZoom
        className="w-full h-full z-0"
        // El contenedor padre ya tiene bg-muted mientras cargan los tiles.
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController points={points} active={active} />

        <MarkerClusterGroup
          iconCreateFunction={clusterIcon}
          maxClusterRadius={45}
          showCoverageOnHover={false}
          spiderfyOnMaxZoom
          chunkedLoading
        >
          {points.map((l) => (
            <Marker
              key={l.id}
              position={[l.lat, l.lng]}
              icon={priceIcon(formatPrice(l.price, l.currency), active === l.id)}
              eventHandlers={{ mouseover: () => onActive(l.id), click: () => onActive(l.id) }}
            >
              <Popup>
                <Link to={hrefFor(l.id)} className="block w-52 no-underline">
                  <div className="aspect-[4/3] bg-muted overflow-hidden rounded-t">
                    <img src={imgUrl(l.imageUrl, 300)} alt={l.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  </div>
                  <div className="pt-2">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-secondary">
                      {l.category}
                    </span>
                    <h4 className="text-sm font-semibold text-foreground line-clamp-2 mt-0.5">{l.title}</h4>
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                      <MapPin size={10} /> {l.location}
                    </p>
                    <p className="text-base font-extrabold text-primary mt-1">
                      {formatPrice(l.price, l.currency)}
                    </p>
                  </div>
                </Link>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>

      {points.length === 0 && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center pointer-events-none">
          <div className="bg-card/95 backdrop-blur border border-border rounded-lg px-4 py-3 text-center shadow-lg max-w-xs">
            <p className="text-sm font-semibold text-foreground">Sin ubicaciones en el mapa</p>
            <p className="text-xs text-muted-foreground mt-1">
              Los avisos de esta búsqueda aún no tienen coordenadas registradas.
            </p>
          </div>
        </div>
      )}

      {missing > 0 && points.length > 0 && (
        <div className="absolute bottom-3 left-3 z-[500] px-2 py-1 bg-card/90 backdrop-blur text-[10px] text-muted-foreground rounded shadow">
          {missing} {missing === 1 ? "aviso sin ubicación" : "avisos sin ubicación"} no se muestran
        </div>
      )}
    </div>
  );
}
