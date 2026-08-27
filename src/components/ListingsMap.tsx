import { useEffect, useMemo, useRef } from "react";
import type { MarkerClusterer } from "@googlemaps/markerclusterer";
import { imgUrl } from "@/lib/imageUrl";
import { formatCompactPrice } from "@/lib/pricing";
import { CuerpoDeAviso } from "@/components/CuerpoDeAviso";
import { urgentTimeLeft } from "@/lib/listings";
import { pinDePrecio } from "@/components/mapIcons";
import { crearAgrupador } from "@/components/mapCluster";
import { useMapaDeGoogle, textoDeEstadoDelMapa } from "@/lib/googleMaps";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { MapPin } from "lucide-react";
import type { Listing } from "@/data/mockData";

// Centro por defecto: Lima Metropolitana. Solo se ve un instante, hasta que el
// mapa se encuadra a los avisos de la búsqueda.
const LIMA_CENTER = { lat: -12.0464, lng: -77.0428 };

// Precio compacto para el pin del mapa (ver formatCompactPrice en pricing.ts).
const formatPrice = formatCompactPrice;

// Un aviso con coordenadas válidas (lat/lng no nulos).
type GeoListing = Listing & { lat: number; lng: number };

const hasCoords = (l: Listing): l is GeoListing =>
  typeof l.lat === "number" && typeof l.lng === "number" &&
  !Number.isNaN(l.lat) && !Number.isNaN(l.lng);

interface ListingsMapProps {
  listings: Listing[];
  active: string | null;
  onActive: (id: string) => void;
  /** Ruta a la que navega el pin (permite anteponer /auth si no hay sesión). */
  hrefFor: (id: string) => string;
}

/**
 * SIN VENTANITA SOBRE EL PIN, y esto merece explicación porque estuvo ahí.
 *
 * Al pulsar un pin se abría un InfoWindow de Google con la ficha del aviso.
 * Dio problemas desde el principio y ninguno se podía arreglar del todo desde
 * fuera, porque quien coloca y dimensiona esa ventana es Google:
 *
 *   - Se montaba con `createRoot` sobre un nodo suelto, fuera del árbol de
 *     React: sin Router, sin sesión, sin favoritos. Un `<Link>` allí abortaba
 *     el render y la ventana salía EN BLANCO en producción.
 *   - Google mide el contenido al abrir, y `render()` no pinta en el acto: se
 *     abría midiendo un nodo vacío.
 *   - Con el panel del mapa a 45vh —unos 360 px en un teléfono— sólo quedaban
 *     unos 260 para el contenido. Lo que no cabía se llenaba de barras de
 *     scroll, y la ventana se subía para aprovechar el hueco.
 *   - Su auto-pan competía con el centrado del pin, y la ficha acababa
 *     apareciendo donde el pin ESTABA antes de moverse.
 *
 * Se intentó arreglar tres veces. Ahora el pin solo AVISA de cuál se eligió, y
 * la tarjeta se enseña en la tira de abajo, que es React normal dentro del
 * árbol y no depende de nada de lo anterior. Es lo que hacen las apps de mapas
 * en el móvil.
 */

