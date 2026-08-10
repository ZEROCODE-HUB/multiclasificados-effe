import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_TILES_URL, MAP_TILES_ATTRIBUTION } from "@/lib/mapTiles";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, ChevronDown, Search, Loader2 } from "lucide-react";
import { DEPARTAMENTOS, departamentoDeTexto, nombreDepartamento } from "@/lib/departamentos";
import { buscarDirecciones, regionDeCoordenadas, type GeoResult } from "@/lib/geocode";
import { toast } from "@/hooks/use-toast";

// Centro aproximado del país, para abrir el mapa en algún sitio razonable
// mientras no haya punto marcado.
const PERU: [number, number] = [-9.19, -75.015];

// Pin (marcador con la punta en el punto exacto).
const pinIcon = L.divIcon({
  className: "",
  html: `<div class="text-primary drop-shadow"><svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});

/** Recentra el mapa cuando cambian las coordenadas. */
function Recenter({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (pos) map.setView(pos, Math.max(map.getZoom(), 14));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos?.[0], pos?.[1]]);
  return null;
}

/** Captura clics en el mapa para colocar el pin. */
function ClickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

interface LocationPickerProps {
  /** Código de departamento del INEI. Es el dato por el que se filtra. */
  department: string | null;
  onDepartmentChange: (id: string | null) => void;
  /** Referencia libre: distrito, urbanización, lo que el anunciante quiera. */
  location: string;
  onLocationChange: (v: string) => void;
  lat: number | null;
  lng: number | null;
  onCoordsChange: (lat: number | null, lng: number | null) => void;
  required?: boolean;
}

/**
 * Ubicación del aviso: el departamento (obligatorio, es por lo que se filtra),
 * una referencia libre y, si el anunciante quiere, el punto exacto en el mapa.
 *
 * El departamento se eligió como único criterio de filtrado por ser exacto y
 * predecible: quien busca en Lima ve Lima, sin radios que entender ni avisos
 * escondidos por estar unos kilómetros más lejos. Las coordenadas se conservan
 * porque alimentan el mapa de la ficha y el del buscador, pero ya no deciden
 * qué avisos se ven.
 */
export function LocationPicker({
  department,
  onDepartmentChange,
  location,
  onLocationChange,
  lat,
  lng,
  onCoordsChange,
  required,
}: LocationPickerProps) {
  const pos: [number, number] | null = lat != null && lng != null ? [lat, lng] : null;
  // El mapa es un ajuste fino: se abre solo si el anunciante lo pide.
  const [mapaAbierto, setMapaAbierto] = useState(false);
  const [deduciendo, setDeduciendo] = useState(false);
  // Se muestra el desplegable solo cuando hace falta: si el punto del mapa ya
  // dijo el departamento, no tiene sentido preguntar lo que ya sabemos.
  const [pedirAMano, setPedirAMano] = useState(!department);

  /**
   * Marca el punto y, de paso, deduce el departamento preguntando a qué región
   * pertenece. Si no se puede (sin llave, sin red, punto raro), se pide a mano:
   * el departamento es obligatorio y un aviso sin él no aparece en ningún filtro.
   */
  const marcarPunto = async (la: number | null, ln: number | null) => {
    onCoordsChange(la, ln);
    if (la == null || ln == null) return;
    setDeduciendo(true);
    const region = await regionDeCoordenadas(la, ln);
    setDeduciendo(false);
    const dep = departamentoDeTexto(region);
    if (dep) {
      onDepartmentChange(dep.id);
      setPedirAMano(false);
    } else {
      setPedirAMano(true);
    }
  };

  // Buscar una dirección y llevar el pin hasta ahí, para no tener que
  // encontrarla a mano arrastrando el mapa.
  const [direccion, setDireccion] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<GeoResult[]>([]);

  const buscarDireccion = async () => {
    if (!direccion.trim() || buscando) return;
    setBuscando(true);
    setResultados([]);
    // Se añade el departamento a la consulta: "Av. Larco" existe en varias
    // ciudades del país.
    const contexto = department ? `, ${nombreDepartamento(department)}` : "";
    const rs = await buscarDirecciones(`${direccion}${contexto}`);
    setBuscando(false);
    if (rs.length === 0) {
      toast({
        title: "No encontramos esa dirección",
        description: "Prueba con la calle y el número, o marca el punto tocando el mapa.",
      });
      return;
    }
    if (rs.length === 1) void marcarPunto(rs[0].lat, rs[0].lng);
    else setResultados(rs);
  };

  const usarResultado = (r: GeoResult) => {
    void marcarPunto(r.lat, r.lng);
    setResultados([]);
  };

  return (
    <div className="space-y-3">
      {/* El desplegable solo aparece si el punto del mapa no ha dicho ya el
          departamento. En el caso normal —marcas el punto y se deduce— el
          anunciante no ve ningún selector. Se mantiene como camino alternativo
          porque el departamento es obligatorio: sin él el aviso no sale en
          ninguna búsqueda, y no puede depender de que un servicio externo
          responda. */}
      {pedirAMano && (
        <div>
          <Label htmlFor="departamento-aviso">Departamento {required && "*"}</Label>
          <Select
            value={department ?? ""}
            onValueChange={(v) => { onDepartmentChange(v || null); }}
          >
            <SelectTrigger id="departamento-aviso" className="mt-1.5">
              <SelectValue placeholder="Elige tu departamento" />
            </SelectTrigger>
            <SelectContent>
              {DEPARTAMENTOS.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Es lo que usan los compradores para filtrar. Lima y Callao van juntos.
          </p>
        </div>
      )}

      <div>
        <Label htmlFor="referencia-aviso">
          Distrito o referencia <span className="text-muted-foreground font-normal">(opcional)</span>
        </Label>
        <Input
          id="referencia-aviso"
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          placeholder="Ej: Miraflores, frente al parque"
          className="mt-1.5"
        />
      </div>

      {!mapaAbierto && (
        <button
          type="button"
          onClick={() => setMapaAbierto(true)}
          className="flex items-center gap-1 text-[11px] font-semibold text-secondary hover:underline"
        >
          <ChevronDown size={12} />
          {pos ? "Ver el punto en el mapa" : "Marcar el punto en el mapa (opcional)"}
        </button>
      )}

      {mapaAbierto && (
        <>
          <div className="flex gap-2">
            <Input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscarDireccion(); } }}
              placeholder="Calle y número (opcional)"
              className="flex-1"
              aria-label="Buscar una dirección"
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
            <MapContainer center={pos ?? PERU} zoom={pos ? 14 : 5} scrollWheelZoom className="w-full h-full z-0">
              <TileLayer attribution={MAP_TILES_ATTRIBUTION} url={MAP_TILES_URL} />
              <Recenter pos={pos} />
              <ClickCapture onPick={(la, ln) => void marcarPunto(la, ln)} />
              {pos && (
                <Marker
                  position={pos}
                  icon={pinIcon}
                  draggable
                  eventHandlers={{
                    dragend: (e) => {
                      const m = (e.target as L.Marker).getLatLng();
                      void marcarPunto(m.lat, m.lng);
                    },
                  }}
                />
              )}
            </MapContainer>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              Toca el mapa o arrastra el pin. El punto solo sirve para mostrar tu aviso en el mapa.
            </p>
            {pos && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto shrink-0 px-2 py-1 text-[11px]"
                onClick={() => onCoordsChange(null, null)}
              >
                Quitar
              </Button>
            )}
          </div>
        </>
      )}

      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        {deduciendo ? (
          <><Loader2 size={11} className="animate-spin shrink-0" /> Identificando el departamento…</>
        ) : department ? (
          <>
            <MapPin size={11} className="text-secondary shrink-0" />
            Tu aviso aparecerá en las búsquedas de <strong>{nombreDepartamento(department)}</strong>.
            {!pedirAMano && (
              <button
                type="button"
                onClick={() => setPedirAMano(true)}
                className="text-secondary hover:underline font-semibold"
              >
                Cambiar
              </button>
            )}
          </>
        ) : (
          <>
            <MapPin size={11} className="text-secondary shrink-0" />
            Marca tu punto en el mapa o elige el departamento para que tu aviso aparezca.
          </>
        )}
      </p>
    </div>
  );
}
