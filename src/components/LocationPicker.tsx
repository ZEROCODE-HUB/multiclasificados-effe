import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Search, Loader2, Check } from "lucide-react";
import { DEPARTAMENTOS, departamentoDeTexto, nombreDepartamento } from "@/lib/departamentos";
import { PAISES, PAIS_POR_DEFECTO, esPeru, nombrePais } from "@/lib/paises";
import {
  sugerirDirecciones,
  detalleDeLugar,
  nuevaSesionDeBusqueda,
  ubicacionDeCoordenadas,
  type Sugerencia,
} from "@/lib/geocode";
import { pinDeUbicacion } from "@/components/mapIcons";
import { useMapaDeGoogle, textoDeEstadoDelMapa } from "@/lib/googleMaps";

// Centro aproximado del país, para abrir el mapa en algún sitio razonable
// mientras no haya punto marcado.
const PERU = { lat: -9.19, lng: -75.015 };
const ZOOM_PUNTO = 16;

interface LocationPickerProps {
  /** Código de departamento del INEI. Es el dato por el que se filtra. */
  department: string | null;
  onDepartmentChange: (id: string | null) => void;
  /**
   * País del aviso (ISO alpha-2). Por defecto Perú. Fuera del Perú no hay
   * departamentos del INEI que valgan: basta el país y la referencia escrita.
   */
  country?: string;
  onCountryChange?: (code: string) => void;
  /** Referencia legible: distrito y provincia, o lo que escriba el anunciante. */
  location: string;
  onLocationChange: (v: string) => void;
  lat: number | null;
  lng: number | null;
  onCoordsChange: (lat: number | null, lng: number | null) => void;
  required?: boolean;
}

/**
 * Ubicación del aviso: se marca un punto en el mapa y ya está.
 *
 * El departamento y el distrito NO se preguntan: se deducen del punto. Antes
 * este componente pedía el departamento en un desplegable, el distrito en una
 * caja de texto y dejaba el mapa como un extra opcional — o sea, tres cosas que
 * rellenar para decir una sola, y encima la única exacta (el punto) era la
 * opcional. Ahora es al revés: el mapa manda y lo demás se rellena solo y se
 * enseña como una frase, no como un formulario.
 *
 * Los campos manuales siguen existiendo, escondidos, por dos motivos: si el
 * servicio falla, el departamento —que es obligatorio y decide si el aviso
 * aparece o no en las búsquedas— no puede quedarse sin poner; y quien quiera
 * afinar la referencia ("frente al parque") puede hacerlo.
 */
