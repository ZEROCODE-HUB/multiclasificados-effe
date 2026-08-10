// De dónde salen las imágenes del mapa (los "tiles"), en un solo sitio para los
// tres mapas de la app: la ficha del aviso, el buscador y el selector al publicar.
//
// ⚠️ Por defecto se usan los servidores comunitarios de OpenStreetMap, que están
// mantenidos por donativos y cuya política de uso NO permite alimentar una app
// que se distribuye. Funcionan mientras el tráfico es pequeño, pero pueden
// bloquear el dominio sin previo aviso y entonces los tres mapas se quedan
// grises a la vez.
//
// Para producción hay que poner un proveedor propio en el `.env`:
//
//   VITE_MAP_TILES_URL="https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=TU_TOKEN"
//   VITE_MAP_TILES_ATTRIBUTION="&copy; Mapbox &copy; OpenStreetMap"
//
// (MapTiler y compañía usan el mismo formato de URL con {z}/{x}/{y}.)
//
// Google Maps NO encaja aquí: no publica sus imágenes como URL de tiles para
// usar con Leaflet, hay que montar su propio visor de mapas. Su llave sí se usa
// para buscar direcciones — ver src/lib/geocode.ts.

// El `?.` no es adorno: fuera de Vite (el harness de las pruebas de layout
// compila con esbuild a secas) `import.meta.env` no existe, y sin la guarda el
// módulo reventaría al cargarse y el mapa ni se montaría.
const URL_POR_DEFECTO = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATRIBUCION_POR_DEFECTO = "&copy; OpenStreetMap";

export const MAP_TILES_URL =
  import.meta.env?.VITE_MAP_TILES_URL?.trim() || URL_POR_DEFECTO;

export const MAP_TILES_ATTRIBUTION =
  import.meta.env?.VITE_MAP_TILES_ATTRIBUTION?.trim() || ATRIBUCION_POR_DEFECTO;

/** True si se siguen usando los servidores comunitarios (uso no permitido en producción). */
export const usaTilesComunitarios = (): boolean => MAP_TILES_URL === URL_POR_DEFECTO;
