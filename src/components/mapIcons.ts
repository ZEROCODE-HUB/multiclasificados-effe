// Los pines de los mapas, en un solo sitio: el buscador (ListingsMap), la
// portada (PeruMapTeaser) y la ficha (ListingLocationMap) enseñan lo mismo, así
// que si cambia el diseño de un pin tiene que cambiar en los tres.
//
// Antes eran `divIcon` de Leaflet, que recibían una cadena de HTML. Los
// marcadores de Google (AdvancedMarkerElement) reciben un ELEMENTO del DOM, así
// que aquí se construyen elementos. El diseño no cambia: son las mismas clases.
//
// Se usa `innerHTML` solo con texto que fabrica la propia app (un precio ya
// formateado, un número). Nada de esto viene del usuario.

/** Crea un div con esas clases y ese contenido. */
function div(clases: string, html: string): HTMLElement {
  const el = document.createElement("div");
  el.className = clases;
  el.innerHTML = html;
  return el;
}

/**
 * Burbuja de precio del buscador y de la portada.
 *
 * El marcador de Google ancla su contenido por el centro de abajo, así que la
 * burbuja queda justo encima del punto sin necesidad de desplazarla a mano
 * (Leaflet obligaba a un `translate(-50%,-100%)`).
 */
// `transition-colors` y NO `transition-all`. La diferencia es el fallo que se
// persiguió durante cinco intentos.
//
// Google coloca cada marcador con un `transform`. Mientras se arrastra el mapa
// mueve el CONTENEDOR de los pines, así que el transform de cada pin no cambia
// y todos acompañan al mapa sin problema. Pero AL SOLTAR recoloca cada pin con
// su propio transform… y `transition-all` anima también esa propiedad: el pin
// se veía viajando desde donde estaba hasta donde debía estar. De ahí el
// "vuelve a su posición anterior y luego se pone en la correcta", que pasaba
// con todos los pines a la vez y no aparecía en ningún registro del mapa
// porque no lo movía nadie: era la transición dibujándolo.
//
// `transition-colors` deja el resaltado suave y no toca la posición.
const PIN_BASE =
  "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold shadow-lg whitespace-nowrap transition-colors duration-200";
const PIN_ACTIVO = "bg-primary text-primary-foreground scale-110 ring-4 ring-primary/20";
const PIN_NORMAL = "bg-secondary text-secondary-foreground ring-2 ring-secondary/20";

export function pinDePrecio(label: string, activo: boolean): HTMLElement {
  return div(`${PIN_BASE} ${activo ? PIN_ACTIVO : PIN_NORMAL}`, label);
}

/**
 * Enciende o apaga un pin YA COLOCADO, sin fabricar otro.
 *
 * AQUÍ ESTABA EL SALTO DE LOS PINES, y costó cuatro intentos encontrarlo porque
 * no estaba donde parecía.
 *
 * Para resaltar el aviso elegido se reasignaba `content` del marcador, que es
 * lo natural… salvo que en un `AdvancedMarkerElement` eso hace que Google
 * DESTRUYA el nodo y monte otro. El nodo nuevo se pinta un fotograma en su
 * posición base, sin la transformación que lo coloca sobre el mapa, y al
 * siguiente ya aparece en su sitio. Visto a velocidad normal: el pin da un
 * salto atrás y vuelve a colocarse.
 *
 * Y se hacía con TODOS los marcadores en cada cambio de selección, así que
 * saltaban todos a la vez.
 *
 * Cambiando solo las clases del elemento que ya está no se recrea nada, y la
 * transición de color de arriba hace que el resaltado se vea suave.
 */
export function marcarPinActivo(el: HTMLElement, activo: boolean): void {
  const quiere = `${PIN_BASE} ${activo ? PIN_ACTIVO : PIN_NORMAL}`;
  // Solo si de verdad cambia: escribir la misma cadena fuerza un recálculo de
  // estilos por marcador, y aquí se recorren todos.
  if (el.className !== quiere) el.className = quiere;
}

/**
 * Burbuja de precio con puntita, para la ficha del aviso: ahí hay un solo pin y
 * conviene que se vea exactamente a qué punto señala.
 */
export function pinAnclado(label: string): HTMLElement {
  return div(
    "flex flex-col items-center",
    `<span class="inline-flex items-center whitespace-nowrap rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-secondary-foreground shadow-lg ring-2 ring-secondary/20">${label}</span>` +
      `<span class="-mt-0.5 h-2 w-2 rotate-45 bg-secondary"></span>`,
  );
}