export function ListingsMap({ listings, active, onActive, hrefFor }: ListingsMapProps) {
  // Este componente SÍ está dentro del Router; la ficha del pin no. Se le pasa
  // la navegación en una prop porque allí no hay contexto que valga.
  const navigate = useNavigate();
  // La ficha del pin no puede leer la sesión: se monta fuera del árbol. Este
  // componente sí está dentro, así que se la pasa hecha. Sin esto, los precios
  // que el buscador oculta a quien no tiene cuenta se verían pulsando pines.
  const session = useSession();
  const conSesion = !!session?.supabase;
  const points = useMemo(() => listings.filter(hasCoords), [listings]);
  const missing = listings.length - points.length;

  const { contenedor, mapa, libs, estado } = useMapaDeGoogle({
    center: LIMA_CENTER,
    zoom: 12,
    // "greedy": la rueda del ratón y un dedo mueven el mapa sin pedir permiso.
    // Este mapa ocupa su propio panel, no compite con el scroll de la página.
    gestureHandling: "greedy",
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false,
  });

  // Los marcadores vivos, por id de aviso: hacen falta para poder repintar el
  // que está activo sin reconstruirlos todos.
  const marcadores = useRef(new Map<string, google.maps.marker.AdvancedMarkerElement>());
  const agrupador = useRef<MarkerClusterer | null>(null);
  // El primer encuadre no debe pisarse: al llegar los avisos se encuadra a
  // todos, y la selección automática que viene detrás no debe centrar el mapa
  // en uno solo.
  const yaEncuadrado = useRef(false);

  // ---- Pines: se reconstruyen cuando cambia la lista de avisos ----
  useEffect(() => {
    if (!mapa || !libs) return;

    const creados = points.map((l) => {
      const m = new libs.marker.AdvancedMarkerElement({
        position: { lat: l.lat, lng: l.lng },
        content: pinDePrecio(formatPrice(l.price, l.currency), false),
      });
      // EFFE-093: seleccionar SOLO al pulsar. Antes el `mouseover` también
      // activaba el pin, así que mover el ratón por el mapa iba seleccionando y
      // haciendo pan a cada aviso que rozaba — molesto.
      m.addListener("gmp-click", () => {
        // El pin solo dice CUÁL se eligió. De enseñar el aviso se encarga la
        // tira de tarjetas de abajo, que se desplaza hasta él.
        onActive(l.id);
      });
      return m;
    });

    marcadores.current = new Map(points.map((l, i) => [l.id, creados[i]]));
    agrupador.current = crearAgrupador(mapa, libs, creados);

    // Encuadre panorámico a todos los avisos con ubicación.
    if (points.length > 0) {
      const caja = new google.maps.LatLngBounds();
      points.forEach((p) => caja.extend({ lat: p.lat, lng: p.lng }));
      mapa.fitBounds(caja, 48);
      // Con un solo aviso `fitBounds` se acerca hasta el máximo y se ve el
      // tejado: se limita para que quede a escala de barrio.
      const corregir = google.maps.event.addListenerOnce(mapa, "idle", () => {
        if ((mapa.getZoom() ?? 0) > 15) mapa.setZoom(15);
      });
      yaEncuadrado.current = false;
      return () => {
        google.maps.event.removeListener(corregir);
        agrupador.current?.clearMarkers();
        agrupador.current = null;
        creados.forEach((m) => { m.map = null; });
      };
    }

    return () => {
      agrupador.current?.clearMarkers();
      agrupador.current = null;
      creados.forEach((m) => { m.map = null; });
    };
    // `onActive` fuera a propósito: cambia de identidad en cada render del padre
    // y reconstruiría todos los pines sin motivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa, libs, points]);

  // ---- El aviso activo: se repinta y el mapa se acerca a él ----
  useEffect(() => {
    if (!mapa) return;
    for (const [id, m] of marcadores.current) {
      const l = points.find((p) => p.id === id);
      if (l) m.content = pinDePrecio(formatPrice(l.price, l.currency), id === active);
    }
    if (!active) return;
    // Se omite la primera selección para no pisar el encuadre panorámico.
    if (!yaEncuadrado.current) { yaEncuadrado.current = true; return; }
    // Ya se panea siempre: sin ventanita encima, no hay nada con lo que
    // competir. Centrar el pin elegido es justo lo que se espera.
    const p = points.find((x) => x.id === active);
    if (p) mapa.panTo({ lat: p.lat, lng: p.lng });
  }, [active, mapa, points]);

  const aviso = textoDeEstadoDelMapa(estado);

  return (
    <div className="absolute inset-0">
      <div ref={contenedor} className="w-full h-full" />

      {aviso && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <p className="text-sm text-muted-foreground">{aviso}</p>
        </div>
      )}

      {!aviso && points.length === 0 && (
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
          {missing === 1
            ? "1 aviso sin ubicación no se muestra"
            : `${missing} avisos sin ubicación no se muestran`}
        </div>
      )}
    </div>
  );
}
