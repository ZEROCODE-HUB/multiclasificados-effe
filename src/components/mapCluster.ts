// Agrupar avisos cercanos en un solo pin, compartido por el buscador y la
// portada. Sin esto, a la escala de todo el país los avisos de Lima caen unos
// encima de otros y no se lee nada.

import { MarkerClusterer, SuperClusterAlgorithm, type Renderer } from "@googlemaps/markerclusterer";
import { pinDeGrupo } from "@/components/mapIcons";
import type { LibreriasDelMapa } from "@/lib/googleMaps";

export interface OpcionesDeAgrupacion {
  /** Distancia en píxeles dentro de la cual dos avisos se agrupan. */
  radio?: number;
  /**
   * Zoom a partir del cual ya no se agrupa nada.
   *
   * Importa más de lo que parece (MOB-09): con el mapa muy acercado el usuario
   * quiere ver los avisos uno a uno, y si se siguiera agrupando, cada gesto de
   * zoom volvería a juntarlos justo cuando acababa de separarlos.
   */
  zoomMaximo?: number;
  /** Si es false, pulsar un grupo no hace nada (para el mapa inerte de la portada). */
  interactivo?: boolean;
}

/**
 * Monta el agrupador sobre un mapa ya creado.
 *
 * Devuelve el agrupador para poder retirarlo (`clearMarkers`) cuando cambian los
 * avisos o se desmonta el componente; si no se retira, los pines viejos se
 * quedan pegados al mapa.
 */
export function crearAgrupador(
  mapa: google.maps.Map,
  libs: LibreriasDelMapa,
  marcadores: google.maps.marker.AdvancedMarkerElement[],
  { radio = 45, zoomMaximo = 16, interactivo = true }: OpcionesDeAgrupacion = {},
): MarkerClusterer {
  const renderer: Renderer = {
    render: ({ count, position }) =>
      new libs.marker.AdvancedMarkerElement({
        position,
        content: pinDeGrupo(count),
        // Por encima de los pines sueltos: un grupo tapado por un precio
        // suelto se ve como un pin partido por la mitad.
        zIndex: 1000 + count,
      }),
  };

  const agrupador = new MarkerClusterer({
    map: mapa,
    markers: marcadores,
    algorithm: new SuperClusterAlgorithm({ radius: radio, maxZoom: zoomMaximo }),
    renderer,
    onClusterClick: interactivo
      ? (_e, cluster, m) => m.fitBounds(cluster.bounds!, 64)
      : () => {},
  });

  // ---------------------------------------------------------------------
  // EL SALTO DE LOS PINES AL SOLTAR EL MAPA
  //
  // El agrupador se re-dibuja en CADA `idle` del mapa, es decir cada vez que
  // el mapa se queda quieto — también al terminar un simple arrastre. Y
  // re-dibujar no es repintar: en `renderClusters` la librería vuelve a
  // asignarle el mapa a TODOS los marcadores (`setMap(marker, map)`), lo que
  // los reinserta. Un marcador reinsertado se pinta un fotograma en su
  // posición base, sin la transformación que lo coloca, y al siguiente ya
  // aparece en su sitio: exactamente el "vuelven a su posición anterior y
  // luego se ponen en la correcta" que se veía con todos los pines a la vez.
  //
  // La propia librería sabe que esto parpadea —tiene un `requestAnimationFrame`
  // comentado como "to avoid flickering"— y hay una petición abierta para poder
  // desactivar ese re-dibujo automático:
  // https://github.com/googlemaps/js-markerclusterer/issues/276
  //
  // Mientras tanto se le quita su escucha de `idle` y se pone una que solo
  // re-dibuja CUANDO CAMBIA EL ZOOM. Es lo único que necesita: el algoritmo
  // (SuperCluster) agrupa por geografía, no por lo que se ve en pantalla, así
  // que desplazarse no cambia ningún grupo. Arrastrar deja de repintar nada.
  const interno = agrupador as unknown as { idleListener: google.maps.MapsEventListener | null };
  if (interno.idleListener) {
    google.maps.event.removeListener(interno.idleListener);
    interno.idleListener = null;
  }
  let zoomPrevio = mapa.getZoom();
  interno.idleListener = mapa.addListener("idle", () => {
    const z = mapa.getZoom();
    if (z === zoomPrevio) return;
    zoomPrevio = z;
    agrupador.render();
  });

  return agrupador;
}
