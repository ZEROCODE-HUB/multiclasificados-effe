import { useEffect, useMemo, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
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
 * La tarjetita que sale al pulsar un pin.
 *
 * OJO CON `<Link>`: esto NO se pinta dentro del árbol de la app. Se monta con
 * `createRoot` sobre un nodo suelto que crea Google para el InfoWindow, y esa
 * raíz no hereda ningún contexto — tampoco el del Router. Un `<Link>` ahí lanza
 * "useHref() may be used only in the context of a <Router>", React aborta el
 * render y el nodo se queda VACÍO: la ventanita salía en blanco, con la X y
 * nada más. Así estaba en producción.
 *
 * Por eso es un `<a>` normal con la navegación inyectada desde fuera: el
 * `href` de verdad conserva "abrir en pestaña nueva" y el clic izquierdo se
 * queda en la aplicación, sin recargarla.
 *
 * LO VISUAL LO PONE `CuerpoDeAviso`, el mismo que usa la tarjeta del buscador.
 * Antes esta ficha se pintaba a mano y había ido divergiendo: sin marco, con la
 * foto redondeada —el resto de la app es recta—, sin destacado, sin urgente,
 * sin confidencial, sin sello y sin el aviso de video. Y con el precio del PIN,
 * que va abreviado por falta de sitio: enseñaba "S/ 250K" donde la tarjeta
 * decía "S/ 250,000.00". Aquí hay 208 px de ancho y cabe entero.
 */
export function FichaDelPin(
  { l, href, ir, mostrarPrecio }: {
    l: GeoListing;
    href: string;
    ir: (href: string) => void;
    /** Sin sesión el buscador oculta los precios; el mapa tiene que hacer lo
     *  mismo o sería la puerta de atrás para verlos sin cuenta. */
    mostrarPrecio: boolean;
  },
) {
  return (
    <CuerpoDeAviso
      l={l}
      anchoImagen={200}
      sizes="96px"
      urgente={l.urgent ? urgentTimeLeft(l.expiresAt ?? null, Date.now()) : null}
      mostrarPrecio={mostrarPrecio}
      /* APAISADA, y no por gusto: en vertical la ficha medía unos 300 px de
         alto y el panel del mapa mide 45vh —unos 360 en un teléfono—, de los
         que Google deja para el contenido apenas 260. No cabía: le ponía barra
         de scroll y la subía para aprovechar el hueco, así que salía recortada
         y despegada del pin. Apaisada baja a unos 110 y cabe de sobra. */
      orientacion="horizontal"
      className="w-[17rem] max-w-[80vw]"
      cobertura={
        <a
          href={href}
          aria-label={l.title}
          className="absolute inset-0 z-[1]"
          onClick={(e) => {
            // Con Ctrl/Cmd o el botón central, que el navegador haga lo suyo.
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            ir(href);
          }}
        />
      }
    />
  );
}

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
  // La ficha del pin se pinta con React dentro de un InfoWindow, que es DOM
  // suelto de Google: hay que guardar la raíz para desmontarla y no dejar
  // árboles de React colgando cada vez que se abre un pin.
  const ficha = useRef<{ ventana: google.maps.InfoWindow; raiz: Root; nodo: HTMLElement } | null>(null);
  // El primer encuadre no debe pisarse: al llegar los avisos se encuadra a
  // todos, y la selección automática que viene detrás no debe centrar el mapa
  // en uno solo.
  const yaEncuadrado = useRef(false);
  // ¿La selección viene de pulsar el pin, o de la lista lateral? Solo la
  // segunda debe centrar el mapa; la primera abre ficha, y esa ya se coloca.
  const desdeElPin = useRef(false);
  // El frame pendiente para abrir la ficha, que se cancela si llega otro clic.
  const frame = useRef<number | null>(null);

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
        // Se avisa de que la selección viene del PIN. El efecto de más abajo
        // hace `panTo` al punto para acercarse al aviso elegido desde la lista
        // lateral; si también lo hiciera aquí, competiría con el auto-pan que
        // el propio InfoWindow hace para caber, y la ficha acababa descolgada
        // del pin.
        desdeElPin.current = true;
        onActive(l.id);
        abrirFicha(l, m);
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
    // Si se pulsó el pin, NO se panea: la ficha que se abre encima hace su
    // propio ajuste para caber, y dos paneos a la vez dejaban el aviso
    // separado del pin en lugar de pegado a él. Desde la lista lateral sí se
    // panea, que es el único modo de saber a qué punto corresponde.
    if (desdeElPin.current) { desdeElPin.current = false; return; }
    const p = points.find((x) => x.id === active);
    if (p) mapa.panTo({ lat: p.lat, lng: p.lng });
  }, [active, mapa, points]);

  /** Abre (o reutiliza) la tarjetita del aviso sobre su pin. */
  function abrirFicha(l: GeoListing, marcador: google.maps.marker.AdvancedMarkerElement) {
    if (!mapa) return;
    if (!ficha.current) {
      const nodo = document.createElement("div");
      ficha.current = {
        ventana: new google.maps.InfoWindow({ content: nodo }),
        raiz: createRoot(nodo),
        nodo,
      };
    }
    const f = ficha.current;
    f.raiz.render(
      <FichaDelPin l={l} href={hrefFor(l.id)} ir={(h) => navigate(h)} mostrarPrecio={conSesion} />,
    );

    // SE ABRE UN FRAME DESPUÉS, Y ESE ORDEN ES EL ARREGLO.
    //
    // `render()` de React 18 no pinta en el acto, y Google mide el contenido
    // JUSTO al abrir. Abriendo primero, medía un nodo VACÍO: calculaba que la
    // ventana no ocupaba nada, paneaba el mapa para ese tamaño, y cuando la
    // ficha aparecía —unos 280 px de alto— ya no cabía donde se había hecho
    // sitio. De ahí que el aviso saliera separado del pin en vez de encima.
    //
    // Pintar primero y abrir después le da a Google las medidas de verdad, y
    // su auto-pan deja la ficha pegada a su pin.
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      // Con dos clics seguidos el frame anterior se cancela arriba, así que
      // aquí solo llega el último: la ventana se abre sobre el pin que de
      // verdad se pulsó, no sobre el primero.
      if (ficha.current !== f) return;
      f.ventana.setContent(f.nodo);
      f.ventana.open({ map: mapa, anchor: marcador });
    });
  }

  // Al desmontar, la raíz de React de la ficha se desmonta aparte: vive en un
  // nodo que Google creó y que React no limpia solo.
  useEffect(() => () => {
    // El frame pendiente se cancela: si llegara a correr tras desmontar,
    // intentaría abrir una ventana sobre un mapa que ya no está.
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    const f = ficha.current;
    ficha.current = null;
    if (f) { f.ventana.close(); setTimeout(() => f.raiz.unmount(), 0); }
  }, []);

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