export function LocationPicker({
  department,
  onDepartmentChange,
  country = PAIS_POR_DEFECTO,
  onCountryChange,
  location,
  onLocationChange,
  lat,
  lng,
  onCoordsChange,
  required,
}: LocationPickerProps) {
  const pos = lat != null && lng != null ? { lat, lng } : null;
  const enPeru = esPeru(country);
  const [deduciendo, setDeduciendo] = useState(false);
  // Se muestran los campos a mano solo si hacen falta: porque la deducción falló
  // o porque el anunciante ha pedido corregir algo.
  const [aMano, setAMano] = useState(false);
  // Para no soltar "no pudimos identificar la zona" antes de que toque un punto.
  const [falloDeduccion, setFalloDeduccion] = useState(false);

  /** Aplica lo deducido: departamento, referencia y si hay que pedir ayuda. */
  const aplicarZona = (region: string | null, referencia: string | null, paisDelPunto?: string | null) => {
    // Si el punto cae en otro país, se cambia el país del aviso y se deja de
    // hablar de departamentos: "La Libertad" también existe en Venezuela, y
    // traducirlo a un código del INEI archivaría el aviso en Trujillo.
    const paisPunto = (paisDelPunto ?? "").toUpperCase();
    if (paisPunto && paisPunto !== country.toUpperCase()) {
      onCountryChange?.(paisPunto);
    }
    const paisFinal = paisPunto || country;

    if (!esPeru(paisFinal)) {
      onDepartmentChange(null);
      setFalloDeduccion(false);
      setAMano(false);
      if (referencia) onLocationChange(referencia);
      return;
    }

    const dep = departamentoDeTexto(region);
    if (dep) {
      onDepartmentChange(dep.id);
      setFalloDeduccion(false);
      setAMano(false);
    } else {
      setFalloDeduccion(true);
      setAMano(true);
    }
    // La referencia se pisa solo si hay algo mejor que poner: si el anunciante
    // ya escribió la suya y Google no devuelve nada, se respeta la suya.
    if (referencia) onLocationChange(referencia);
  };

  /**
   * Marca el punto y rellena con él el departamento y la referencia.
   *
   * Si Google no contesta, se abren los campos a mano: es preferible pedirlos
   * que publicar un aviso sin departamento, porque ese no aparece en ninguna
   * búsqueda por ubicación.
   */
  const marcarPunto = async (la: number, ln: number) => {
    onCoordsChange(la, ln);
    setDeduciendo(true);
    const { region, referencia, pais } = await ubicacionDeCoordenadas(la, ln);
    setDeduciendo(false);
    aplicarZona(region, referencia, pais);
  };

  // ─── El mapa ────────────────────────────────────────────────────────────────
  const { contenedor, mapa, libs, estado } = useMapaDeGoogle({
    center: pos ?? PERU,
    zoom: pos ? ZOOM_PUNTO : 5,
    gestureHandling: "greedy",
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false,
  });

  // `marcarPunto` se recrea en cada render (depende de las props); el listener
  // del mapa se registra una vez, así que llama a través de esta referencia.
  const marcar = useRef(marcarPunto);
  marcar.current = marcarPunto;

  useEffect(() => {
    if (!mapa) return;
    const l = mapa.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) void marcar.current(e.latLng.lat(), e.latLng.lng());
    });
    return () => l.remove();
  }, [mapa]);

  // El pin: se crea al haber punto, y se mueve (no se recrea) cuando cambia.
  const pin = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  useEffect(() => {
    if (!mapa || !libs) return;
    if (!pos) {
      if (pin.current) { pin.current.map = null; pin.current = null; }
      return;
    }
    if (!pin.current) {
      pin.current = new libs.marker.AdvancedMarkerElement({
        map: mapa,
        position: pos,
        content: pinDeUbicacion(),
        gmpDraggable: true,
        title: "Arrastra para ajustar el punto",
      });
      pin.current.addListener("dragend", (e: google.maps.MapMouseEvent) => {
        if (e.latLng) void marcar.current(e.latLng.lat(), e.latLng.lng());
      });
    } else {
      pin.current.position = pos;
    }
    // Se acompaña al punto sin alejar nunca: si el usuario ya estaba mirando de
    // cerca, mover el pin no debe devolverlo a la vista de país.
    mapa.panTo(pos);
    if ((mapa.getZoom() ?? 0) < 14) mapa.setZoom(ZOOM_PUNTO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa, libs, lat, lng]);

  // ─── Escribir la dirección y que se vaya sugiriendo sola ───────────────────
  //
  // Antes había un botón "Buscar" y la lista aparecía después de pulsarlo. Ahora
  // las sugerencias salen mientras se escribe, que es como funciona cualquier
  // buscador de direcciones y ahorra un paso.
  //
  // Todas las pulsaciones de una misma búsqueda comparten una SESIÓN de Places,
  // que se cierra al pedir el detalle del lugar elegido. Así una búsqueda entera
  // se factura como una, en vez de una vez por tecla.
  const [direccion, setDireccion] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [resaltada, setResaltada] = useState(-1);
  const sesion = useRef<string | null>(null);
  // Lo último que se eligió: al elegir se escribe en la caja, y sin esto ese
  // cambio de texto dispararía otra búsqueda y la lista volvería a abrirse.
  const yaElegido = useRef("");
  // Cada búsqueda lleva número: si una lenta contesta después de otra más
  // reciente, se descarta en vez de pisar las sugerencias buenas.
  const turno = useRef(0);

  // Menos de 3 letras no dice nada y solo gasta consultas.
  const MINIMO = 3;
  const ESPERA_MS = 350;

  useEffect(() => {
    const q = direccion.trim();
    if (q.length < MINIMO || q === yaElegido.current) {
      setSugerencias([]);
      setBuscando(false);
      return;
    }
    if (!sesion.current) sesion.current = nuevaSesionDeBusqueda();
    const mio = ++turno.current;
    setBuscando(true);
    const t = setTimeout(async () => {
      // Con el pin ya puesto, se prefieren las direcciones de esa zona: "Av.
      // Larco" existe en varias ciudades. Es una preferencia, no un filtro.
      const rs = await sugerirDirecciones(q, {
        sesion: sesion.current ?? undefined,
        sesgo: pos ? { lat: pos.lat, lng: pos.lng } : undefined,
        pais: country,
      });
      if (mio !== turno.current) return; // llegó tarde: manda una posterior
      setBuscando(false);
      setSugerencias(rs);
      setResaltada(-1);
      setAbierto(true);
    }, ESPERA_MS);
    return () => clearTimeout(t);
    // `pos` a propósito fuera: mover el pin no debe relanzar la búsqueda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direccion]);

  const usarSugerencia = async (s: Sugerencia) => {
    yaElegido.current = s.titulo;
    setDireccion(s.titulo);
    setSugerencias([]);
    setAbierto(false);
    setResaltada(-1);
    turno.current++; // cancela cualquier búsqueda en vuelo

    // Una sola llamada trae el punto Y la zona, y además cierra la sesión.
    setDeduciendo(true);
    const lugar = await detalleDeLugar(s.id, sesion.current ?? undefined);
    sesion.current = null;
    setDeduciendo(false);

    if (!lugar) {
      // Sin punto no hay nada que marcar; se pide la zona a mano antes que
      // dejar el aviso sin departamento.
      setFalloDeduccion(true);
      setAMano(true);
      return;
    }
    onCoordsChange(lugar.lat, lugar.lng);
    aplicarZona(lugar.region, lugar.referencia, lugar.pais);
  };

  const teclado = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setAbierto(false); return; }
    if (!abierto || sugerencias.length === 0) {
      // Enter con la lista cerrada: se toma la primera coincidencia, para que
      // escribir y pulsar Enter siga funcionando como antes con el botón.
      if (e.key === "Enter") {
        e.preventDefault();
        if (sugerencias[0]) void usarSugerencia(sugerencias[0]);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setResaltada((i) => (i + 1) % sugerencias.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltada((i) => (i <= 0 ? sugerencias.length : i) - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      void usarSugerencia(sugerencias[resaltada >= 0 ? resaltada : 0]);
    }
  };

  const avisoDelMapa = textoDeEstadoDelMapa(estado);

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="buscar-direccion">Ubicación {required && "*"}</Label>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Marca en el mapa dónde está tu aviso. El resto lo completamos nosotros.
        </p>
      </div>

      {/* `relative`: la lista de sugerencias flota sobre el mapa, que va justo
          debajo. Si empujara el contenido, el mapa bailaría al escribir. */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          id="buscar-direccion"
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
          onKeyDown={teclado}
          onFocus={() => { if (sugerencias.length > 0) setAbierto(true); }}
          // El cierre se retrasa: sin eso el blur mata la lista antes de que el
          // clic en una sugerencia llegue a dispararse.
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          placeholder="Escribe una dirección o un distrito"
          className="pl-9 pr-9"
          autoComplete="off"
          role="combobox"
          aria-expanded={abierto && sugerencias.length > 0}
          aria-controls="sugerencias-direccion"
          aria-autocomplete="list"
          aria-activedescendant={resaltada >= 0 ? `sugerencia-${resaltada}` : undefined}
        />
        {buscando && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}

        {abierto && sugerencias.length > 0 && (
          <ul
            id="sugerencias-direccion"
            role="listbox"
            className="absolute z-[500] left-0 right-0 top-full mt-1 divide-y rounded border border-border bg-popover shadow-lg overflow-hidden"
          >
            {sugerencias.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  id={`sugerencia-${i}`}
                  role="option"
                  aria-selected={i === resaltada}
                  // `onMouseDown` y no `onClick`: el blur del campo se dispara
                  // antes que el clic, y con onClick la lista ya no estaría.
                  onMouseDown={(e) => { e.preventDefault(); void usarSugerencia(s); }}
                  onMouseEnter={() => setResaltada(i)}
                  className={`w-full px-3 py-2 text-left transition-colors ${i === resaltada ? "bg-muted" : "hover:bg-muted"}`}
                >
                  <span className="block text-sm font-medium">{s.titulo}</span>
                  {s.detalle && (
                    <span className="block text-[11px] text-muted-foreground">{s.detalle}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Sin resultados: se dice, pero sin robar el foco ni tapar nada. */}
      {abierto && !buscando && direccion.trim().length >= MINIMO && sugerencias.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No encontramos esa dirección. Prueba con la calle y el número, o toca el mapa donde está tu aviso.
        </p>
      )}

      {onCountryChange && (
        <div>
          <Label htmlFor="pais-aviso" className="text-xs">País</Label>
          <Select
            value={country}
            onValueChange={(v) => {
              onCountryChange(v);
              // Cambiar de país invalida lo anterior: el departamento del INEI
              // y el punto marcado son de otro sitio.
              onDepartmentChange(null);
              onCoordsChange(null, null);
              onLocationChange("");
              setFalloDeduccion(false);
              setAMano(false);
            }}
          >
            <SelectTrigger id="pais-aviso" className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAISES.map((p) => (
                <SelectItem key={p.code} value={p.code}>{p.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="h-56 w-full overflow-hidden rounded border border-border relative">
        <div ref={contenedor} className="w-full h-full" data-testid="mapa" />
        {avisoDelMapa && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <p className="text-xs text-muted-foreground">{avisoDelMapa}</p>
          </div>
        )}
      </div>

      {/* Lo deducido, en una frase. No es un formulario: es lo que va a pasar. */}
      <div className="text-xs" aria-live="polite">
        {deduciendo ? (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 size={12} className="animate-spin shrink-0" /> Identificando la ubicación…
          </p>
        ) : department || (!enPeru && (location || pos)) ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex items-center gap-1.5 text-foreground">
              <Check size={12} className="text-secondary shrink-0" />
              {location ? <strong>{location}</strong> : null}
              <span className="text-muted-foreground">
                Aparecerá en las búsquedas de{" "}
                <strong className="text-foreground">
                  {enPeru ? nombreDepartamento(department) : nombrePais(country)}
                </strong>.
              </span>
            </span>
            {!aMano && (
              <button
                type="button"
                onClick={() => setAMano(true)}
                className="font-semibold text-secondary hover:underline"
              >
                Corregir
              </button>
            )}
          </div>
        ) : falloDeduccion && enPeru ? (
          <p className="text-muted-foreground">
            No pudimos identificar esa zona. Complétala abajo para que tu aviso aparezca en las búsquedas.
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin size={12} className="text-secondary shrink-0" />
            Toca el mapa —o busca la dirección arriba— para marcar tu punto.
          </p>
        )}
      </div>

      {/* Camino alternativo: solo cuando la deducción falla o se pide corregir. */}
      {/* Fuera del Perú la referencia escrita es la ÚNICA ubicación fina que hay
          (no se pide provincia ni estado), así que su campo está siempre. */}
      {(aMano || !enPeru) && (
        <div className="grid gap-3 sm:grid-cols-2 border-t border-border pt-3">
          {/* El departamento es del INEI: fuera del Perú no existe, y basta la
              referencia escrita. */}
          {enPeru && (
          <div>
            <Label htmlFor="departamento-aviso" className="text-xs">Departamento {required && "*"}</Label>
            <Select
              value={department ?? ""}
              onValueChange={(v) => { onDepartmentChange(v || null); setFalloDeduccion(false); }}
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
          </div>
          )}
          <div>
            <Label htmlFor="referencia-aviso" className="text-xs">Distrito o referencia</Label>
            <Input
              id="referencia-aviso"
              value={location}
              onChange={(e) => onLocationChange(e.target.value)}
              placeholder="Ej: Miraflores, frente al parque"
              className="mt-1.5"
            />
          </div>
        </div>
      )}
    </div>
  );
}
