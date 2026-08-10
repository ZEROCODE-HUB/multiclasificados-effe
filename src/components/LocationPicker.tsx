import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_TILES_URL, MAP_TILES_ATTRIBUTION } from "@/lib/mapTiles";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, ChevronDown, Search, Loader2 } from "lucide-react";
import { ZonaPicker } from "@/components/ZonaPicker";
import { etiquetaZona, zonaPorTexto, distanciaKm, type Zona } from "@/lib/zonas";
import { buscarDirecciones, type GeoResult } from "@/lib/geocode";
import { toast } from "@/hooks/use-toast";

// Pin (marcador con la punta en el punto exacto).
const pinIcon = L.divIcon({
  className: "",
  html: `<div class="text-primary drop-shadow"><svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});

// Recentra el mapa cuando cambian las coordenadas (al elegir otra zona).
function Recenter({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (pos) map.setView(pos, Math.max(map.getZoom(), 14));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos?.[0], pos?.[1]]);
  return null;
}

// Captura clics en el mapa para colocar el pin.
function ClickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

interface LocationPickerProps {
  location: string;
  onLocationChange: (v: string) => void;
  lat: number | null;
  lng: number | null;
  onCoordsChange: (lat: number | null, lng: number | null) => void;
  required?: boolean;
}

/**
 * Ubicación del aviso: una zona del catálogo y, si el anunciante quiere, el
 * punto exacto en el mapa.
 *
 * Antes era texto libre con un botón que lo geocodificaba. Eso dejaba dos
 * agujeros: marcar el punto era opcional —y un aviso sin coordenadas NO aparece
 * en las búsquedas por cercanía— y cada uno escribía la ubicación a su manera
 * ("Lima, Miraflores", "Miraflores", "miraflores lima"), que para filtrar son
 * tres sitios distintos. Con el catálogo, elegir la zona ya deja coordenadas
 * puestas (el centro de la zona) y el texto siempre queda igual escrito.
 */
export function LocationPicker({
  location,
  onLocationChange,
  lat,
  lng,
  onCoordsChange,
  required,
}: LocationPickerProps) {
  const zona = zonaPorTexto(location);
  const pos: [number, number] | null = lat != null && lng != null ? [lat, lng] : null;
  // El mapa es un ajuste fino: se abre solo si el anunciante lo pide, o si el
  // aviso ya traía un punto propio distinto del centro de su zona.
  const [mapaAbierto, setMapaAbierto] = useState(false);

  const elegirZona = (z: Zona) => {
    onLocationChange(etiquetaZona(z));
    // La zona manda: al cambiarla, el punto vuelve a su centro. Si el anunciante
    // quiere precisión, ajusta el pin después.
    onCoordsChange(z.lat, z.lng);
  };

  // Cuánto se alejó el pin del centro de la zona, para poder decirlo.
  const desvioKm = zona && pos ? distanciaKm(zona.lat, zona.lng, pos[0], pos[1]) : 0;
  const puntoPropio = desvioKm >= 0.3;

  // Buscar una dirección y llevar el pin hasta ahí, para no tener que
  // encontrarla a mano arrastrando el mapa. La búsqueda se sesga hacia la zona
  // elegida, porque "Av. Larco" existe en media docena de ciudades.
  const [direccion, setDireccion] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<GeoResult[]>([]);

  const buscarDireccion = async () => {
    if (!direccion.trim() || !zona || buscando) return;
    setBuscando(true);
    setResultados([]);
    const rs = await buscarDirecciones(`${direccion}, ${etiquetaZona(zona)}`, {
      lat: zona.lat,
      lng: zona.lng,
    });
    setBuscando(false);
    if (rs.length === 0) {
      toast({
        title: "No encontramos esa dirección",
        description: "Prueba con la calle y el número, o marca el punto tocando el mapa.",
      });
      return;
    }
    // Con un único resultado no se hace elegir; con varios, decide el anunciante
    // en vez de que la app adivine.
    if (rs.length === 1) onCoordsChange(rs[0].lat, rs[0].lng);
    else setResultados(rs);
  };

  const usarResultado = (r: GeoResult) => {
    onCoordsChange(r.lat, r.lng);
    setResultados([]);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="zona-aviso">Ubicación {required && "*"}</Label>
      <ZonaPicker
        id="zona-aviso"
        value={zona}
        onChange={elegirZona}
        placeholder="Elige el distrito o la provincia"
      />

      {zona && !mapaAbierto && (
        <button
          type="button"
          onClick={() => setMapaAbierto(true)}
          className="flex items-center gap-1 text-[11px] font-semibold text-secondary hover:underline"
        >
          <ChevronDown size={12} />
          {puntoPropio ? "Ver el punto exacto en el mapa" : "Marcar el punto exacto (opcional)"}
        </button>
      )}

      {zona && mapaAbierto && (
        <>
          <div className="flex gap-2">
            <Input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscarDireccion(); } }}
              placeholder="Calle y número (opcional)"
              className="flex-1"
              aria-label="Buscar una dirección dentro de la zona"
            />
            <Button type="button" variant="outline" onClick={buscarDireccion} disabled={buscando || !direccion.trim()} className="gap-1.5 shrink-0">
              {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Buscar
            </Button>
          </div>

          {resultados.length > 0 && (
            <ul className="divide-y rounded border border-border overflow-hidden">
              {resultados.map((r, i) => (
                <li key={`${r.lat},${r.lng},${i}`}>
                  <button
                    type="button"
                    onClick={() => usarResultado(r)}
                    className="w-full px-3 py-2 text-left hover:bg-muted transition-colors"
                  >
                    <span className="block text-sm font-medium">{r.label}</span>
                    {r.detalle && r.detalle !== r.label && (
                      <span className="block text-[11px] text-muted-foreground">{r.detalle}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="h-56 w-full overflow-hidden rounded border border-border relative">
            <MapContainer center={pos ?? [zona.lat, zona.lng]} zoom={14} scrollWheelZoom className="w-full h-full z-0">
              <TileLayer
                attribution={MAP_TILES_ATTRIBUTION}
                url={MAP_TILES_URL}
              />
              <Recenter pos={pos} />
              <ClickCapture onPick={(la, ln) => onCoordsChange(la, ln)} />
              {pos && (
                <Marker
                  position={pos}
                  icon={pinIcon}
                  draggable
                  eventHandlers={{
                    dragend: (e) => {
                      const m = (e.target as L.Marker).getLatLng();
                      onCoordsChange(m.lat, m.lng);
                    },
                  }}
                />
              )}
            </MapContainer>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              Toca el mapa o arrastra el pin para afinar. Cambiar de zona lo devuelve a su centro.
            </p>
            {puntoPropio && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto shrink-0 px-2 py-1 text-[11px]"
                onClick={() => onCoordsChange(zona.lat, zona.lng)}
              >
                Centrar
              </Button>
            )}
          </div>
        </>
      )}

      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <MapPin size={11} className="text-secondary shrink-0" />
        {zona
          ? puntoPropio
            ? `Punto exacto marcado, a ${desvioKm.toFixed(1)} km del centro de ${zona.nombre}.`
            : "Tu aviso aparecerá en las búsquedas por cercanía de esta zona."
          : "Elige tu zona para que tu aviso salga a quien busca cerca de ti."}
      </p>
    </div>
  );
}
