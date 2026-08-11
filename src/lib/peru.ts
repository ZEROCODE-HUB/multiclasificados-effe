// El país, en coordenadas.
//
// Vive aparte del mapa que lo dibuja para poder comprobarlo con una prueba sin
// arrancar Leaflet: un encuadre mal puesto no rompe nada, simplemente enseña
// medio Perú o media Bolivia, y eso no se ve en ninguna otra prueba.

/**
 * Recuadro que abarca todo el territorio peruano, con un margen pequeño para
 * que la costa y la frontera no queden pegadas al borde del mapa.
 *
 * Extremos reales del país:
 *   · Norte  → río Putumayo (Loreto),      ~ -0.04
 *   · Sur    → Tacna, frontera con Chile,  ~ -18.35
 *   · Oeste  → Punta Balcones (Piura),     ~ -81.33
 *   · Este   → río Heath (Madre de Dios),  ~ -68.65
 *
 * Formato [[sur, oeste], [norte, este]], que es el que espera Leaflet.
 */
export const PERU_BOUNDS: [[number, number], [number, number]] = [
  [-18.6, -81.6],
  [0.2, -68.4],
];

/** True si el punto cae dentro del recuadro del país. */
export function dentroDelPeru(lat: number, lng: number): boolean {
  const [[sur, oeste], [norte, este]] = PERU_BOUNDS;
  return lat >= sur && lat <= norte && lng >= oeste && lng <= este;
}
