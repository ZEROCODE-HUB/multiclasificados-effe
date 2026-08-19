import { pageNumbers, pageSizeParaColumnas } from "@/lib/paginacion";
import { useCallback, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { imgUrl, imgSrcSet } from "@/lib/imageUrl";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ListingCard } from "@/components/ListingCard";
import { Navbar } from "@/components/Navbar";
import { type Listing } from "@/data/mockData";
import { useCategories } from "@/hooks/useCategories";
import { useIsMobile } from "@/hooks/use-mobile";
import { useGridColumns } from "@/hooks/useFittingCount";
import { searchListings, fetchListingsByOwner, topeAlcanzado, type SortKey } from "@/lib/listings";
import { formatPrecioAviso } from "@/lib/pricing";
import { useSession } from "@/hooks/useSession";
import { useFavorites } from "@/hooks/useFavorites";
import { createSavedSearch, DUPLICATE_SEARCH_MSG } from "@/lib/savedSearches";
import {
  DEPARTAMENTOS, departamentoPorId, departamentoGuardado, guardarDepartamento,
  type Departamento,
} from "@/lib/departamentos";
import { PAISES, PAIS_POR_DEFECTO, esPeru, paisPorCodigo, paisPreferido, paisGuardado, guardarPais, paisPorIP } from "@/lib/paises";
import { toast } from "@/hooks/use-toast";
import {
  Search,
  LayoutGrid,
  List as ListIcon,
  Map as MapIcon,
  SlidersHorizontal,
  MapPin,
  Heart,
  Bookmark,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// El mapa se carga solo al abrir la vista "Mapa". Con el import estático, el
// SDK de mapas entraba en el bundle inicial de TODA la app —incluida la
// portada— porque esta página se importa sin lazy en App.tsx (IT3-004/007).
// Sigue valiendo con Google: el SDK se descarga al montar el componente, así
// que quien no abre el mapa no lo paga ni en bytes ni en cargas facturables.
const ListingsMap = lazy(() =>
  import("@/components/ListingsMap").then((m) => ({ default: m.ListingsMap })),
);

type ViewMode = "list" | "map";
type Layout = "grid" | "list";

// La lista de resultados se pagina: 20 por página en escritorio (web) y 10 en
// móvil (pantallas < 768px, incluido el APK). Antes el APK mostraba la lista
// continua; ahora también pagina para no volcar cientos de avisos de golpe.
const WEB_PAGE_SIZE = 20;
const MOBILE_PAGE_SIZE = 10;



export default function SearchPage() {
  const categories = useCategories();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const session = useSession();
  const { isFavorite, toggle } = useFavorites();
  const initialView = (params.get("view") as ViewMode) || "list";
  const [view, setView] = useState<ViewMode>(initialView);
  const [layout, setLayout] = useState<Layout>("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  // ---- Datos reales + filtros + búsqueda EN VIVO (REQ-02) ----
  const [listings, setListings] = useState<Listing[]>([]);
  const [q, setQ] = useState<string>(params.get("q") || "");
  const [category, setCategory] = useState<string>(params.get("cat") || "");
  const [priceMin, setPriceMin] = useState<string>(params.get("min") || "");
  const [priceMax, setPriceMax] = useState<string>(params.get("max") || "");
  // Departamento: el único filtro de ubicación. Exacto y predecible — eliges
  // Lima y ves Lima. Se recuerda en el dispositivo y viaja en la URL (dep=15).
  const [departamento, setDepartamento] = useState<Departamento | null>(
    () => departamentoPorId(params.get("dep")) ?? departamentoGuardado(),
  );
  // País: por defecto, el que se deduce de la zona horaria del dispositivo
  // (Perú de respaldo). Viaja en la URL (pais=PE) y se recuerda como el
  // departamento. Fuera del Perú el filtro de departamento no tiene sentido.
  const [pais, setPais] = useState<string>(
    () => (paisPorCodigo(params.get("pais")) ?? paisPreferido()).code,
  );
  const enPeru = esPeru(pais);
  /**
   * ¿El país lo eligió una persona, o lo dedujimos nosotros?
   *
   * La zona horaria acierta casi siempre, pero no siempre: un equipo con la
   * hora mal configurada, una VPN o un viajero bastan para deducir mal. Y el
   * precio de equivocarse es el peor posible en un clasificado — la pantalla
   * vacía— así que un país deducido nunca puede dejar al usuario sin nada.
   */
  const paisElegido = useRef<boolean>(!!paisPorCodigo(params.get("pais")) || !!paisGuardado());
  const elegirPais = (code: string) => {
    paisElegido.current = true;
    guardarPais(code);
    setPais(code);
    if (code !== PAIS_POR_DEFECTO) setDepartamento(null);
  };
  // Moneda (EFFE-050): "" = todas. El RPC search_listings ya filtra por p_currency.
  const [currency, setCurrency] = useState<string>(params.get("cur") || "");
  const [sort, setSort] = useState<SortKey>((params.get("sort") as SortKey) || "recent");
  const [page, setPage] = useState(1);

  // Ubicación del dispositivo. Solo se pide cuando el usuario pulsa "Ver los más
  // cercanos", nunca al entrar, y solo sirve para ORDENAR: el filtro sigue
  // siendo el departamento y no se esconde nada por estar lejos.
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  const verMasCercanos = () => {
    if (!("geolocation" in navigator)) {
      toast({ title: "Ubicación no disponible", description: "Tu navegador no permite geolocalización." });
      return;
    }
    setGeoLoading(true);
    // Corte propio además del `timeout` de la API: en el WebView de iOS
    // getCurrentPosition puede no llamar NUNCA a ninguno de los dos callbacks
    // y el botón se quedaba cargando para siempre (MOB-08).
    let resuelto = false;
    const corte = window.setTimeout(() => {
      if (resuelto) return;
      resuelto = true;
      setGeoLoading(false);
      toast({
        title: "No se pudo obtener tu ubicación",
        description: "Revisa el permiso de ubicación y vuelve a intentarlo.",
        variant: "destructive",
      });
    }, 10000);
    const cerrar = () => { resuelto = true; window.clearTimeout(corte); setGeoLoading(false); };
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (resuelto) return;
        cerrar();
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSort("distance");
      },
      () => {
        if (resuelto) return;
        cerrar();
        toast({
          title: "No se pudo obtener tu ubicación",
          description: "Puedes seguir filtrando por departamento con normalidad.",
          variant: "destructive",
        });
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };





  // Sincroniza los filtros DESDE la URL (navbar, hero, búsquedas guardadas, o el
  // botón "atrás" que restaura una URL con filtros).
  useEffect(() => {
    setQ(params.get("q") || "");
    setCategory(params.get("cat") || "");
    setSort((params.get("sort") as SortKey) || "recent");
    setPriceMin(params.get("min") || "");
    setPriceMax(params.get("max") || "");
    setCurrency(params.get("cur") || "");
    // El departamento solo se toma de la URL si viene en ella: si no, se respeta
    // el que ya tenga el usuario recordado del dispositivo.
    const enUrl = departamentoPorId(params.get("dep"));
    if (enUrl) setDepartamento(enUrl);
    const paisEnUrl = paisPorCodigo(params.get("pais"));
    if (paisEnUrl) setPais(paisEnUrl.code);
  }, [params]);

  // El país que dedujimos de la zona horaria es un primer intento; el servidor
  // sabe de dónde viene la visita por la IP, que acierta bastante más. Si el
  // usuario ya eligió país a mano, no se le toca nada.
  useEffect(() => {
    if (paisElegido.current) return;
    let vivo = true;
    void paisPorIP().then((p) => {
      if (!vivo || !p || paisElegido.current) return;
      setPais(p.code);
      if (p.code !== PAIS_POR_DEFECTO) setDepartamento(null);
    });
    return () => { vivo = false; };
  }, []);

  // Recuerda el departamento para las próximas visitas.
  useEffect(() => { guardarDepartamento(departamento); }, [departamento]);

  // EFFE-051/092: refleja los filtros EN la URL (replace, para no ensuciar el
  // historial en cada tecla) de modo que copiar el enlace y el botón "atrás"
  // (p. ej. al volver de un aviso) conserven los filtros. `view` y `owner` que
  // ya viven en la URL se preservan.
  useEffect(() => {
    const next = new URLSearchParams(params);
    const put = (k: string, v: string) => { if (v) next.set(k, v); else next.delete(k); };
    put("q", q);
    put("cat", category);
    put("min", priceMin);
    put("max", priceMax);
    put("dep", enPeru ? departamento?.id ?? "" : "");
    // "PE" no ensucia la URL: es el caso normal.
    put("pais", pais === PAIS_POR_DEFECTO ? "" : pais);
    put("cur", currency);
    if (sort && sort !== "recent") next.set("sort", sort); else next.delete("sort");
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, category, priceMin, priceMax, departamento, pais, enPeru, currency, sort]);

  // Guarda la búsqueda actual (REQ-04).
  const saveCurrentSearch = async () => {
    if (!session?.supabase) {
      toast({ title: "Inicia sesión", description: "Crea una cuenta para guardar búsquedas y recibir alertas." });
      navigate("/auth?redirect=/buscar");
      return;
    }
    const catName = categories.find((c) => c.id === category)?.name;
    const defaultName = q || catName || "Mi búsqueda";
    try {
      await createSavedSearch(
        {
          q: q || undefined,
          category: category || undefined,
          priceMin: priceMin ? Number(priceMin) : undefined,
          priceMax: priceMax ? Number(priceMax) : undefined,
          sort,
        },
        defaultName
      );
      toast({ title: "Búsqueda guardada", description: "La verás en 'Mis búsquedas' y recibirás alertas de nuevos avisos." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Intenta de nuevo.";
      if (msg === DUPLICATE_SEARCH_MSG) {
        // Filtros repetidos: aviso claro, no un error.
        toast({ title: "El filtro ya existe", description: "Ya tienes una búsqueda guardada con estos mismos filtros." });
      } else {
        toast({ title: "No se pudo guardar", description: msg, variant: "destructive" });
      }
    }
  };

  // Guardar/quitar de favoritos desde la lista del mapa (mismo patrón que ListingCard).
  const handleFav = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!session?.supabase) {
      toast({ title: "Inicia sesión", description: "Crea una cuenta para guardar favoritos." });
      navigate("/auth?redirect=/buscar?view=map");
      return;
    }
    try {
      const res = await toggle(id);
      if (res === null) {
        toast({ title: "Disponible con avisos reales" });
        return;
      }
      toast({ title: res ? "Guardado en favoritos" : "Quitado de favoritos" });
    } catch {
      toast({ title: "No se pudo actualizar el favorito", variant: "destructive" });
    }
  };

  // Filtro por anunciante ("Ver todos sus avisos" del detalle): si la URL trae
  // ?owner=<id> mostramos solo los avisos de ese anunciante.
  const owner = params.get("owner") || "";

  // Búsqueda en vivo: filtra a medida que se escribe / cambian filtros (debounce 250 ms).
  useEffect(() => {
    const t = setTimeout(() => {
      const load = owner
        ? fetchListingsByOwner(owner)
        : searchListings({
            q: q || undefined,
            category: category || undefined,
            priceMin: priceMin ? Number(priceMin) : undefined,
            priceMax: priceMax ? Number(priceMax) : undefined,
            currency: currency || undefined,
            // El departamento del INEI solo distingue dentro del Perú.
            department: enPeru ? departamento?.id : undefined,
            country: pais,
            // Solo con permiso concedido, y solo para ordenar.
            lat: geo?.lat,
            lng: geo?.lng,
            sort,
          });
      load.then(async (rows) => {
        // Si el país lo pusimos nosotros y no hay ni un aviso, el filtro está
        // estorbando: se repite la búsqueda sin él antes que enseñar una
        // pantalla vacía por una suposición nuestra.
        if (rows.length === 0 && !paisElegido.current && pais !== "" && !owner) {
          const todos = await searchListings({
            q: q || undefined,
            category: category || undefined,
            priceMin: priceMin ? Number(priceMin) : undefined,
            priceMax: priceMax ? Number(priceMax) : undefined,
            currency: currency || undefined,
            country: "",
            lat: geo?.lat,
            lng: geo?.lng,
            sort,
          });
          if (todos.length > 0) {
            setPais("");
            setListings(todos);
            setActive(todos[0]?.id ?? null);
            return;
          }
        }
        setListings(rows);
        setActive(rows[0]?.id ?? null);
      });
    }, owner ? 0 : 250);
    return () => clearTimeout(t);
  }, [q, category, priceMin, priceMax, currency, sort, owner, departamento, pais, enPeru, geo]);

  // Al cambiar la búsqueda o los filtros, vuelve a la primera página.
  useEffect(() => { setPage(1); }, [q, category, priceMin, priceMax, currency, sort, owner, departamento, pais, geo]);

  // Cuántas columnas está pintando la rejilla ahora mismo (1 en la vista de
  // lista). Manda el ancho real, no el de la ventana.
  const rejilla = useGridColumns();
  const cols = rejilla.cols;

  // Porción visible de resultados según la página actual (clamp por si la lista
  // encogió tras filtrar y la página quedó fuera de rango). 20 por página en
  // escritorio, 10 en móvil (< 768px, incluido el APK).
  // El tamaño de página se ajusta a las columnas que haya en pantalla, para que
  // ninguna página acabe con una fila rota.
  const pageSize = pageSizeParaColumnas(isMobile ? MOBILE_PAGE_SIZE : WEB_PAGE_SIZE, cols);
  const totalPages = Math.max(1, Math.ceil(listings.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageListings = listings.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const goToPage = (p: number) => setPage(Math.min(totalPages, Math.max(1, p)));

  // Los filtros se aplican EN VIVO (el useEffect de arriba reacciona a cada
  // cambio). Este botón solo cierra el panel en móvil; por eso se llama "Ver
  // resultados" y no "Aplicar filtros", que hacía creer que sin pulsarlo no se
  // filtraba (IT2-025).
  const applyFilters = () => setShowFilters(false);

  // Hay algún filtro activo (para mostrar "Limpiar filtros", IT2-026).
  // El departamento SÍ cuenta como filtro activo: a diferencia del orden, sí
  // deja fuera avisos, así que tiene que poder limpiarse.
  const hasActiveFilters = !!(
    q || category || priceMin || priceMax || currency || departamento || geo ||
    pais !== PAIS_POR_DEFECTO || (sort && sort !== "recent")
  );
  // Resetea TODOS los filtros de una vez. El efecto de URL (arriba) los limpia
  // también del enlace al vaciarse el estado.
  const clearFilters = () => {
    setQ("");
    setCategory("");
    setPriceMin("");
    setPriceMax("");
    setCurrency("");
    setSort("recent");
    setDepartamento(null);
    // Limpiar devuelve al Perú, que es donde está el 99 % de los avisos.
    setPais(PAIS_POR_DEFECTO);
    setGeo(null);
  };

  // useCallback porque ViewToggle lo memoiza: sin estabilizarlo se recrearía en
  // cada render y el memo no ahorraría nada.
  const switchView = useCallback((v: ViewMode) => {
    setView(v);
    const next = new URLSearchParams(params);
    if (v === "map") next.set("view", "map");
    else next.delete("view");
    setParams(next, { replace: true });
  }, [params, setParams]);

  // Memoizado por lo que de verdad usa: `view` para marcar el botón activo y
  // `params` porque switchView reescribe la URL a partir de ellos. Así puede
  // entrar como dependencia del encabezado sin recrearlo en cada render.
  const ViewToggle = useMemo(() => (
    <div className="flex items-center gap-1 border border-border rounded-full p-0.5 shrink-0">
      <button
        onClick={() => switchView("list")}
        className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full transition-colors ${
          view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <ListIcon size={12} className="inline mr-1" /> Lista
      </button>
      <button
        onClick={() => switchView("map")}
        className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full transition-colors ${
          view === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <MapIcon size={12} className="inline mr-1" /> Mapa
      </button>
    </div>
  ), [view, switchView]);

  const FilterBar = useMemo(
    () => (
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 md:px-6 py-2 space-y-2 md:space-y-0">
          {/* Top row: filtros + toggle (siempre visibles, sin scroll) */}
          <div className="flex items-center gap-3 md:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(true)}
              className="gap-2 rounded-full shrink-0"
            >
              <SlidersHorizontal size={14} /> Filtros
            </Button>
            <div className="ml-auto">{ViewToggle}</div>
          </div>

          {/* Fila de categorías. El botón "Filtros" (tablet) y el toggle Lista/Mapa
              van FUERA del contenedor con scroll horizontal para que no se oculten
              tras el scroll cuando las categorías llenan el ancho en desktop
              (IT2-028). Solo las categorías scrollean (flex-1 min-w-0). */}
          <div className="flex items-center gap-3">
            {/* Solo en tablet (md–lg): en lg+ el panel ya vive en la barra lateral.
                Sin el `lg:hidden`, en desktop este botón abría el Sheet (cuyo
                contenido es `lg:hidden`) y solo se veía el overlay → pantalla negra. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(true)}
              className="gap-2 rounded-full shrink-0 hidden md:inline-flex lg:hidden"
            >
              <SlidersHorizontal size={14} /> Filtros
            </Button>
            {/* El degradado del borde derecho avisa de que la lista sigue: con
                `no-scrollbar` no hay ninguna otra pista de que se puede deslizar
                (IT3-014). `pointer-events-none` para no comerse los clics. */}
            <div className="relative flex-1 min-w-0">
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory((prev) => (prev === c.id ? "" : c.id))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-full transition-colors shrink-0 ${
                    category === c.id
                      ? "border-secondary text-secondary"
                      : "border-border hover:border-secondary hover:text-secondary"
                  }`}
                >
                  <c.icon size={12} /> {c.name}
                </button>
              ))}
            </div>
              <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent" />
            </div>
            <div className="hidden md:block shrink-0">{ViewToggle}</div>
          </div>
        </div>
      </div>
    ),
    [category, categories, ViewToggle]
  );


  const FiltersPanel = (
    <div className="bg-card border border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground">Filtros</h3>
        <button aria-label="Cerrar filtros" onClick={() => setShowFilters(false)} className="lg:hidden text-muted-foreground">
          <X size={16} />
        </button>
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Categoría</label>
        <Select value={category || undefined} onValueChange={setCategory}>
          <SelectTrigger className="mt-1.5 rounded-none"><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Precio min</label>
          <Input type="number" placeholder="0" className="mt-1.5 rounded-none"
            value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Precio max</label>
          <Input type="number" placeholder="Sin límite" className="mt-1.5 rounded-none"
            value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Moneda</label>
        <Select value={currency || "all"} onValueChange={(v) => setCurrency(v === "all" ? "" : v)}>
          <SelectTrigger className="mt-1.5 rounded-none"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="PEN">Soles (S/)</SelectItem>
            <SelectItem value="USD">Dólares (US$)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {/* País: arranca en el que dice la zona horaria del dispositivo (Perú de
          respaldo), así que quien entra desde Lima no tiene que tocar nada. */}
      <div>
        <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">País</label>
        <Select
          value={pais || "todos"}
          onValueChange={(v) => elegirPais(v === "todos" ? "" : v)}
        >
          <SelectTrigger className="mt-1.5 rounded-none"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los países</SelectItem>
            {PAISES.map((p) => (
              <SelectItem key={p.code} value={p.code}>{p.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* Ubicación: un desplegable de departamentos y nada más. Exacto y
          predecible — eliges Lima y ves Lima. Lima y Callao van juntos porque
          en la práctica son la misma ciudad: separarlos escondería avisos que
          el usuario tiene cruzando la avenida. Solo dentro del Perú. */}
      {enPeru && (
      <div>
        <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Departamento</label>
        <Select
          value={departamento?.id ?? "all"}
          onValueChange={(v) => setDepartamento(v === "all" ? null : departamentoPorId(v))}
        >
          <SelectTrigger className="mt-1.5 rounded-none"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo el Perú</SelectItem>
            {DEPARTAMENTOS.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Ordenar por cercanía real. Se pide el permiso AQUÍ, cuando el usuario
            lo pulsa, y no al entrar en la app. No filtra: reordena lo que ya se
            está viendo. */}
        {geo ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Ordenado por cercanía a ti.</span>
            <button
              onClick={() => { setGeo(null); setSort("recent"); }}
              className="text-xs font-semibold text-secondary hover:underline shrink-0"
            >
              Quitar
            </button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full rounded-none gap-2"
            onClick={verMasCercanos}
            disabled={geoLoading}
          >
            <MapPin size={14} /> {geoLoading ? "Ubicando…" : "Ver los más cercanos"}
          </Button>
        )}
      </div>
      )}
      <div>
        <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Ordenar por</label>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="mt-1.5 rounded-none"><SelectValue placeholder="Más recientes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Más recientes</SelectItem>
            {geo && <SelectItem value="distance">Más cercanos</SelectItem>}
            <SelectItem value="price_asc">Precio: menor a mayor</SelectItem>
            <SelectItem value="price_desc">Precio: mayor a menor</SelectItem>
            <SelectItem value="views">Más vistos</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {/* "Limpiar filtros": resetea todo de una vez. Solo aparece si hay algo
          que limpiar (IT2-026). */}
      {hasActiveFilters && (
        <Button variant="ghost" className="w-full rounded-none gap-2 text-muted-foreground" size="sm" onClick={clearFilters}>
          <X size={14} /> Limpiar filtros
        </Button>
      )}
      {/* Solo cierra el panel en móvil (los filtros ya están aplicados en vivo). */}
      <Button className="w-full rounded-none lg:hidden" size="sm" onClick={applyFilters}>Ver resultados</Button>
      <Button variant="outline" className="w-full rounded-none gap-2" size="sm" onClick={saveCurrentSearch}>
        <Bookmark size={14} /> Guardar búsqueda
      </Button>
    </div>
  );

  return (
    <div className={`${view === "map" ? "min-h-screen lg:h-screen" : "min-h-screen"} flex flex-col bg-background`}>
      <Navbar />

      {/* Búsqueda en vivo (filtra mientras escribes) en todo lo que sea < 2xl
          (móvil, tablet y la mayoría de laptops). El buscador del Navbar solo se
          activa en 2xl+ (≥1536px), que es donde de verdad hay espacio; entre xl y
          2xl el header se satura y el buscador se aplastaba a una cajita. Así
          nunca hay dos buscadores a la vez. */}
      <div className="2xl:hidden border-b border-border bg-card">
        <div className="container mx-auto px-4 py-2">
          <div className="flex items-center bg-muted/50 border border-border h-10 focus-within:border-secondary/40 focus-within:bg-card transition-colors">
            <Search size={16} className="ml-3 text-muted-foreground shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Busca por título, descripción o ubicación…"
              className="flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="px-3 text-muted-foreground hover:text-foreground shrink-0"
                aria-label="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {FilterBar}

      {owner && (
        <div className="container mx-auto px-4 md:px-6 pt-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-secondary/30 bg-secondary/5 px-4 py-3">
            <p className="text-sm text-foreground">
              Mostrando todos los avisos de{" "}
              <span className="font-bold">{listings[0]?.advertiser || "este anunciante"}</span>
            </p>
            <button
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete("owner");
                setParams(next);
              }}
              className="text-xs font-semibold text-secondary hover:underline shrink-0"
            >
              Quitar filtro
            </button>
          </div>
        </div>
      )}

      {view === "list" ? (
        <div className="container mx-auto px-4 md:px-6 pt-4 pb-28 lg:pb-8 flex-1">
          <div className="flex items-center justify-between gap-3 mb-4">
            {/* "Resultados" + conteo en una sola línea (más compacto). */}
            <h1 className="text-base md:text-lg font-extrabold text-foreground flex items-baseline gap-2 min-w-0">
              <span className="text-[11px] uppercase tracking-[0.18em] font-bold text-secondary shrink-0">Resultados</span>
              <span className="text-muted-foreground/50">·</span>
              {/* Con el tope alcanzado el número deja de ser el total real, así
                  que no se enseña como si lo fuera. */}
              <span className="truncate">
                {topeAlcanzado(listings.length)
                  ? `más de ${listings.length} avisos — afina los filtros`
                  : `${listings.length} avisos disponibles`}
              </span>
            </h1>
            <div className="hidden md:flex gap-1 border border-border p-0.5 shrink-0">
              <Button
                variant={layout === "grid" ? "default" : "ghost"}
                size="icon"
                aria-label="Ver en cuadrícula"
                onClick={() => setLayout("grid")}
                className="rounded-none h-8 w-8"
              >
                <LayoutGrid size={14} />
              </Button>
              <Button
                variant={layout === "list" ? "default" : "ghost"}
                size="icon"
                aria-label="Ver en lista"
                onClick={() => setLayout("list")}
                className="rounded-none h-8 w-8"
              >
                <ListIcon size={14} />
              </Button>
            </div>
          </div>

          <div className="flex gap-5">
            <aside className="hidden lg:block w-64 flex-shrink-0">
              {FiltersPanel}
            </aside>

            <div className="flex-1 min-w-0">
              {listings.length === 0 ? (
                <div className="border border-dashed border-border py-20 text-center">
                  <p className="text-muted-foreground">No se encontraron avisos con estos filtros.</p>
                </div>
              ) : (
                <>
                  <div
                    ref={rejilla.ref}
                    className={
                      layout === "grid"
                        ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6 gap-3"
                        : "space-y-3"
                    }
                  >
                    {pageListings.map((listing) => (
                      <ListingCard key={listing.id} listing={listing} layout={layout} />
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <nav
                      className="flex flex-wrap items-center justify-center gap-1.5 mt-8"
                      aria-label="Paginación de resultados"
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 rounded-none"
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage <= 1}
                      >
                        <ChevronLeft size={14} /> Anterior
                      </Button>

                      {pageNumbers(currentPage, totalPages).map((p, i) =>
                        p === "…" ? (
                          <span key={`gap-${i}`} className="px-2 text-muted-foreground select-none">…</span>
                        ) : (
                          <Button
                            key={p}
                            variant={p === currentPage ? "default" : "outline"}
                            size="icon"
                            className="rounded-none h-9 w-9 text-sm"
                            onClick={() => goToPage(p)}
                            aria-label={`Página ${p}`}
                            aria-current={p === currentPage ? "page" : undefined}
                          >
                            {p}
                          </Button>
                        )
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 rounded-none"
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                      >
                        Siguiente <ChevronRight size={14} />
                      </Button>
                    </nav>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[480px_1fr] lg:min-h-0">
          {/* Map - full width on top in mobile, right column on desktop */}
          <div className="relative bg-muted overflow-hidden h-[45vh] lg:h-auto lg:order-2 shrink-0">
            {/* El Suspense va pegado al mapa: si envolviera también la lista,
                la columna de resultados se remontaría al cambiar de vista. */}
            <Suspense
              fallback={
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                  Cargando mapa…
                </div>
              }
            >
              <ListingsMap
                listings={listings}
                active={active}
                onActive={setActive}
                hrefFor={(id) => `/aviso/${id}`}
              />
            </Suspense>
          </div>

          {/* List - below map on mobile (la página hace scroll), columna izquierda con scroll propio en escritorio */}
          <div className="lg:flex-1 lg:overflow-y-auto lg:border-r border-border bg-background lg:order-1 lg:min-h-0 pb-[calc(var(--nav-bottom)+2rem)] lg:pb-0">
            <div className="px-4 lg:px-5 py-3 lg:py-4 border-b border-border lg:sticky lg:top-0 bg-background/95 backdrop-blur z-10">
              <p className="text-[10px] lg:text-xs uppercase tracking-[0.2em] font-bold text-secondary">Resultados</p>
              <h1 className="text-base lg:text-lg font-bold text-foreground mt-0.5 lg:mt-1">
                {listings.length} avisos en el mapa
              </h1>
            </div>
            <div className="divide-y divide-border">
              {listings.map((l) => (
                <Link
                  key={l.id}
                  to={`/aviso/${l.id}`}
                  onMouseEnter={() => setActive(l.id)}
                  className={`flex gap-3 lg:gap-4 p-3 lg:p-4 transition-colors ${
                    active === l.id ? "bg-muted/60" : "hover:bg-muted/40"
                  }`}
                >
                  <div
                    className="w-24 lg:w-32 shrink-0 bg-muted overflow-hidden"
                    style={{ aspectRatio: "4 / 3" }}
                  >
                    <img src={imgUrl(l.imageUrl, 400)} srcSet={imgSrcSet(l.imageUrl, 400)} sizes="(min-width: 1024px) 25vw, 50vw" alt={l.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-secondary">
                        {l.category}
                      </span>
                      <button
                        onClick={(e) => handleFav(e, l.id)}
                        className="text-muted-foreground hover:text-secondary transition-colors"
                        aria-label={isFavorite(l.id) ? "Quitar de favoritos" : "Guardar en favoritos"}
                      >
                        <Heart
                          size={14}
                          className={isFavorite(l.id) ? "text-secondary fill-secondary" : ""}
                        />
                      </button>
                    </div>
                    <h3 className="font-semibold text-sm text-foreground line-clamp-2 mt-1">{l.title}</h3>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1.5">
                      <span className="truncate">
                        <MapPin size={10} className="inline" /> {l.location}
                      </span>
                    </div>
                    {session?.supabase ? (
                      <p className="text-base font-extrabold text-primary mt-2">
                        {formatPrecioAviso(l.price, l.currency)}
                      </p>
                    ) : (
                      <p className="text-[11px] text-secondary font-semibold mt-2">Ver detalle</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile filters drawer (funciona en vistas lista y mapa) */}
      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent side="left" className="w-[88vw] max-w-sm p-0 overflow-y-auto lg:hidden">
          <SheetHeader className="p-5 border-b">
            <SheetTitle>Filtros</SheetTitle>
          </SheetHeader>
          <div className="p-4">{FiltersPanel}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
