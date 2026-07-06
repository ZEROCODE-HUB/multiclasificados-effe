import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2, Crosshair } from "lucide-react";
import { geocode, reverseGeocode } from "@/lib/geocode";
import { toast } from "@/hooks/use-toast";

const LIMA: [number, number] = [-12.0464, -77.0428];

// Pin (marcador con la punta en el punto exacto).
const pinIcon = L.divIcon({
  className: "",
  html: `<div class="text-primary drop-shadow"><svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});

// Recentra el mapa cuando cambian las coordenadas (tras geocodificar).
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

export function LocationPicker({
  location,
  onLocationChange,
  lat,
  lng,
  onCoordsChange,
  required,
}: LocationPickerProps) {
  const [loading, setLoading] = useState(false);
  const pos: [number, number] | null = lat != null && lng != null ? [lat, lng] : null;

  // Geocodifica el texto de ubicación y coloca el pin.
  const locate = async () => {
    if (!location.trim()) {
      toast({ title: "Escribe una ubicación", description: "Ej: Lima, Miraflores." });
      return;
    }
    setLoading(true);
    const r = await geocode(location);
    setLoading(false);
    if (!r) {
      toast({
        title: "No se encontró la ubicación",
        description: "Prueba con un distrito o ciudad, o marca el punto en el mapa.",
        variant: "destructive",
      });
      return;
    }
    onCoordsChange(r.lat, r.lng);
  };

  // Al mover/clic en el mapa: fija coords y actualiza el texto (reverse geocode).
  const setFromMap = async (la: number, ln: number) => {
    onCoordsChange(la, ln);
    const name = await reverseGeocode(la, ln);
    if (name) onLocationChange(name);
  };

  return (
    <div className="space-y-2">
      <Label>Ubicación {required && "*"}</Label>
      <div className="flex gap-2">
        <Input
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          onBlur={() => { if (location.trim() && !pos) locate(); }}
          placeholder="Ej: Lima, Miraflores"
          className="flex-1"
        />
        <Button type="button" variant="outline" onClick={locate} disabled={loading} className="gap-1.5 shrink-0">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />}
          Ubicar
        </Button>
      </div>

      <div className="h-56 w-full overflow-hidden rounded border border-border relative">
        <MapContainer center={pos ?? LIMA} zoom={pos ? 14 : 11} scrollWheelZoom className="w-full h-full z-0">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Recenter pos={pos} />
          <ClickCapture onPick={setFromMap} />
          {pos && (
            <Marker
              position={pos}
              icon={pinIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = (e.target as L.Marker).getLatLng();
                  setFromMap(m.lat, m.lng);
                },
              }}
            />
          )}
        </MapContainer>
        {!pos && (
          <div className="absolute inset-0 z-[500] flex items-end justify-center pb-3 pointer-events-none">
            <span className="bg-card/90 backdrop-blur border border-border rounded-full px-3 py-1 text-[11px] text-muted-foreground shadow">
              Pulsa "Ubicar" o toca el mapa para marcar el punto
            </span>
          </div>
        )}
      </div>

      {pos ? (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <MapPin size={11} className="text-secondary" /> Ubicación fijada · {lat!.toFixed(5)}, {lng!.toFixed(5)}
          <button
            type="button"
            onClick={() => onCoordsChange(null, null)}
            className="ml-1 text-secondary hover:underline"
          >
            quitar
          </button>
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Marca la ubicación para que tu aviso aparezca en el mapa del buscador.
        </p>
      )}
    </div>
  );
}
