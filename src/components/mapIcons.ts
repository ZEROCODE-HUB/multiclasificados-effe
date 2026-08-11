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
export function pinDePrecio(label: string, activo: boolean): HTMLElement {
  const cls = activo
    ? "bg-primary text-primary-foreground scale-110 ring-4 ring-primary/20"
    : "bg-secondary text-secondary-foreground ring-2 ring-secondary/20";
  return div(
    `inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold shadow-lg whitespace-nowrap transition-all ${cls}`,
    label,
  );
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