/**
 * Grupo de avisos cercanos. El tamaño crece con la cantidad para que se lea la
 * densidad de un vistazo.
 */
export function pinDeGrupo(cantidad: number): HTMLElement {
  const size = cantidad < 10 ? 40 : cantidad < 50 ? 48 : 56;
  const el = div(
    "flex items-center justify-center rounded-full bg-secondary text-secondary-foreground font-extrabold shadow-lg ring-4 ring-secondary/25",
    String(cantidad),
  );
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.fontSize = `${cantidad < 100 ? 14 : 12}px`;
  return el;
}

/** El pin que se arrastra al publicar: una chincheta, no un precio. */
export function pinDeUbicacion(): HTMLElement {
  return div(
    "text-primary drop-shadow",
    `<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg>`,
  );
}

// =====================================================================
// PINES COMO IMAGEN, para el mapa del buscador.
//
// POR QUE EXISTEN, ademas de los de arriba.
//
// Un `AdvancedMarkerElement` lleva dentro un nodo del DOM por marcador, y
// Google lo recoloca al terminar cada gesto sobre el mapa. Ese reposicionado es
// lo que se veia saltar: al soltar el mapa, los pines aparecian un instante en
// su sitio anterior y luego en el correcto. Esta documentado y se descartaron
// una por una todas las causas de este lado — el agrupador (se monto un
// interruptor temporal en la URL para comparar con y sin agrupar en produccion,
// y quedo descartado), el codigo que mueve el mapa (dos trazas en produccion sin
// una sola orden nuestra), la transicion CSS del pin y el renderizado vectorial
// (ya estaba en raster).
//
// Con `google.maps.Marker` el pin es una IMAGEN que Google dibuja en su propia
// capa: no hay nodo que recolocar, asi que no hay nada que pueda saltar. La
// clase esta marcada como obsoleta pero sigue soportada, y aqui compensa: un
// mapa que no tiembla vale mas que evitar un aviso de deprecacion.
//
// Se pierde poder animar el color al resaltar; el cambio es instantaneo.

const FONDO_NORMAL = "#bd4e05";  // --secondary
const FONDO_ACTIVO = "#162950";  // --primary
const FONDO_GRUPO = "#bd4e05";

/** Convierte un SVG en algo que Google pueda pintar como icono. */
function comoIcono(svg: string): string {
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

/** Escapa lo que va dentro del SVG. El precio lo fabrica la app, pero el
 *  formato de moneda trae simbolos y mas vale no confiar. */
function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Burbuja de precio del buscador, como imagen.
 *
 * El ancho se calcula a ojo por la longitud del texto: un SVG no sabe medir su
 * propio contenido, y quedarse corto recortaria el precio.
 */
export function iconoDePrecio(label: string, activo: boolean): google.maps.Icon {
  const ancho = Math.max(40, Math.round(label.length * 6.6) + 18);
  const alto = 22;
  const fondo = activo ? FONDO_ACTIVO : FONDO_NORMAL;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">` +
    `<rect x="0" y="0" rx="11" ry="11" width="${ancho}" height="${alto}" fill="${fondo}"/>` +
    `<text x="${ancho / 2}" y="${alto / 2}" dy="0.36em" text-anchor="middle" ` +
    `font-family="Montserrat, system-ui, sans-serif" font-size="11" font-weight="700" fill="#ffffff">` +
    `${escapar(label)}</text></svg>`;
  return {
    url: comoIcono(svg),
    scaledSize: new google.maps.Size(ancho, alto),
    // Anclado por el centro de abajo, igual que el pin de HTML: asi la burbuja
    // queda justo encima del punto.
    anchor: new google.maps.Point(ancho / 2, alto),
  };
}

/** Grupo de avisos cercanos, como imagen. El tamano crece con la cantidad. */
export function iconoDeGrupo(cantidad: number): google.maps.Icon {
  const size = cantidad < 10 ? 40 : cantidad < 50 ? 48 : 56;
  const fuente = cantidad < 100 ? 14 : 12;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    // El anillo exterior translucido es el `ring-4` del pin de HTML.
    `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${FONDO_GRUPO}" opacity="0.25"/>` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 4}" fill="${FONDO_GRUPO}"/>` +
    `<text x="${size / 2}" y="${size / 2}" dy="0.36em" text-anchor="middle" ` +
    `font-family="Montserrat, system-ui, sans-serif" font-size="${fuente}" font-weight="800" fill="#ffffff">` +
    `${cantidad}</text></svg>`;
  return {
    url: comoIcono(svg),
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}
