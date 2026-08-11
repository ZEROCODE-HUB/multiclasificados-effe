import { useEffect, useMemo, useRef } from "react";
import type { MarkerClusterer } from "@googlemaps/markerclusterer";
import { pinDePrecio } from "@/components/mapIcons";
import { crearAgrupador } from "@/components/mapCluster";
import { PERU_BOUNDS } from "@/lib/peru";
import { formatCompactPrice } from "@/lib/pricing";
import { useMapaDeGoogle, textoDeEstadoDelMapa, type LibreriasDelMapa } from "@/lib/googleMaps";
import type { Listing } from "@/data/mockData";

/**
 * El mapa del Perú de la portada, con los avisos que ya tienen ubicación.
 *
 * Antes aquí había una foto de archivo con cuatro precios inventados encima: no
 * era el país ni eran avisos. Ahora es el mapa de verdad y los pines son los
 * avisos publicados, así que lo que se enseña en la portada es lo que el
 * usuario se va a encontrar al entrar al buscador.
 *
 * Es un adorno, no una herramienta: el mapa no se puede arrastrar ni acercar
 * (para eso está el botón "Probar búsqueda", que lleva al buscador con el mapa
 * completo) y así tampoco se traga el scroll de la página. Los avisos cercanos
 * se agrupan porque a la escala de todo el país los de Lima caerían unos encima
 * de otros.
 *
 * Se carga aparte (import dinámico desde la portada) porque el SDK de mapas no
 * es ligero y esta sección ni siquiera se ve en móvil.
 */

type GeoListing = Listing & { lat: number; lng: number };

const conCoordenadas = (l: Listing): l is GeoListing =>
  typeof l.lat === "number" && typeof l.lng === "number" &&
  !Number.isNaN(l.lat) && !Number.isNaN(l.lng);

export default function PeruMapTeaser({ listings }: { listings: Listing[] }) {
  const puntos = useMemo(() => listings.filter(conCoordenadas), [listings]);

  const { contenedor, mapa, libs, estado } = useMapaDeGoogle(
    {
      // Encuadre inicial cualquiera: el efecto de abajo lo ajusta al país en
      // cuanto el mapa existe. `fitBounds` es lo que da el encuadre exacto, sin
      // que el Perú quede diminuto en mitad del Pacífico.
      center: { lat: -9.19, lng: -75.015 },
      zoom: 5,
      // Mapa inerte: ni arrastre, ni zoom, ni teclado. Es una ilustración.
      gestureHandling: "none",
      disableDefaultUI: true,
      keyboardShortcuts: false,
      clickableIcons: false,
    },
    (m) => {
      const [[sur, oeste], [norte, este]] = PERU_BOUNDS;
      // El margen de arriba y abajo es mayor: un aviso en Tumbes o en Tacna cae
      // justo en el borde y su pin se saldría del recuadro.
      m.fitBounds({ south: sur, west: oeste, north: norte, east: este },
        { top: 30, bottom: 30, left: 16, right: 16 });
    },
  );

  const agrupador = useRef<MarkerClusterer | null>(null);

  useEffect(() => {
    if (!mapa || !libs) return;
    const marcadores = puntos.map((l) =>
      new (libs as LibreriasDelMapa).marker.AdvancedMarkerElement({
        position: { lat: l.lat, lng: l.lng },
        content: pinDePrecio(formatCompactPrice(l.price, l.currency), false),
        // Sin zoom no hay nada que abrir ni que seleccionar: los pines no
        // responden al toque, igual que el resto de la ilustración.
        gmpClickable: false,
      }),
    );
    agrupador.current = crearAgrupador(mapa, libs, marcadores, { interactivo: false });
    return () => {
      agrupador.current?.clearMarkers();
      agrupador.current = null;
      marcadores.forEach((m) => { m.map = null; });
    };
  }, [mapa, libs, puntos]);

  const aviso = textoDeEstadoDelMapa(estado);

  return (
    <div className="relative w-full h-full">
      <div ref={contenedor} className="w-full h-full" />
      {aviso && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <p className="text-xs text-muted-foreground">{aviso}</p>
        </div>
      )}
    </div>
  );
}
