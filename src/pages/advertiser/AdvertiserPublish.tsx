import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ImagePlus, X, ArrowLeft, ArrowRight, Star, Check, MapPin, Tag, FileText, Camera,
  ShieldCheck, CreditCard, Receipt, Sparkles, Flame, EyeOff, Lock, Package, Minus, Plus,
  Wallet, Loader2, Percent, Save, Video, Trash2,
} from "lucide-react";
import { useCategories } from "@/hooks/useCategories";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { toast } from "@/hooks/use-toast";
import { useValidacion, MensajeDeError } from "@/hooks/useValidacion";
import { compressImage } from "@/lib/compressImage";
import { MAX_SEGUNDOS, MAX_VIDEOS, validarVideo } from "@/lib/video";
import { paisPreferido, guardarPais, esPeru } from "@/lib/paises";
import {
  loadSettings, priceForDuration, extrasTotal, formatSoles, formatCredits, avisosBreakdown, solesToCredits,
  type DurationDays, type PricingSettings, type ExtraPrices,
} from "@/lib/pricing";
import { mensajeDeError } from "@/lib/errores";
import { cargarAvisoParaCopiar, cargarAvisoParaContinuar, createAndPublishListing, finalizeListingPublication, guardarCambiosDeAviso, saveListingDraft, SaldoInsuficiente } from "@/lib/publish";
import { urgenteAllowedFor, URGENTE_MAX_DAYS } from "@/lib/listingBadges";
import { ListingCard } from "@/components/ListingCard";
import { InfoHint } from "@/components/InfoHint";
import { imagenPorDefecto } from "@/lib/imagenPorDefecto";
import type { Listing } from "@/data/mockData";
import { type PersonType } from "@/components/VerifyIdentityDialog";
import { fetchMyIdentity } from "@/lib/identity";
import { getCreditBalance } from "@/lib/credits";
import { fetchActivePromotions, bestPromoForCategory, applyDiscount, type Promotion } from "@/lib/promotions";
import { fetchPricingSettings } from "@/lib/pricingRemote";
import { adicionalesQueFaltan, resumenDeFaltantes } from "@/lib/adicionalesCompletos";
import { enfocarCampo } from "@/lib/validacion";
import { BuyCreditsModal, type PublishTarget } from "@/components/BuyCreditsModal";
import { LocationPicker } from "@/components/LocationPicker";
import { supabase } from "@/lib/supabase";
import {
  nuevoIdDeAviso, subirAdjunto, borrarAdjunto, porcentajeSubido, textoDePendiente,
  type EstadoSubida,
} from "@/lib/subidaAnticipada";

interface PhotoItem {
  id: string; url: string; name: string; file: File; comprimida?: boolean;
  /** En qué va su subida al servidor (empieza al ELEGIRLA, no al publicar). */
  estado?: EstadoSubida;
}

/** Un adjunto cualquiera del aviso, para contar el progreso por peso. */
interface Adjunto { file: File; estado: EstadoSubida; }

/**
 * Un adjunto que YA está en el servidor, listo para pintarlo en el formulario.
 *
 * El `File` va vacío y su `size` es 0 a propósito: no hay ni un byte que subir,
 * y el progreso mide lo que FALTA por subir. Si se le pusiera el peso real, la
 * barra empezaría en 0 % con todo ya arriba.
 *
 * Lo usan los dos modos que abren un aviso existente —continuar un borrador y
 * editar uno publicado—, por eso vive aquí fuera y no dentro de uno de ellos.
 */
const yaSubido = (
  a: { name: string; subido: { path: string; url: string } },
  i: number,
): PhotoItem => ({
  id: `sub-${i}-${a.subido.path}`,
  url: a.subido.url,
  name: a.name,
  file: new File([], a.name),
  comprimida: true,
  estado: { fase: "lista" as const, subido: a.subido },
});

const DURATIONS: DurationDays[] = [3, 7, 15, 30, 60, 90];

// Un aviso copiado puede traer una duración que ya no esté en la tarifa.
const asDuracion = (d: number | null | undefined): DurationDays =>
  (DURATIONS as number[]).includes(d ?? 0) ? (d as DurationDays) : 7;

// "Imagen adicional" admite hasta 3 por aviso (además de la portada incluida).
const MAX_EXTRA_IMAGES = 3;
// Tope de peso de una foto YA optimizada. El original puede llegar pesado —una
// foto de móvil son 3-8 MB y rechazarla sería rechazar casi cualquier foto—, se
// reescala a 1600 px y se pasa a WebP, y es el resultado el que tiene que caber
// aquí. Antes el texto prometía "hasta 100 KB" y se aceptaba cualquier cosa
// hasta 10 MB sin comprobar nada: el cliente lo reportó y tenía razón.
const MAX_FOTO_BYTES = 500 * 1024;

// Extras del paquete (cantidad numérica por cada uno)
type ExtraKey = "img500" | "pdf500" | "video20" | "urgente" | "destacado" | "confidencial";
// `sub` es la restricción, siempre visible; `help` es la explicación que sale al
// pulsar la ⓘ. Antes urgente/destacado/confidencial no decían qué hacían (IT3-018).
const EXTRA_DEFS: Array<{ key: ExtraKey; label: string; sub?: string; help: string; icon: typeof Sparkles }> = [
  { key: "img500", label: "Imagen adicional", sub: "hasta 500 KB · hasta 3", icon: ImagePlus,
    help: "Suma fotos a la galería del aviso, además de la portada que ya viene incluida. Cada archivo puede pesar hasta 500 KB." },
  { key: "pdf500", label: "PDF adjunto por aviso", sub: "hasta 500 KB", icon: FileText,
    help: "Adjunta un documento descargable (ficha técnica, plano, catálogo…) que quien vea el aviso podrá abrir." },
  { key: "video20", label: "Video del aviso", sub: `hasta ${MAX_SEGUNDOS} s · hasta ${MAX_VIDEOS}`, icon: Video,
    help: `Sube videos cortos (máximo ${MAX_SEGUNDOS} segundos cada uno) que se reproducen dentro del aviso. Se ve el video completo, no una miniatura.` },
  { key: "urgente", label: "Marcar como Urgente", icon: Flame,
    help: `Muestra una insignia con la cuenta atrás para transmitir prisa. Solo está disponible en avisos de hasta ${URGENTE_MAX_DAYS} días.` },
  { key: "destacado", label: "Marcar como Destacado", icon: Star,
    help: "Tu aviso aparece primero en los resultados de búsqueda y en la portada, por encima de los avisos normales." },
  { key: "confidencial", label: "Marcar como Confidencial", icon: EyeOff,
    help: "Oculta tu nombre y tus datos en el aviso: los interesados solo pueden contactarte por el chat de la plataforma." },
];

type ExtrasCount = Partial<Record<ExtraKey, number>>;

const DRAFT_KEY = "effe:publish-draft";

const AdvertiserPublish = () => {
  const session = useSession();
  const navigate = useNavigate();
  const categories = useCategories();
  const fileRef = useRef<HTMLInputElement>(null);

  // Guardia: para publicar hay que haber iniciado sesión (cuenta real).
  // Si no hay sesión de Supabase, redirige al login al entrar.
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) {
        navigate("/auth?redirect=/dashboard/anunciante/publicar", { replace: true });
      } else {
        setAuthChecked(true);
        setUserEmail(data.session.user.email ?? "");
      }
    });
    return () => { active = false; };
  }, [navigate]);

  // Identidad verificada por Factiliza. Ya NO se pide en un modal al publicar:
  // se toma del perfil (se verificó al comprar saldo o en una publicación previa)
  // y alimenta el comprobante. Así el usuario no repite la verificación.
  const [personType, setPersonType] = useState<PersonType>("");
  const [docNumber, setDocNumber] = useState("");
  const [docVerified, setDocVerified] = useState(false);
  const [verifiedName, setVerifiedName] = useState("");

  // Precarga la identidad verificada del perfil para el comprobante (sin modal).
  useEffect(() => {
    let active = true;
    fetchMyIdentity().then((id) => {
      if (!active || !id) return;
      if (id.docNumber) setDocNumber(id.docNumber);
      if (id.docType) setPersonType(id.docType === "ruc" ? "juridica" : "natural");
      if (id.name) setVerifiedName(id.name);
      setDocVerified(id.docVerified);
    });
    return () => { active = false; };
  }, [session?.supabase]);

  // Imágenes: portada incluida + hasta MAX_EXTRA_IMAGES adicionales (según el
  // adicional "Imagen adicional"). extraPhotos es un array fijo de 3 slots.
  const [mainPhoto, setMainPhoto] = useState<PhotoItem | null>(null);
  const [extraPhotos, setExtraPhotos] = useState<(PhotoItem | null)[]>(
    () => Array(MAX_EXTRA_IMAGES).fill(null),
  );
  const extraFileRef = useRef<HTMLInputElement>(null);
  const pickingSlot = useRef<number>(0);

  // PDF adjunto (adicional "PDF adjunto por aviso"). Solo se muestra su apartado
  // si el adicional está activo; si se desactiva, el archivo elegido se descarta.
  const [pdfFile, setPdfFile] = useState<{ file: File; name: string; estado?: EstadoSubida } | null>(null);
  // Vídeos elegidos, en el orden en que se verán. Se guardan ya validados
  // (tipo, tamaño y duración): lo que llega aquí es subible.
  const [videos, setVideos] = useState<Array<{
    file: File; name: string; duracion: number; estado?: EstadoSubida;
    /** Republicar: ruta del vídeo del aviso original, para copiarlo en Storage. */
    copiarDe?: string;
    urlOrigen?: string;
  }>>([]);
  const [validandoVideo, setValidandoVideo] = useState(false);
  const pdfFileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    category: "",
    title: "",
    description: "",
    price: "",
    currency: "PEN",
    department: "",
    location: "",
    condition: "nuevo",
    // Por defecto, el país que se deduce del dispositivo (Perú de respaldo).
    country: paisPreferido().code,
  });

  // Coordenadas del aviso (para el mapa del buscador). Se fijan geocodificando
  // el texto de ubicación o arrastrando el pin en el LocationPicker.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Un aviso a la vez: el precio depende de la duración + adicionales.
  // La compra "por volumen" vive en el modal de créditos, no aquí.
  const [quantity] = useState<number>(1);
  const [duration, setDuration] = useState<DurationDays>(7);
  // EFFE-097: ninguna duración viene preseleccionada. `duration` mantiene un
  // valor interno (para la vista previa y el cálculo), pero hasta que el usuario
  // elige explícitamente NO se resalta ninguna opción ni se muestra un costo,
  // para que nadie crea que se le va a cobrar sin haber elegido.
  const val = useValidacion();
  // "Subiendo imagen 2 de 4…": la misma espera, pero sabiendo en qué va.
  const [subiendo, setSubiendo] = useState<{ hechas: number; total: number } | null>(null);
  // ¿El aviso guardado en la BD ya tiene EXACTAMENTE estas fotos? Si es que sí,
  // publicar no vuelve a subirlas. Antes, tras pagar el faltante, se borraban y
  // se resubían las cuatro fotos otra vez, justo cuando el usuario ya llevaba
  // medio minuto esperando.
  const adjuntosAlDia = useRef(false);

  // ---- Subida anticipada (ver src/lib/subidaAnticipada.ts) ----
  // El id del aviso se reserva EN EL NAVEGADOR la primera vez que hace falta,
  // antes de que exista la fila: es lo que permite subir una foto en cuanto se
  // elige, sin tener que crear un borrador en "Mis avisos" solo para eso.
  const idReservado = useRef<string | null>(null);
  const idDeAviso = () => {
    if (!idReservado.current) idReservado.current = nuevoIdDeAviso();
    return idReservado.current;
  };
  // Id del usuario, cacheado: se necesita para la ruta de CADA archivo y pedirlo
  // en cada subida serían viajes de ida y vuelta por foto.
  const userIdRef = useRef<string | null>(null);
  const dameUserId = async (): Promise<string | null> => {
    if (userIdRef.current) return userIdRef.current;
    const { data } = await supabase.auth.getSession();
    userIdRef.current = data.session?.user?.id ?? null;
    return userIdRef.current;
  };
  // Cancela las subidas en vuelo al empezar un aviso nuevo: sin esto, la subida
  // de la foto que acabas de descartar seguiría escribiendo en la ruta del aviso
  // siguiente.
  const abortoSubidas = useRef<AbortController>(new AbortController());
  // Subidas todavia en marcha. "Publicar" espera a que acaben en vez de volver a
  // mandar el archivo desde cero: sin esto, quien es rapido rellenando pagaria
  // la subida entera igual que antes.
  const subidasEnVuelo = useRef<Set<Promise<void>>>(new Set());
  const esperarSubidas = async () => {
    while (subidasEnVuelo.current.size) {
      await Promise.allSettled([...subidasEnVuelo.current]);
    }
  };
  const [durationChosen, setDurationChosen] = useState(false);
  const [extras, setExtras] = useState<ExtrasCount>({});

  // Créditos
  const [creditBalance, setCreditBalance] = useState(0);
  const [creditLoading, setCreditLoading] = useState(true);
  // Promociones vigentes (para descontar automáticamente al publicar).
  const [promos, setPromos] = useState<Promotion[]>([]);

  // Flujo de publicación con créditos
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  // Aviso que se está pagando para publicar en el acto. Cuando está puesto, el
  // modal cobra solo lo que falta y el servidor publica al confirmarse el pago.
  const [pagarPublicar, setPagarPublicar] = useState<PublishTarget | null>(null);
  const [publishing, setPublishing] = useState(false);
  // Guard SÍNCRONO contra el doble envío. `publishing` es state: no se actualiza
  // hasta el siguiente render, así que dos toques seguidos (o el ghost-click de
  // touch→click en el WebView de Android) leen ambos `publishing === false` del
  // mismo closure y pasan el guard. Un ref se actualiza al instante.
  const publishingRef = useRef(false);
  // Guardado en "Mis borradores". `draftListingId` recuerda el aviso ya creado:
  // guardar dos veces lo ACTUALIZA, y publicar después reutiliza ese mismo aviso
  // en vez de crear otro.
  const [savingDraft, setSavingDraft] = useState(false);
  const savingDraftRef = useRef(false);
  const draftListingId = useRef<string | null>(null);
  const [successOpen, setSuccessOpen] = useState<{ open: boolean; number: string; email: string }>({ open: false, number: "", email: "" });
  // Único modal al publicar: confirmar la publicación (la identidad ya viene del
  // perfil; NO se pide verificación aquí).
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Pricing en vivo: arranca del caché local y se refresca desde la BD.
  const [settings, setSettings] = useState<PricingSettings>(() => loadSettings());
  useEffect(() => {
    fetchPricingSettings().then(setSettings);
    const sync = () => setSettings(loadSettings());
    window.addEventListener("effe:pricing-updated", sync);
    return () => window.removeEventListener("effe:pricing-updated", sync);
  }, []);

  // Cargar saldo de créditos al montar (una vez autenticado)
  useEffect(() => {
    if (!authChecked) return;
    setCreditLoading(true);
    getCreditBalance().then((b) => { setCreditBalance(b); setCreditLoading(false); });
    fetchActivePromotions().then(setPromos);
  }, [authChecked]);

  // Restaurar borrador y reanudar flujo tras login
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.form) setForm(d.form);
      if (d.coords) setCoords(d.coords);
      // Un borrador ya traía una duración elegida: se restaura como "elegida".
      if (d.duration) { setDuration(d.duration); setDurationChosen(true); }
      if (d.extras) setExtras(d.extras);
      // `verified`/`verifiedName` NO se restauran: verificar exige sesión, así que
      // un borrador guardado antes del login jamás pudo verificarse de verdad.
      // Restaurarlos solo servía para que cualquiera se saltara la verificación
      // escribiendo `{"verified":true}` en el borrador de localStorage.
      if (d.personType) setPersonType(d.personType);
      if (d.docNumber) setDocNumber(d.docNumber);
      // Al volver del login se retoma la publicación por el cuadro de confirmar,
      // no publicando directamente. Antes esto llamaba a `setVerifyOpen`, que
      // dejó de existir al quitarse el modal de verificación: la llamada vivía
      // dentro de un setTimeout, así que el try/catch no la atrapaba y el
      // usuario volvía del login sin que se retomara nada.
      if (d.resumeAtSummary && session) {
        setTimeout(() => setConfirmOpen(true), 200);
      }
      localStorage.removeItem(DRAFT_KEY);
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Publicar uno igual": llega ?copiar=<id> desde Mis avisos. Se rellena el
  // formulario con ese aviso —incluidas sus fotos y su PDF— pero SIN atarlo:
  // es un aviso nuevo, el original sigue su curso.
  const [copiando, setCopiando] = useState(false);
  // Editar un aviso YA PUBLICADO: misma pantalla, sin plan y sin cobro.
  // Guarda el id porque es lo que distingue "guardar cambios" de "publicar".
  const [editandoId, setEditandoId] = useState<string | null>(null);
  useEffect(() => {
    // Se lee de la URL directamente y no con `useSearchParams`: este parámetro
    // solo se mira al montar, y el hook obligaría a envolver la pantalla en un
    // Router también en las pruebas.
    const id = new URLSearchParams(window.location.search).get("copiar");
    if (!id) return;
    let vivo = true;
    setCopiando(true);
    cargarAvisoParaCopiar(id)
      .then((copia) => {
        if (!vivo) return;
        setForm(copia.form);
        setCoords(copia.lat != null && copia.lng != null ? { lat: copia.lat, lng: copia.lng } : null);
        setDuration(asDuracion(copia.duration));
        setDurationChosen(true);
        // La cantidad no se copia: esta pantalla publica un aviso por vez.
        setExtras(copia.extras as ExtrasCount);
        if (copia.mainPhoto) {
          setMainPhoto({ id: "copia-main", url: URL.createObjectURL(copia.mainPhoto.file), name: copia.mainPhoto.name, file: copia.mainPhoto.file });
        }
        setExtraPhotos(copia.extraPhotos.map((f, i) => ({
          id: `copia-extra-${i}`, url: URL.createObjectURL(f.file), name: f.name, file: f.file,
        })));
        // LOS VÍDEOS. Faltaban, y por eso republicar un aviso con vídeos pedía
        // volver a subirlos: llegaba el paquete contratado ("3 videos") sin
        // ningún vídeo detrás. No se bajan —serían 45 MB— sino que se marcan
        // para que Storage los copie en el servidor al publicar.
        setVideos((copia.videos ?? []).map((v) => ({
          file: v.file, name: v.name, duracion: 0,
          copiarDe: v.copiarDe, urlOrigen: v.urlOrigen,
        })));
        if (copia.pdf) setPdfFile({ file: copia.pdf.file, name: copia.pdf.name });
        // Es un aviso NUEVO: sin esto se editaría el original.
        draftListingId.current = null;
        adjuntosAlDia.current = false;
        toast({
          title: "Datos copiados del aviso",
          description: copia.faltanAdjuntos
            ? "No pudimos traer alguna imagen: revísalas antes de publicar."
            : "Revisa lo que quieras cambiar y publica.",
        });
      })
      .catch((e) => {
        if (vivo) {
          toast({
            title: "No se pudo copiar el aviso",
            description: e instanceof Error ? e.message : "Inténtalo de nuevo.",
            variant: "destructive",
          });
        }
      })
      .finally(() => { if (vivo) setCopiando(false); });
    return () => { vivo = false; };
    // Solo al montar: el parámetro de la URL se mira una vez.
  }, []);

  // "Editar aviso": llega ?editar=<id> desde Mis avisos, para un aviso ACTIVO
  // o pausado.
  //
  // Es la misma pantalla que crear a propósito: las validaciones, la compresión
  // de imágenes, el mapa y el control de adjuntos son idénticos, y tenerlos por
  // duplicado garantiza que dentro de unos meses el aviso creado valide una
  // cosa y el editado otra.
  //
  // Lo que NO se comparte es el cobro: en este modo el bloque de duración y
  // adicionales ni se pinta, y el botón dice "Guardar cambios". Que la
  // diferencia sea estructural y no una bandera dentro del mismo botón es
  // deliberado: un botón que a veces cobra acaba cobrando cuando no debe.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("editar");
    if (!id) return;
    let vivo = true;
    setCopiando(true);
    cargarAvisoParaContinuar(id, "editar")
      .then((b) => {
        if (!vivo) return;
        setForm(b.form);
        setCoords(b.lat != null && b.lng != null ? { lat: b.lat, lng: b.lng } : null);
        // La duración y los adicionales se cargan para saber CUÁNTOS adjuntos
        // caben —es lo que se pagó—, pero no se pueden cambiar desde aquí.
        setDuration(asDuracion(b.duration));
        setDurationChosen(true);
        setExtras(b.extras as ExtrasCount);
        if (b.mainPhoto) setMainPhoto(yaSubido(b.mainPhoto, 0));
        setExtraPhotos(b.extraPhotos.map((f, i) => yaSubido(f, i + 1)));
        setVideos(b.videos.map((v) => ({
          file: new File([], v.name), name: v.name, duracion: 0,
          estado: { fase: "lista" as const, subido: v.subido },
        })));
        if (b.pdf) setPdfFile({ file: new File([], b.pdf.name), name: b.pdf.name, estado: { fase: "lista", subido: b.pdf.subido } });
        setEditandoId(id);
        adjuntosAlDia.current = true;
      })
      .catch((e) => {
        if (vivo) {
          toast({
            title: "No se pudo abrir el aviso",
            description: e instanceof Error ? e.message : "Inténtalo de nuevo.",
            variant: "destructive",
          });
        }
      })
      .finally(() => { if (vivo) setCopiando(false); });
    return () => { vivo = false; };
  }, []);

  // "Continuar aviso": llega ?continuar=<id> desde Mis avisos › Borradores.
  //
  // Se parece a ?copiar= pero es lo contrario en lo que importa: aquí el aviso
  // es EL MISMO. Se ata `draftListingId` para que guardar y publicar actúen
  // sobre ese borrador en vez de crear otro, y los adjuntos que ya están en el
  // servidor se marcan como "lista" en lugar de descargarlos: no hay nada que
  // volver a subir.
  //
  // Existe porque los adicionales se contratan ANTES de subir el archivo, así
  // que se puede guardar un borrador que ya pagó tres vídeos y no tiene
  // ninguno. Al publicarlo saltaba el aviso de que faltaban y el modal de
  // editar no tenía dónde subirlos: el aviso quedaba atascado, sin forma de
  // completarlo ni de publicarlo. Aquí sí se puede.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("continuar");
    if (!id) return;
    let vivo = true;
    setCopiando(true);
    cargarAvisoParaContinuar(id)
      .then((b) => {
        if (!vivo) return;
        setForm(b.form);
        setCoords(b.lat != null && b.lng != null ? { lat: b.lat, lng: b.lng } : null);
        setDuration(asDuracion(b.duration));
        setDurationChosen(true);
        setExtras(b.extras as ExtrasCount);
        if (b.mainPhoto) setMainPhoto(yaSubido(b.mainPhoto, 0));
        setExtraPhotos(b.extraPhotos.map((f, i) => yaSubido(f, i + 1)));
        setVideos(b.videos.map((v) => ({
          file: new File([], v.name),
          name: v.name,
          // No se vuelve a medir: ya pasó el control de duración al subirlo.
          duracion: 0,
          estado: { fase: "lista" as const, subido: v.subido },
        })));
        if (b.pdf) setPdfFile({ file: new File([], b.pdf.name), name: b.pdf.name, estado: { fase: "lista", subido: b.pdf.subido } });
        // LA LÍNEA QUE LO DISTINGUE DE COPIAR: se sigue trabajando sobre este
        // aviso. Sin esto se crearía un borrador nuevo y el atascado seguiría
        // ahí, ahora por duplicado.
        draftListingId.current = id;
        adjuntosAlDia.current = true;
        toast({
          title: "Aviso cargado",
          description: "Completa lo que falta y publícalo.",
        });
      })
      .catch((e) => {
        if (vivo) {
          toast({
            title: "No se pudo cargar el aviso",
            description: e instanceof Error ? e.message : "Inténtalo de nuevo.",
            variant: "destructive",
          });
        }
      })
      .finally(() => { if (vivo) setCopiando(false); });
    return () => { vivo = false; };
  }, []);

  const packageBase = priceForDuration(quantity, duration, settings);
  // Se llama a `extrasTotal` en vez de rehacer la suma aquí: esta pantalla la
  // recalculaba a mano sobre EXTRA_DEFS, que solo tiene 5 de los 7 adicionales,
  // así que con una tarifa que cobre img100/pdf100 (como la sembrada en la BD)
  // las dos cuentas ya daban distinto.
  const extrasSum = extrasTotal(extras, duration, settings);
  const baseTotal = Math.round((packageBase + extrasSum) * 100) / 100;
  // Promoción vigente para la categoría elegida (si la hay).
  const activePromo = bestPromoForCategory(promos, form.category);
  const promoPct = activePromo?.discount_pct ?? 0;
  const total = applyDiscount(baseTotal, promoPct);
  // Costo EN CRÉDITOS (enteros). El dinero (soles) va en `total`/`baseTotal`.
  const baseCredits = solesToCredits(baseTotal);
  const totalCredits = solesToCredits(total);
  // Saldo TAL CUAL, sin redondear: con Math.round un saldo de 16.60 se mostraba
  // "S/ 17" aquí y "S/ 16.60" en la barra superior (IT3-016), y como redondeaba
  // hacia arriba, la comprobación de "¿me alcanza?" daba verde con hasta 0,49
  // menos de lo necesario y el fallo salía recién al cobrar. `formatCredits` ya
  // se encarga de mostrarlo con 2 decimales solo cuando los tiene.
  const balanceCredits = creditBalance;
  // Para la vista previa del aviso individual
  const basePrice = priceForDuration(1, duration, settings);

  // "Condición" solo aplica en categorías con condition_enabled (p.ej. NO en
  // Servicios ni Empleos). Cuando está oculta, el aviso se guarda como "No aplica".
  const selectedCategory = categories.find((c) => c.id === form.category);
  const conditionEnabled = selectedCategory?.conditionEnabled ?? true;
  const formForSubmit = conditionEnabled ? form : { ...form, condition: "na" };
  // EFFE-087: en "Empleo(s)" pedir "precio del producto" no encaja con una
  // vacante. Se detecta por el NOMBRE de la categoría (robusto ante slug/UUID),
  // el campo se muestra como "Salario" y es opcional (muchas vacantes van "a
  // convenir"). En cualquier otra categoría sigue siendo el precio obligatorio.
  const isEmpleo = /empleo/i.test(selectedCategory?.name ?? "");

  const updateForm = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  /**
   * Arranca la subida de un archivo y va contando su estado en el propio hueco.
   *
   * Se llama al ELEGIR el archivo, no al publicar: mientras el usuario escribe
   * el titulo y el precio, el archivo ya esta viajando. `aplicar` es lo que sabe
   * donde guardar el estado (portada, hueco N, video N, PDF) y comprueba que el
   * hueco siga siendo el mismo: si lo cambio mientras subia, el resultado que
   * llega tarde no debe pisar la foto nueva.
   */
  const arrancarSubida = (
    tipo: "imagen" | "video" | "pdf",
    ranura: string,
    file: File,
    aplicar: (estado: EstadoSubida) => void,
  ) => {
    const signal = abortoSubidas.current.signal;
    aplicar({ fase: "subiendo" });
    const tarea = (async () => {
      try {
        const userId = await dameUserId();
        // Sin sesion no hay ruta posible. No es un error que mostrar: al pulsar
        // "Publicar" se le manda a iniciar sesion y desde alli se sube.
        if (!userId) { aplicar({ fase: "espera" }); return; }
        const subido = await subirAdjunto(tipo, userId, idDeAviso(), ranura, file, { signal });
        if (signal.aborted) return;
        aplicar({ fase: "lista", subido });
      } catch (e) {
        if (signal.aborted) return;
        // No se avisa al usuario: publicar lo reintentara. Molestarle con un
        // error por algo que se va a arreglar solo seria ruido.
        aplicar({ fase: "error", motivo: e instanceof Error ? e.message : "fallo al subir" });
      }
    })();
    subidasEnVuelo.current.add(tarea);
    void tarea.finally(() => subidasEnVuelo.current.delete(tarea));
  };

  const pickPhoto = (slot: "main" | "extra", files: FileList | null) => {
    if (!files || files.length === 0) return;
    adjuntosAlDia.current = false;
    const f = files[0];
    // `accept="image/*"` es solo una sugerencia del selector; validamos de verdad
    // (antes se aceptaba hasta un .txt como "imagen principal").
    if (!f.type.startsWith("image/")) {
      toast({ title: "Debe ser una imagen", description: "Sube un archivo JPG, PNG o WebP.", variant: "destructive" });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "La imagen supera los 10 MB", description: "Sube una foto más liviana.", variant: "destructive" });
      return;
    }
    const item: PhotoItem = {
      id: `${slot}-${Date.now()}`,
      url: URL.createObjectURL(f),
      name: f.name,
      file: f,
    };
    const i = pickingSlot.current;
    if (slot === "main") {
      setMainPhoto(item);
    } else {
      setExtraPhotos((prev) => { const next = [...prev]; next[i] = item; return next; });
    }

    // Comprimir AQUÍ y no al publicar. Es el mismo trabajo, pero ocurre mientras
    // el usuario sigue rellenando el formulario en vez de acumularse entero en
    // el clic de "Publicar", que es donde se notaba (cuatro fotos de 10 MP eran
    // segundos de pantalla congelada). Si falla, se sube el original.
    void compressImage(f)
      .then((comprimida) => {
        // Si ni optimizada cabe, se retira el hueco en vez de subirla igual: es
        // el único momento en que se puede decir algo útil ("usa una más
        // liviana"), y hacerlo callando dejaba avisos con fotos de megas.
        if (comprimida.size > MAX_FOTO_BYTES) {
          toast({
            title: "Esa foto pesa demasiado",
            description: `Incluso optimizada supera los ${Math.round(MAX_FOTO_BYTES / 1024)} KB. Prueba con otra imagen o con una versión más pequeña.`,
            variant: "destructive",
          });
          if (slot === "main") setMainPhoto((prev) => (prev?.id === item.id ? null : prev));
          else setExtraPhotos((prev) => {
            if (prev[i]?.id !== item.id) return prev;
            const next = [...prev];
            next[i] = null;
            return next;
          });
          return;
        }
        const listo: PhotoItem = { ...item, file: comprimida, comprimida: true };
        if (slot === "main") {
          setMainPhoto((prev) => (prev?.id === item.id ? listo : prev));
        } else {
          setExtraPhotos((prev) => {
            if (prev[i]?.id !== item.id) return prev; // la cambió mientras tanto
            const next = [...prev];
            next[i] = listo;
            return next;
          });
        }

        // Y en cuanto esta optimizada, se manda. Aqui es donde se gana el tiempo
        // que antes se pagaba entero en el clic de "Publicar".
        const ranura = slot === "main" ? "portada" : `foto-${i + 1}`;
        arrancarSubida("imagen", ranura, comprimida, (estado) => {
          if (slot === "main") {
            setMainPhoto((prev) => (prev?.id === item.id ? { ...prev, estado } : prev));
          } else {
            setExtraPhotos((prev) => {
              if (prev[i]?.id !== item.id) return prev;
              const next = [...prev];
              next[i] = { ...next[i]!, estado };
              return next;
            });
          }
        });
      })
      .catch(() => {});
  };

  /**
   * Elige un vídeo. La duración se comprueba AQUÍ, leyendo los metadatos del
   * archivo: es la única forma de saberla sin decodificarlo en el servidor.
   */
  const pickVideo = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    setValidandoVideo(true);
    const r = await validarVideo(f);
    setValidandoVideo(false);
    if (!r.ok) {
      toast({ title: "No se puede usar ese video", description: r.motivo, variant: "destructive" });
      return;
    }
    adjuntosAlDia.current = false;
    // La posicion que ocupara: hace falta ANTES de meterlo, para que la ruta del
    // archivo y el hueco donde se guarda su estado sean el mismo.
    let posicion = -1;
    setVideos((prev) => {
      if (prev.length >= videosContratados) return prev;
      posicion = prev.length;
      return [...prev, { file: f, name: f.name, duracion: r.duracion }];
    });
    if (posicion < 0) return; // ya tenia todos los que compro

    // Un video son hasta 15 MB. Subirlo al elegirlo es lo que evita los minutos
    // de espera al publicar: es el caso donde mas se nota, con diferencia.
    arrancarSubida("video", `video-${posicion + 1}`, f, (estado) => {
      setVideos((prev) => {
        if (prev[posicion]?.file !== f) return prev; // lo quito mientras subia
        const next = [...prev];
        next[posicion] = { ...next[posicion], estado };
        return next;
      });
    });
  };

  // Abre el selector de archivo para el slot adicional `i`.
  const openExtraPicker = (i: number) => { pickingSlot.current = i; extraFileRef.current?.click(); };
  const removeExtraPhoto = (i: number) => {
    adjuntosAlDia.current = false;
    setExtraPhotos((prev) => {
      // Si ya estaba arriba, se borra del servidor: quitarla de la pantalla y
      // dejar el archivo ocupando sitio para siempre no es quitarla.
      const est = prev[i]?.estado;
      if (est?.fase === "lista") void borrarAdjunto("imagen", est.subido.path);
      const next = [...prev]; next[i] = null; return next;
    });
  };

  // Tope por adicional: "Imagen adicional" hasta MAX_EXTRA_IMAGES; el resto a la
  // cantidad de avisos (aquí siempre 1: un aviso por publicación).
  const maxForExtra = useCallback(
    (key: ExtraKey) => (key === "img500" ? MAX_EXTRA_IMAGES : key === "video20" ? MAX_VIDEOS : quantity),
    [quantity],
  );

  // Los adicionales se activan desde el paso 05 (abajo del todo), pero los
  // campos que habilitan —el PDF y las imágenes extra— viven en el paso 02
  // (arriba). Al aparecer, el documento crece POR ENCIMA del dedo y todo salta.
  // Chrome lo compensaría solo con scroll anchoring, pero WebKit no lo
  // implementa, así que se hace a mano: se anota el alto antes del cambio y,
  // ya pintado el campo nuevo, se corrige el scroll por la diferencia. El botón
  // queda justo donde estaba.
  const scrollAnchor = useRef<{ height: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = scrollAnchor.current;
    if (!anchor) return;
    scrollAnchor.current = null;
    const delta = document.documentElement.scrollHeight - anchor.height;
    if (delta !== 0) window.scrollTo({ top: anchor.y + delta });
  }, [extras]);

  const setExtraCount = (key: ExtraKey, count: number) => {
    const v = Math.max(0, Math.min(maxForExtra(key), count));
    scrollAnchor.current = { height: document.documentElement.scrollHeight, y: window.scrollY };
    setExtras((e) => ({ ...e, [key]: v }));
  };

  // Si cambia la cantidad, recortar extras a su máximo (img500 tiene su propio tope).
  useEffect(() => {
    setExtras((prev) => {
      const next: ExtrasCount = {};
      (Object.keys(prev) as ExtraKey[]).forEach((k) => {
        next[k] = Math.min(prev[k] ?? 0, maxForExtra(k));
      });
      return next;
    });
  }, [quantity, maxForExtra]);

  // Cuántos slots de imagen adicional mostrar (según el adicional comprado).
  const extraImageCount = Math.min(extras.img500 ?? 0, MAX_EXTRA_IMAGES);
  const hasPdfInPackage = (extras.pdf500 ?? 0) > 0;

  // "Urgente" solo se ofrece en avisos cortos (≤ 7 días): su fin es respuesta
  // inmediata. Con 15/30/60/90 días la opción no aparece.
  const urgenteAllowed = urgenteAllowedFor(duration);
  const visibleExtras = EXTRA_DEFS.filter((d) => d.key !== "urgente" || urgenteAllowed);

  // Si el usuario ya había marcado "Urgente" y luego elige una duración larga,
  // se quita solo: no se puede cobrar un adicional que ya no aplica.
  useEffect(() => {
    if (!urgenteAllowed && (extras.urgente ?? 0) > 0) {
      setExtras((e) => ({ ...e, urgente: 0 }));
    }
  }, [urgenteAllowed, extras.urgente]);

  // Vista previa REAL: el mismo componente ListingCard que se ve publicado, para
  // que las insignias (Destacado/Urgente/Confidencial), el marco dorado del
  // destacado y el contador de urgente se vean idénticos a lo que se publicará.
  const previewListing: Listing = {
    id: "preview",
    title: form.title || "Título de tu aviso",
    description: form.description || "",
    price: Number(form.price) || 0,
    currency: form.currency || "PEN",
    category: form.category || "categoría",
    location: form.location || "Ubicación",
    imageUrl: mainPhoto?.url || imagenPorDefecto(),
    date: new Date().toISOString().slice(0, 10),
    featured: (extras.destacado ?? 0) > 0,
    urgent: (extras.urgente ?? 0) > 0,
    confidential: (extras.confidencial ?? 0) > 0,
    advertiser: verifiedName || session?.name || "Anunciante",
    views: 0,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    // Vigencia estimada según la duración elegida → alimenta el contador de "Urgente".
    expiresAt: new Date(Date.now() + duration * 86_400_000).toISOString(),
  };

  // Al desactivar el adicional del PDF, se descarta el archivo elegido: el
  // apartado se oculta y no debe quedar un PDF "colgado" para publicar.
  useEffect(() => {
    if (!hasPdfInPackage && pdfFile) setPdfFile(null);
  }, [hasPdfInPackage, pdfFile]);

  // Vídeos contratados en el paquete. Si se baja la cantidad, sobran los
  // últimos: se descartan para no cobrar por lo que no se va a publicar.
  const videosContratados = Math.min(extras.video20 ?? 0, MAX_VIDEOS);
  useEffect(() => {
    setVideos((prev) => (prev.length > videosContratados ? prev.slice(0, videosContratados) : prev));
  }, [videosContratados]);

  // Elige el PDF adjunto (valida tipo y tamaño ≤ 500 KB).
  const pickPdf = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (f.type !== "application/pdf") {
      toast({ title: "Debe ser un PDF", variant: "destructive" });
      return;
    }
    if (f.size > 500 * 1024) {
      toast({ title: "El PDF supera los 500 KB", description: "Sube un archivo más liviano.", variant: "destructive" });
      return;
    }
    adjuntosAlDia.current = false;
    setPdfFile({ file: f, name: f.name });
    arrancarSubida("pdf", "documento", f, (estado) => {
      setPdfFile((prev) => (prev?.file === f ? { ...prev, estado } : prev));
    });
  };

  const persistDraftForLogin = (resumeAtSummary: boolean) => {
    try {
      // Ni `verified` ni `verifiedName` se guardan: el borrador vive en
      // localStorage, donde el usuario puede editarlo, y al restaurarlo se
      // ignoran de todos modos. La verificación se rehace tras el login.
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        form, coords, duration, quantity, extras, personType, docNumber,
        resumeAtSummary,
      }));
    } catch { /* noop */ }
  };

  // El salario es opcional en Empleo (EFFE-087); en el resto el precio es
  // obligatorio. La FOTO no lo es: quien no suba ninguna publica igual y su
  // aviso sale con la imagen de la marca (FALLBACK_IMG). Es mejor un aviso
  // publicado sin foto que un anunciante que abandona por no tener una a mano.
  // Dentro del Perú hace falta el departamento (es por lo que se filtra); fuera
  // no existe, y lo que ubica el aviso es la referencia escrita.
  const ubicacionLista = esPeru(form.country) ? !!form.department : !!form.location.trim();
  const canPublish = form.category && form.title && form.description && (isEmpleo || form.price) && ubicacionLista;

  // Guarda el aviso en la BD como borrador y devuelve su id. No navega ni avisa:
  // lo usan el botón "Guardar en mis borradores" y el pago-y-publica, que
  // necesita que el aviso exista para poder atarle la orden.
  /** Lo ya subido viaja con cada adjunto: publicar no vuelve a mandarlo. */
  const subidoDe = (estado?: EstadoSubida) => (estado?.fase === "lista" ? estado.subido : undefined);

  /** Los adjuntos del aviso tal como los espera publish.ts, con su subida hecha. */
  const adjuntosParaGuardar = () => ({
    mainPhoto: mainPhoto
      ? { file: mainPhoto.file, name: mainPhoto.name, comprimida: mainPhoto.comprimida, subido: subidoDe(mainPhoto.estado) }
      : null,
    extraPhotos: extraPhotos.slice(0, extraImageCount)
      .filter((p): p is PhotoItem => !!p)
      .map((p) => ({ file: p.file, name: p.name, comprimida: p.comprimida, subido: subidoDe(p.estado) })),
    pdf: hasPdfInPackage && pdfFile
      ? { file: pdfFile.file, name: pdfFile.name, subido: subidoDe(pdfFile.estado) }
      : null,
    videos: videos.map((v) => ({
      file: v.file, name: v.name, subido: subidoDe(v.estado),
      // Solo en una republicación: le dice a Storage que duplique el vídeo del
      // aviso original en vez de subir el archivo (que aquí va vacío).
      copiarDe: v.copiarDe, urlOrigen: v.urlOrigen,
    })),
  });

  /** Todos los adjuntos con su estado, para contar el progreso por peso. */
  const adjuntosConEstado = (): Adjunto[] => {
    const out: Adjunto[] = [];
    const meter = (file: File | undefined, estado?: EstadoSubida) => {
      if (file) out.push({ file, estado: estado ?? { fase: "espera" } });
    };
    meter(mainPhoto?.file, mainPhoto?.estado);
    for (const p of extraPhotos.slice(0, extraImageCount)) meter(p?.file, p?.estado);
    if (hasPdfInPackage) meter(pdfFile?.file, pdfFile?.estado);
    for (const v of videos) meter(v.file, v.estado);
    return out;
  };

  // Cuanto queda por subir. Se calcula una vez por render y se comparte: el
  // estado de cada adjunto vive en su propio hueco y cambia por su cuenta.
  const adjuntosAhora = adjuntosConEstado();
  const avanceSubida = porcentajeSubido(adjuntosAhora);
  const pendienteDeSubir = textoDePendiente(adjuntosAhora);

  const guardarBorradorEnBD = async (): Promise<string> => {
    const id = await saveListingDraft({
      form: formForSubmit, lat: coords?.lat ?? null, lng: coords?.lng ?? null,
      quantity, duration, extras,
      ...adjuntosParaGuardar(),
      draftId: draftListingId.current,
      idReservado: idReservado.current,
    });
    draftListingId.current = id;
    adjuntosAlDia.current = true;
    // El borrador local ya no hace falta: la fuente de verdad pasa a ser la BD.
    localStorage.removeItem(DRAFT_KEY);
    return id;
  };

  // Publica según el saldo disponible. La identidad ya viene precargada del
  // perfil (verificada al comprar saldo): no se abre ningún modal de verificación.
  const openPublishFlowAfterVerify = async () => {
    if (balanceCredits >= totalCredits) {
      // Tiene créditos: se publica directo y se descuenta (sin cuadro de pagos).
      doPublish();
      return;
    }
    // No le alcanza: se cobra en el acto solo lo que falta. Para eso el aviso
    // tiene que existir ya en la BD (con sus fotos subidas), porque la orden va
    // atada a él y es el servidor quien lo publica al confirmarse el pago.
    if (savingDraftRef.current || publishingRef.current) return;
    savingDraftRef.current = true;
    setSavingDraft(true);
    try {
      const id = await guardarBorradorEnBD();
      setPagarPublicar({
        listingId: id,
        title: form.title,
        costCredits: totalCredits,
        durationDays: duration,
      });
      setBuyCreditsOpen(true);
    } catch (err: unknown) {
      toast({
        title: "No se pudo preparar el pago",
        description: err instanceof Error ? err.message : "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      savingDraftRef.current = false;
      setSavingDraft(false);
    }
  };

  /**
   * Lo que un aviso necesita para salir al público.
   *
   * Vive aparte porque lo usan PUBLICAR y GUARDAR CAMBIOS, y tienen que exigir
   * lo mismo: si editar validara menos, se podría dejar sin descripción un aviso
   * que ya está en el escaparate. Se entra con un aviso completo y se sale con
   * uno peor.
   *
   * `conDuracion` es la única diferencia: al editar no se elige duración —el
   * bloque ni se pinta, es lo que ya se pagó—, así que exigirla dejaría el
   * guardado bloqueado por un campo que no está en pantalla.
   */
  const reglasDelAviso = (conDuracion: boolean) => {
    const precioNum = Number(form.price);
    return [
      { campo: "categoria", ok: !!form.category, mensaje: "Elige la categoría de tu aviso." },
      { campo: "titulo", ok: !!form.title.trim(), mensaje: "Ponle un título a tu aviso." },
      { campo: "descripcion", ok: !!form.description.trim(), mensaje: "Describe lo que ofreces." },
      {
        campo: "precio",
        ok: isEmpleo ? form.price === "" || (Number.isFinite(precioNum) && precioNum >= 0)
                     : form.price !== "" && Number.isFinite(precioNum) && precioNum >= 0,
        mensaje: form.price !== "" && precioNum < 0
          ? "El precio no puede ser negativo."
          : "Indica el precio del producto.",
      },
      {
        campo: "ubicacion",
        ok: ubicacionLista,
        mensaje: esPeru(form.country)
          ? "Marca la ubicación de tu aviso en el mapa."
          : "Escribe la ciudad o referencia de tu aviso.",
      },
      ...(conDuracion
        // EFFE-097: publicar exige haber elegido una duración de forma explícita.
        ? [{ campo: "duracion", ok: durationChosen, mensaje: "Selecciona cuántos días durará tu aviso." }]
        : []),
    ];
  };

  const openPublishFlow = () => {
    // Un toast que dice "faltan campos" obliga a buscar cuál: ahora se marca el
    // campo, se baja hasta él y se le da el foco. El toast queda de resumen.
    const reglas = reglasDelAviso(true);
    if (!val.validar(reglas)) {
      const fallo = reglas.find((r) => !r.ok)!;
      toast({ title: "Falta un dato", description: fallo.mensaje, variant: "destructive" });
      return;
    }
    // Los adicionales se pagan por contratarlos, no por usarlos: publicar con
    // tres huecos de video vacíos son tres videos cobrados. Se avisa y se para
    // ANTES de cobrar nada.
    const faltan = adicionalesQueFaltan(extras, {
      imagenesExtra: extraPhotos.slice(0, extraImageCount).filter(Boolean).length,
      tienePdf: !!pdfFile,
      videos: videos.length,
    });
    if (faltan.length > 0) {
      toast({
        title: "Te falta subir lo que contrataste",
        description: resumenDeFaltantes(faltan),
        variant: "destructive",
      });
      enfocarCampo("adicionales");
      return;
    }

    if (!session) {
      persistDraftForLogin(true);
      toast({ title: "Inicia sesión para publicar", description: "Te llevamos al login y retomamos tu publicación." });
      navigate("/auth?redirect=/dashboard/anunciante/publicar");
      return;
    }
    // Único modal: confirmar la publicación. La identidad ya está verificada
    // (perfil), así que no se abre ningún cuadro de verificación.
    setConfirmOpen(true);
  };

  const confirmAndPublish = () => {
    setConfirmOpen(false);
    openPublishFlowAfterVerify();
  };

  // Tras publicar con éxito dejamos el formulario vacío. Así, cerrar el modal de
  // confirmación con Esc / clic afuera / la X ya no deja al usuario frente a un
  // formulario completo que puede volver a enviar: `canPublish` pasa a false y
  // republicar el mismo aviso se vuelve imposible por construcción.
  const resetPublishForm = () => {
    setForm({ category: "", title: "", description: "", price: "", currency: "PEN", department: "", location: "", condition: "nuevo", country: paisPreferido().code });
    setMainPhoto(null);
    setExtraPhotos(Array(MAX_EXTRA_IMAGES).fill(null));
    setCoords(null);
    setExtras({});
    setDuration(7);
    setPdfFile(null);
    setVideos([]);
    draftListingId.current = null; // el borrador ya se convirtió en aviso publicado
    // Cortar lo que siguiera subiendo y soltar el id: el aviso siguiente es OTRO
    // aviso, y si compartiera identificador sus fotos irian a la carpeta del que
    // se acaba de publicar.
    abortoSubidas.current.abort();
    abortoSubidas.current = new AbortController();
    subidasEnVuelo.current.clear();
    idReservado.current = null;
    localStorage.removeItem(DRAFT_KEY);
  };

  /**
   * Guarda los cambios de un aviso YA PUBLICADO. No cobra y no toca el plan.
   *
   * Reutiliza `adjuntosParaGuardar()`, así que lo que ya estaba subido se
   * reinserta apuntando al mismo sitio y solo viaja lo que el usuario cambió.
   */
  const guardarEdicion = async () => {
    if (!editandoId) return;

    // Las MISMAS reglas que publicar. El aviso ya está en el escaparate: salir
    // de aquí con menos de lo que exigía entrar sería empeorarlo.
    const reglas = reglasDelAviso(false);
    if (!val.validar(reglas)) {
      const fallo = reglas.find((r) => !r.ok)!;
      toast({ title: "Falta un dato", description: fallo.mensaje, variant: "destructive" });
      return;
    }
    // Y lo contratado sigue teniendo que estar: si al editar se pudiera quitar
    // el vídeo que se pagó, el aviso quedaría cobrado y sin él.
    const faltan = adicionalesQueFaltan(extras, {
      imagenesExtra: extraPhotos.slice(0, extraImageCount).filter(Boolean).length,
      tienePdf: !!pdfFile,
      videos: videos.length,
    });
    if (faltan.length > 0) {
      toast({
        title: "Te falta subir lo que contrataste",
        description: resumenDeFaltantes(faltan),
        variant: "destructive",
      });
      return;
    }

    setSavingDraft(true);
    try {
      await guardarCambiosDeAviso(editandoId, {
        form: form as never,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        quantity,
        duration,
        extras,
        ...adjuntosParaGuardar(),
      });
      toast({ title: "Cambios guardados", description: "Tu aviso se actualizó." });
      navigate("/dashboard/anunciante/avisos");
    } catch (e) {
      toast({
        title: "No se pudieron guardar los cambios",
        description: mensajeDeError(e, "Inténtalo de nuevo."),
        variant: "destructive",
      });
    } finally {
      setSavingDraft(false);
    }
  };

  // "Guardar en mis borradores": deja el aviso en la BD con status=draft, sin
  // cobrar ni pedir identidad. Guardar dos veces actualiza el mismo aviso.
  const saveDraft = async () => {
    if (savingDraftRef.current || publishingRef.current) return;

    // Sin sesión no hay dónde guardarlo (owner_id): guardamos el borrador local
    // y lo retomamos tras el login, igual que hace "Publicar".
    if (!session) {
      persistDraftForLogin(false);
      toast({ title: "Inicia sesión para guardar", description: "Te llevamos al login y retomamos tu aviso." });
      navigate("/auth?redirect=/dashboard/anunciante/publicar");
      return;
    }
    // `title` y `category_id` son NOT NULL en la BD: sin ellos no hay borrador.
    if (!form.title.trim() || !form.category) {
      toast({
        title: "Falta lo mínimo para guardar",
        description: "Ponle al menos un título y una categoría al aviso.",
        variant: "destructive",
      });
      return;
    }

    savingDraftRef.current = true;
    setSavingDraft(true);
    try {
      await esperarSubidas();
      await guardarBorradorEnBD();
      toast({
        title: "Guardado en tus borradores",
        description: "Lo encuentras en Mis avisos › Borradores. Puedes publicarlo cuando quieras.",
      });
      // Flujo pedido: tras guardar, llevar al usuario a Mis avisos › Borradores.
      navigate("/dashboard/anunciante/avisos?tab=borradores");
    } catch (err: unknown) {
      toast({
        title: "No se pudo guardar el borrador",
        description: err instanceof Error ? err.message : "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      savingDraftRef.current = false;
      setSavingDraft(false);
    }
  };

  // Aquí vivía `chargePendingListing`, para cobrar un aviso que había quedado
  // publicado pero cuyo descuento falló. Ese estado ya no existe: desde la
  // migración 0091 publicar y cobrar son una sola operación, así que o pasan
  // las dos cosas o no pasa ninguna.

  const doPublish = async () => {
    // Ref, no state: cierra la ventana entre dos clics dentro del mismo render.
    if (publishingRef.current) return;
    if (!session) {
      persistDraftForLogin(true);
      navigate("/auth?redirect=/dashboard/anunciante/publicar");
      return;
    }
    const email = userEmail || "anunciante@effe.pe";
    const tipoDoc = personType === "juridica" ? "ruc" : "dni";
    publishingRef.current = true;
    setPublishing(true);
    try {
      // Esperar lo que siga subiendo. En el caso normal esto no espera nada —los
      // archivos ya subieron mientras el usuario rellenaba— y "Publicar" es
      // instantaneo. Solo espera a quien fue mas rapido que su conexion, y
      // entonces espera lo que falte, no la subida entera desde cero.
      await esperarSubidas();
      // 1) Crear el aviso y publicarlo. Si ya existe en la BD con estos mismos
      //    adjuntos (caso típico: se pagó el faltante y volvemos a rematar),
      //    se salta la creación y las subidas y se publica y punto.
      const datosDeCobro = {
        quantity,
        duration,
        extras,
        total,
        receiptType: "boleta" as const,
        email,
        advertiserName: verifiedName || session?.name || "Anunciante",
        docType: tipoDoc as "dni" | "ruc",
        docNumber: docNumber || undefined,
      };
      if (draftListingId.current && adjuntosAlDia.current) {
        const { published: yaPublicado } = await finalizeListingPublication(draftListingId.current, datosDeCobro);
        setSuccessOpen({ open: true, number: "", email });
        resetPublishForm();
        void getCreditBalance().then(setCreditBalance).catch(() => {});
        if (!yaPublicado) {
          toast({
            title: "Aviso pendiente de activación",
            description: "Se descontó tu saldo, pero el aviso quedó pendiente de activación. Nuestro equipo lo revisará.",
          });
        }
        return;
      }
      const { listingId, published } = await createAndPublishListing({
        form: formForSubmit,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        quantity,
        duration,
        extras,
        total,
        // Si ya se guardó como borrador, se publica ESE aviso: sin esto quedarían
        // dos, uno en borradores y otro activo.
        draftId: draftListingId.current,
        ...adjuntosParaGuardar(),
        idReservado: idReservado.current,
        receiptType: "boleta",
        email,
        advertiserName: verifiedName || session?.name || "Anunciante",
        docType: tipoDoc,
        docNumber: docNumber || undefined,
      }, (hechas, totalFotos) => setSubiendo({ hechas, total: totalFotos }));

      // 2) Publicado y saldo descontado. NO se emite boleta al publicar: el
      //    comprobante ya se emitió al comprar los créditos. Confirmamos y
      //    vaciamos el formulario para que no se pueda reenviar.
      setSuccessOpen({ open: true, number: "", email });
      resetPublishForm();

      // 3) El saldo ya se descontó dentro de `publish_listing`. Refrescar lo que
      //    se enseña va DESPUÉS del "¡Aviso publicado!": antes esta consulta se
      //    esperaba antes de dar la buena noticia, y retrasaba el mensaje medio
      //    segundo sin aportarle nada.
      void getCreditBalance().then(setCreditBalance).catch(() => {});
      if (!published) {
        toast({
          title: "Aviso pendiente de activación",
          description: "Se descontó tu saldo, pero el aviso quedó pendiente de activación. Nuestro equipo lo revisará.",
        });
      }
    } catch (e) {
      // Sin saldo no se publicó NI se cobró, y el aviso sigue guardado como
      // borrador: se ofrece comprar saldo y desde ahí se publica.
      if (e instanceof SaldoInsuficiente) {
        // El aviso ya existe (con sus fotos subidas): al reintentar hay que
        // publicar ESE. Sin esto, comprar saldo y volver a publicar dejaría dos.
        if (e.listingId) { draftListingId.current = e.listingId; adjuntosAlDia.current = true; }
        const saldoReal = await getCreditBalance();
        setCreditBalance(saldoReal);
        toast({
          title: "Te falta saldo para publicar",
          description: "Paga aquí mismo lo que falta y tu aviso se publica solo.",
          variant: "destructive",
        });
        // Con el aviso identificado se cobra solo el faltante y lo publica el
        // servidor. Si no hay aviso, o si el saldo que devuelve la BD ya
        // cubriría el costo (entonces el rechazo viene de otra cosa y no hay
        // "faltante" que cobrar), se cae al configurador de saldo de siempre.
        setPagarPublicar(
          e.listingId && saldoReal < totalCredits
            ? { listingId: e.listingId, title: form.title, costCredits: totalCredits, durationDays: duration }
            : null,
        );
        setBuyCreditsOpen(true);
        return;
      }
      toast({
        title: "No se pudo publicar",
        description: e instanceof Error ? e.message : "Intenta nuevamente.",
        variant: "destructive",
      });
    } finally {
      publishingRef.current = false;
      setPublishing(false);
      setSubiendo(null);
    }
  };


  // Lo que marca el medidor es lo que hace falta para publicar, ni más ni menos.
  // Antes contaba la foto (que ya no es obligatoria) y la referencia de
  // ubicación (que nunca lo fue), y en cambio se saltaba el departamento, que sí
  // lo es: se podía llegar al 100% con el botón de publicar deshabilitado.
  const completion = (() => {
    const fields = [
      form.category, form.title, form.description,
      isEmpleo ? "n/a" : form.price, // el salario es opcional en Empleo
      // Fuera del Perú no hay departamento: cuenta la referencia escrita.
      esPeru(form.country) ? form.department : form.location,
    ];
    const filled = fields.filter((v) => v && v.trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
  })();

  // Mientras se verifica la sesión (o se redirige al login) no mostramos el formulario.
  if (!authChecked) {
    return (
      <DashboardLayout role="anunciante">
        <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
          Verificando tu sesión…
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="anunciante">
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-secondary mb-2">Nuevo aviso</p>
            <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">Publica con calidad profesional</h1>
            <p className="text-sm text-muted-foreground mt-1">Una buena ficha multiplica tus contactos.</p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2 min-w-[180px]">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              <span className="font-bold text-foreground">{completion}%</span> completado
            </div>
            <div className="w-full md:w-44 h-1.5 bg-muted overflow-hidden">
              <div className="h-full bg-secondary transition-all" style={{ width: `${completion}%` }} />
            </div>
            {docVerified && (
              <Badge variant="outline" className="text-success border-success/30 bg-success/10 gap-1">
                <ShieldCheck size={11} /> {personType === "natural" ? "DNI" : "RUC"} verificado
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Basics */}
            <Card>
              <CardHeader className="border-b">
                {/* items-start + shrink-0 + min-w-0: sin ellos el cuadro del
                    número se estrechaba cuando el título no cabía (deja de ser
                    cuadrado) y quedaba a media altura entre título y
                    descripción, así que los cinco pasos se veían de distinto
                    tamaño y desalineados entre sí. */}
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 shrink-0 aspect-square bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">01</span>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2"><Tag size={16} className="text-secondary" /> Categoría y título</CardTitle>
                    <CardDescription className="text-xs">Clasifica tu aviso para que llegue al público correcto.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                <div {...val.props("categoria")}>
                  <Label>Categoría *</Label>
                  {/* Bloqueada al editar: cambiar de categoría mueve el aviso de
                      sitio en el buscador y le cambia las promociones que le
                      aplican. Lo que se compró como "Vehículos" se queda ahí. */}
                  <Select value={form.category} onValueChange={(v) => updateForm("category", v)} disabled={!!editandoId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <MensajeDeError campo="categoria" errores={val.errores} />
                </div>
                <div {...val.props("titulo")}>
                  <Label>Título del aviso *</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => updateForm("title", e.target.value)}
                    placeholder="Ej: Departamento 3 dormitorios en Miraflores"
                    maxLength={80}
                    className="mt-1"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">{form.title.length}/80</p>
                  <MensajeDeError campo="titulo" errores={val.errores} />
                </div>
              </CardContent>
            </Card>

            {/* Step 2: Photos — 2 slots por aviso */}
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 shrink-0 aspect-square bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">02</span>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2"><Camera size={16} className="text-secondary" /> Imágenes del aviso</CardTitle>
                    <CardDescription className="text-xs">
                      Opcional: si no subes ninguna, tu aviso saldrá con la imagen de eFFe.
                      La principal va incluida y con el adicional “Imagen adicional” puedes sumar hasta 3 más (4 en total).
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Slot 1 — Principal */}
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { pickPhoto("main", e.target.files); if (fileRef.current) fileRef.current.value = ""; }}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="relative w-full aspect-[4/3] border-2 border-dashed border-border hover:border-secondary/60 hover:bg-muted/30 transition-colors flex items-center justify-center overflow-hidden bg-muted/20"
                  >
                    {mainPhoto ? (
                      <>
                        <img src={mainPhoto.url} alt="Principal" className="absolute inset-0 w-full h-full object-cover" />
                        <span className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-secondary text-secondary-foreground text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1">
                          <Star size={10} className="fill-current" /> Portada
                        </span>
                        <span
                          role="button"
                          aria-label="Quitar imagen principal"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMainPhoto((prev) => {
                              if (prev?.estado?.fase === "lista") void borrarAdjunto("imagen", prev.estado.subido.path);
                              return null;
                            });
                          }}
                          className="absolute top-1.5 right-1.5 w-7 h-7 bg-white text-destructive flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <X size={14} />
                        </span>
                      </>
                    ) : (
                      <div className="text-center px-4">
                        <ImagePlus size={28} className="mx-auto text-muted-foreground mb-2" />
                        <p className="text-xs font-semibold text-foreground">Imagen principal</p>
                        <p className="text-[11px] text-muted-foreground">Opcional · incluida · la optimizamos por ti</p>
                      </div>
                    )}
                  </button>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">Imagen principal</span> — incluida sin costo. Súbela tal como la tienes: la optimizamos automáticamente.
                  </p>
                </div>

                {/* Input compartido para las imágenes adicionales (retargeteado por slot). */}
                <input
                  ref={extraFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { pickPhoto("extra", e.target.files); if (extraFileRef.current) extraFileRef.current.value = ""; }}
                />

                {/* Slots de imagen adicional: uno por cada "Imagen adicional" comprada. */}
                {extraImageCount === 0 ? (
                  <div>
                    <div className="relative w-full aspect-[4/3] border-2 border-dashed border-border bg-muted/40 flex items-center justify-center opacity-80">
                      <div className="text-center px-4">
                        <Lock size={24} className="mx-auto text-muted-foreground mb-2" />
                        <p className="text-xs font-semibold text-foreground">Imagen adicional</p>
                        <p className="text-[11px] text-muted-foreground">Hasta 500 KB · hasta 3</p>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-warning">
                      Activa “Imagen adicional” en los adicionales para subir hasta 3 imágenes más.
                    </p>
                  </div>
                ) : (
                  Array.from({ length: extraImageCount }).map((_, i) => {
                    const photo = extraPhotos[i];
                    return (
                      <div key={i}>
                        <button
                          type="button"
                          onClick={() => openExtraPicker(i)}
                          className="relative w-full aspect-[4/3] border-2 border-dashed border-border hover:border-secondary/60 hover:bg-muted/30 bg-muted/20 transition-colors flex items-center justify-center overflow-hidden"
                        >
                          {photo ? (
                            <>
                              <img src={photo.url} alt={`Imagen adicional ${i + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                              <span
                                role="button"
                                aria-label={`Quitar imagen adicional ${i + 1}`}
                                onClick={(e) => { e.stopPropagation(); removeExtraPhoto(i); }}
                                className="absolute top-1.5 right-1.5 w-7 h-7 bg-white text-destructive flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
                              >
                                <X size={14} />
                              </span>
                            </>
                          ) : (
                            <div className="text-center px-4">
                              <ImagePlus size={28} className="mx-auto text-muted-foreground mb-2" />
                              <p className="text-xs font-semibold text-foreground">Imagen adicional {i + 1}</p>
                              <p className="text-[11px] text-muted-foreground">Disponible · hasta 500 KB</p>
                            </div>
                          )}
                        </button>
                      </div>
                    );
                  })
                )}

                {/* PDF adjunto — el apartado aparece solo si el adicional está activo. */}
                {hasPdfInPackage && (
                  <div className="sm:col-span-2">
                    <input
                      ref={pdfFileRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => { pickPdf(e.target.files); if (pdfFileRef.current) pdfFileRef.current.value = ""; }}
                    />
                    {pdfFile ? (
                      <div className="flex items-center gap-3 p-3 border border-secondary/40 bg-secondary/5">
                        <FileText size={18} className="text-secondary shrink-0" />
                        <span className="text-sm font-medium text-foreground truncate flex-1">{pdfFile.name}</span>
                        <button
                          type="button"
                          onClick={() => { adjuntosAlDia.current = false; setPdfFile(null); }}
                          className="w-7 h-7 flex items-center justify-center text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          aria-label="Quitar PDF"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => pdfFileRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border hover:border-secondary/60 hover:bg-muted/30 transition-colors"
                      >
                        <FileText size={22} className="text-muted-foreground" />
                        <div className="text-left">
                          <p className="text-sm font-semibold text-foreground">Adjuntar PDF</p>
                          <p className="text-[11px] text-muted-foreground">hasta 500 KB · se mostrará en tu aviso</p>
                        </div>
                      </button>
                    )}
                  </div>
                )}

                {/* Vídeos — el apartado aparece solo si el adicional está activo. */}
                {videosContratados > 0 && (
                  <div className="sm:col-span-2 space-y-2">
                    <input
                      ref={videoFileRef}
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm"
                      className="hidden"
                      onChange={(e) => { void pickVideo(e.target.files); if (videoFileRef.current) videoFileRef.current.value = ""; }}
                    />
                    {videos.map((v, i) => (
                      <div key={`${v.name}-${i}`} className="flex items-center gap-3 p-3 border border-secondary/40 bg-secondary/5">
                        <Video size={18} className="text-secondary shrink-0" />
                        <span className="text-sm font-medium text-foreground truncate flex-1">{v.name}</span>
                        <span className="text-[11px] text-muted-foreground shrink-0">{Math.round(v.duracion)} s</span>
                        <button
                          type="button"
                          onClick={() => { adjuntosAlDia.current = false; setVideos((prev) => prev.filter((_, k) => k !== i)); }}
                          className="w-7 h-7 flex items-center justify-center text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          aria-label={`Quitar ${v.name}`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    {videos.length < videosContratados && (
                      <button
                        type="button"
                        onClick={() => videoFileRef.current?.click()}
                        disabled={validandoVideo}
                        className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border hover:border-secondary/60 hover:bg-muted/30 transition-colors disabled:opacity-60"
                      >
                        {validandoVideo
                          ? <Loader2 size={22} className="animate-spin text-muted-foreground" />
                          : <Video size={22} className="text-muted-foreground" />}
                        <div className="text-left">
                          <p className="text-sm font-semibold text-foreground">
                            {validandoVideo ? "Revisando el video…" : `Agregar video (${videos.length}/${videosContratados})`}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            hasta {MAX_SEGUNDOS} segundos · MP4, MOV o WebM
                          </p>
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 3: Description */}
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 shrink-0 aspect-square bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">03</span>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2"><FileText size={16} className="text-secondary" /> Descripción</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5" {...val.props("descripcion")}>
                <Textarea
                  value={form.description}
                  onChange={(e) => updateForm("description", e.target.value)}
                  placeholder="Describe tu producto o servicio…"
                  className="min-h-[160px]"
                  maxLength={2000}
                />
                <p className="text-[11px] text-muted-foreground mt-1">{form.description.length}/2000</p>
                <MensajeDeError campo="descripcion" errores={val.errores} />
              </CardContent>
            </Card>

            {/* Step 4: Price & location */}
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 shrink-0 aspect-square bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">04</span>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2"><MapPin size={16} className="text-secondary" /> Precio y ubicación</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2" {...val.props("precio")}>
                    <Label>{isEmpleo ? "Salario / Remuneración (opcional)" : "Precio del producto *"}</Label>
                    <Input type="number" min={0} step="0.01" inputMode="decimal" value={form.price} onChange={(e) => updateForm("price", e.target.value)} placeholder={isEmpleo ? "Opcional — déjalo vacío si es a convenir" : "0.00"} className="mt-1" />
                    <MensajeDeError campo="precio" errores={val.errores} />
                  </div>
                  <div>
                    <Label>Moneda</Label>
                    <Select value={form.currency} onValueChange={(v) => updateForm("currency", v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PEN">PEN (S/)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div {...val.props("ubicacion")}>
                <LocationPicker
                  department={form.department || null}
                  onDepartmentChange={(v) => updateForm("department", v ?? "")}
                  country={form.country || "PE"}
                  onCountryChange={(code) => { updateForm("country", code); guardarPais(code); }}
                  location={form.location}
                  onLocationChange={(v) => updateForm("location", v)}
                  lat={coords?.lat ?? null}
                  lng={coords?.lng ?? null}
                  onCoordsChange={(la, ln) =>
                    setCoords(la != null && ln != null ? { lat: la, lng: ln } : null)
                  }
                  required
                />
                <MensajeDeError campo="ubicacion" errores={val.errores} />
                </div>
                {conditionEnabled && (
                  <div className="sm:w-1/2">
                    <Label>Condición</Label>
                    <Select value={form.condition} onValueChange={(v) => updateForm("condition", v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nuevo">Nuevo</SelectItem>
                        <SelectItem value="usado">Usado</SelectItem>
                        <SelectItem value="reacondicionado">Reacondicionado</SelectItem>
                        <SelectItem value="na">No aplica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 5: Paquete (cantidad + duración + adicionales).
                EDITANDO no se pinta: la duración y los adicionales son lo que el
                usuario PAGÓ. Si se pudieran tocar aquí, editar sería una forma
                de alargar la vigencia o contratar adicionales gratis. Y a la
                inversa, bajar de tres vídeos a uno no devuelve dinero. */}
            {!editandoId && (
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 shrink-0 aspect-square bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">05</span>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2"><Package size={16} className="text-secondary" /> Duración y adicionales</CardTitle>
                    <CardDescription className="text-xs">Elige cuántos días durará tu aviso y qué extras quieres. El precio se calcula al instante.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5 space-y-6">
                {/* Duración */}
                <div {...val.props("duracion")}>
                  <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Duración del aviso</Label>
                  <div className="mt-2 grid grid-cols-3 md:grid-cols-6 gap-2">
                    {DURATIONS.map((d) => {
                      const p = priceForDuration(1, d, settings);
                      const active = durationChosen && duration === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => { setDuration(d); setDurationChosen(true); }}
                          className={`border p-3 text-center transition-all ${
                            active ? "border-secondary bg-secondary/10 ring-2 ring-secondary/30" : "border-border hover:border-secondary/40 hover:bg-muted/50"
                          }`}
                        >
                          <p className="text-lg font-extrabold text-foreground">{d}</p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">días</p>
                          <p className="text-xs font-bold text-secondary mt-1">{formatSoles(p)}</p>
                        </button>
                      );
                    })}
                  </div>
                  <MensajeDeError campo="duracion" errores={val.errores} />
                </div>

                {/* Adicionales opcionales */}
                <div data-campo="adicionales">
                  <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Adicionales opcionales</Label>
                  {/* El precio del adicional es POR DÍA, así que hay que decirlo
                      donde se decide y no dejar que se descubra en el total. */}
                  <p className="text-[11px] text-muted-foreground mt-1 mb-2">
                    Actívalos con “+”. <strong className="font-semibold text-foreground">El precio de cada adicional es por día</strong>, así que se multiplica por los {duration} días que dura tu aviso.
                  </p>
                  {!urgenteAllowed && (
                    <p className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Flame size={12} className="text-muted-foreground shrink-0" />
                      “Urgente” solo está disponible en avisos de hasta {URGENTE_MAX_DAYS} días.
                    </p>
                  )}
                  <div className="space-y-2">
                    {visibleExtras.map(({ key, label, sub, help, icon: Icon }) => {
                      const count = extras[key] ?? 0;
                      const unit = settings.extras[key as keyof ExtraPrices] ?? 0;
                      return (
                        <div key={key} className={`flex items-center gap-3 p-3 border transition-all ${count > 0 ? "border-secondary bg-secondary/5" : "border-border"}`}>
                          <Icon size={16} className="text-secondary" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground leading-tight flex items-center gap-1.5">
                              {label}
                              <InfoHint label={`Qué incluye: ${label}`}>{help}</InfoHint>
                            </p>
                            {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
                            {/* La cuenta, escrita: sin esto el importe de la
                                derecha parece un precio y no un total. */}
                            {count > 0 && unit > 0 && (
                              <p className="text-[11px] text-secondary font-semibold">
                                {count} × {formatSoles(unit)} × {duration} días
                              </p>
                            )}
                          </div>
                          <span className="text-xs font-bold text-muted-foreground hidden sm:inline">{formatSoles(unit)} por día</span>
                          <div className="flex items-center border">
                            <button type="button" aria-label={`Quitar ${label}`} onClick={() => setExtraCount(key, count - 1)} className="w-8 h-8 flex items-center justify-center hover:bg-muted disabled:opacity-30" disabled={count <= 0}>
                              <Minus size={12} />
                            </button>
                            <span className="w-8 text-center text-sm font-bold">{count}</span>
                            <button type="button" aria-label={`Agregar ${label}`} onClick={() => setExtraCount(key, count + 1)} className="w-8 h-8 flex items-center justify-center hover:bg-muted disabled:opacity-30" disabled={count >= maxForExtra(key)}>
                              <Plus size={12} />
                            </button>
                          </div>
                          <span className="text-xs font-bold text-foreground w-20 text-right">{formatSoles(count * unit * duration)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Resumen del paquete (en créditos). Hasta elegir duración no se
                    muestra costo alguno (EFFE-097). */}
                <div className="border bg-muted/30 p-4 space-y-2">
                  {durationChosen ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Aviso ({duration} días)</span>
                        <span className="font-bold">{formatCredits(solesToCredits(packageBase))}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Adicionales ({duration} días)</span>
                        <span className="font-bold">{formatCredits(solesToCredits(extrasSum))}</span>
                      </div>
                      <div className="border-t pt-2 flex items-baseline justify-between">
                        <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Total a pagar</span>
                        <span className="text-2xl font-extrabold text-primary">{formatCredits(totalCredits)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground pt-1">
                        Se descontará de tu saldo al publicar. El comprobante se emite al comprar créditos.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-1">
                      Elige una duración arriba para ver el costo de tu aviso.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
            )}
          </div>

          {/* Sidebar: live total + actions.
              Sticky bajo el navbar (~76px) con scroll interno propio si supera el alto
              de pantalla, para que el botón "Publicar" siempre quede alcanzable. */}
          <div className="space-y-6 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">
            {/* Editando no hay nada que pagar, así que enseñar un "Costo" con un
                total al lado del botón de guardar solo sirve para asustar. */}
            {!editandoId && (
            <Card className="border-secondary/40 border-2">
              <CardHeader className="border-b bg-secondary/5">
                <CardTitle className="text-sm uppercase tracking-widest text-secondary flex items-center gap-2">
                  <Wallet size={14} /> Costo
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-3">
                {/* El costo del aviso solo aparece cuando ya se eligió duración
                    (EFFE-097). El saldo del usuario sí se muestra siempre. */}
                {durationChosen ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Aviso · {duration} días</span>
                      <span className="font-bold">{formatCredits(solesToCredits(packageBase))}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Adicionales · {duration} días</span>
                      <span className="font-bold">{formatCredits(solesToCredits(extrasSum))}</span>
                    </div>
                    {promoPct > 0 && (
                      <div className="flex justify-between text-sm text-success">
                        <span className="flex items-center gap-1">
                          <Percent size={12} /> Promo {activePromo?.name} (−{promoPct}%)
                        </span>
                        <span className="font-bold">−{formatCredits(baseCredits - totalCredits)}</span>
                      </div>
                    )}
                    <div className="border-t pt-3 flex items-baseline justify-between">
                      <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Total</span>
                      <span className="text-3xl font-extrabold text-primary">
                        {promoPct > 0 && (
                          <span className="text-sm font-normal text-muted-foreground line-through mr-2">{formatCredits(baseCredits)}</span>
                        )}
                        {formatCredits(totalCredits)}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-1">
                    Elige la duración de tu aviso para ver el total a pagar.
                  </p>
                )}
                <div className="border-t pt-3 flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">Tu saldo</span>
                  {creditLoading ? (
                    <Loader2 size={14} className="animate-spin text-muted-foreground" />
                  ) : (
                    <span className={`text-sm font-bold ${balanceCredits >= totalCredits ? "text-success" : "text-destructive"}`}>
                      {formatCredits(balanceCredits)}
                    </span>
                  )}
                </div>
                {durationChosen && !creditLoading && balanceCredits < totalCredits && (
                  <p className="text-[11px] text-destructive">
                    Falta {formatCredits(totalCredits - balanceCredits)}. Cómpralo al publicar.
                  </p>
                )}
                {/* El desglose completo (una línea por duración) ocupaba media
                    tarjeta y empujaba "Publicar aviso" fuera de vista. Ahora va
                    tras la ⓘ, que abre al pasar el ratón y al tocar (IT3-019). */}
                {!creditLoading && (
                  <div className="border-t pt-3 flex items-center gap-1.5">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
                      Con tu saldo puedes publicar
                    </p>
                    <InfoHint label="Cuántos avisos puedes publicar con tu saldo">
                      <p className="font-semibold mb-1.5">Con {formatCredits(balanceCredits)} puedes publicar</p>
                      {avisosBreakdown(balanceCredits, settings).map(({ dias, count }) => (
                        <p key={dias} className="text-muted-foreground">
                          <span className="font-bold text-secondary">~{count} avisos</span> de {dias} días
                        </p>
                      ))}
                      <p className="text-muted-foreground pt-1.5">Sin adicionales; los extras suman al costo.</p>
                    </InfoHint>
                  </div>
                )}
              </CardContent>
            </Card>
            )}

            {/* EFFE-089: las acciones van JUSTO debajo del costo, antes de la
                vista previa, para que "Publicar aviso" quede siempre a la vista
                en laptop (antes quedaba debajo del preview y podía no verse). */}
            <div className="flex flex-col gap-2">
              {/* Barra de subida: cuenta TODOS los adjuntos y por PESO, no por
                  numero. Con "subiendo 1 de 4", un video de 15 MB y una foto de
                  200 KB valian lo mismo y la barra se quedaba clavada en el 25%
                  durante minutos. Y hasta ahora el PDF y los videos ni se
                  contaban: subian en silencio. */}
              {pendienteDeSubir && !publishing && (
                <div className="border border-secondary/30 bg-secondary/5 px-3 py-2 space-y-1.5" data-testid="progreso-subida">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 size={12} className="animate-spin text-secondary" />
                      {pendienteDeSubir}
                    </span>
                    <span className="font-bold tabular-nums text-secondary">{avanceSubida}%</span>
                  </div>
                  <div className="h-1 w-full bg-muted overflow-hidden">
                    <div className="h-full bg-secondary transition-[width] duration-300" style={{ width: `${avanceSubida}%` }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    Puedes seguir rellenando: se sube solo mientras escribes.
                  </p>
                </div>
              )}

              {/* EDITANDO un aviso publicado: ni se publica ni se cobra. Es un
                  botón DISTINTO, no el mismo con una bandera: un botón que a
                  veces cobra acaba cobrando cuando no debe. */}
              {editandoId ? (
                <>
                  <Button variant="hero" size="lg" className="w-full rounded-none" onClick={guardarEdicion} disabled={savingDraft}>
                    {savingDraft
                      ? <><Loader2 size={16} className="mr-1 animate-spin" /> Guardando…</>
                      : <><Save size={16} className="mr-1.5" /> Guardar cambios</>}
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full rounded-none"
                    onClick={() => navigate("/dashboard/anunciante/avisos")}
                    disabled={savingDraft}
                  >
                    Cancelar
                  </Button>
                  <p className="text-[11px] text-muted-foreground text-center">
                    Estás editando un aviso publicado. No se cobra nada, y su
                    duración y sus adicionales no cambian.
                  </p>
                </>
              ) : (
              <>
              {/* `disabled` solo mientras se publica: si faltan campos dejamos el
                  botón activo para que openPublishFlow explique QUÉ falta. */}
              <Button variant="hero" size="lg" className="w-full rounded-none" onClick={openPublishFlow} disabled={publishing || savingDraft}>
                {publishing
                  ? <><Loader2 size={16} className="mr-1 animate-spin" />
                      {pendienteDeSubir
                        ? `Terminando de subir… ${avanceSubida}%`
                        : subiendo && subiendo.hechas < subiendo.total
                          ? `Subiendo imagen ${subiendo.hechas + 1} de ${subiendo.total}…`
                          : "Publicando…"}</>
                  : <>Publicar aviso <ArrowRight size={16} className="ml-1" /></>}
              </Button>

              {/* Guardar sin pagar: el aviso queda en "Mis avisos › Borradores".
                  No exige identidad ni créditos — no se cobra nada. */}
              <Button
                variant="outline"
                size="lg"
                className="w-full rounded-none"
                onClick={saveDraft}
                disabled={publishing || savingDraft}
              >
                {savingDraft
                  ? <><Loader2 size={16} className="mr-1 animate-spin" /> Guardando…</>
                  : <><Save size={16} className="mr-1.5" /> Guardar en mis borradores</>}
              </Button>
              </>
              )}

              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 justify-center text-center">
                <Wallet size={12} className="text-secondary" /> Se descontará de tu saldo al publicar.
                Guardar como borrador es gratis.
              </p>
            </div>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-sm uppercase tracking-widest text-secondary">Vista previa</CardTitle>
              </CardHeader>
              <CardContent className="p-4 bg-muted/30">
                {/* La MISMA tarjeta que se ve publicada: insignias, marco dorado
                    del destacado y contador de urgente idénticos. `pointer-events-none`
                    la deja como muestra estática (sin navegar ni marcar favorito). */}
                <div className="pointer-events-none max-w-[280px] mx-auto">
                  <ListingCard listing={previewListing} layout="grid" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>



      {/* Pago del aviso cuando no alcanza el saldo. Con `publishFor` cobra solo
          el faltante y publica el servidor; sin él es el configurador de saldo
          de siempre (por si el usuario prefiere esa vía). */}
      <BuyCreditsModal
        open={buyCreditsOpen}
        onClose={() => { setBuyCreditsOpen(false); setPagarPublicar(null); }}
        creditCost={totalCredits}
        currentBalance={balanceCredits}
        publishFor={pagarPublicar ?? undefined}
        onPublished={async (published) => {
          setBuyCreditsOpen(false);
          setPagarPublicar(null);
          setCreditBalance(await getCreditBalance());
          if (published) {
            // Ya está activo: publicarlo otra vez daría error de "ya publicado".
            setSuccessOpen({ open: true, number: "", email: userEmail || "anunciante@effe.pe" });
            resetPublishForm();
          } else {
            // Cobrado pero sin publicar (o ya tenía saldo): el saldo alcanza,
            // así que se remata aquí reutilizando el mismo borrador.
            doPublish();
          }
        }}
        onPagoEnEspera={() => {
          // Pagó por Yape/Plin: el aviso ya está guardado y esperando que el
          // equipo confirme el pago. WhatsApp se abrió en otra pestaña, así que
          // ESTA se lleva a Mis avisos, donde ve el suyo marcado "en revisión".
          // Dejarlo en el formulario de publicar era pedirle que lo publicara
          // otra vez —y que pagara dos veces— sin nada que le dijera que ya
          // estaba hecho.
          setBuyCreditsOpen(false);
          setPagarPublicar(null);
          resetPublishForm();
          toast({
            title: "Tu aviso está en camino",
            description: "En cuanto confirmemos tu pago se publica solo. No tienes que hacer nada más.",
          });
          navigate("/dashboard/anunciante/avisos?tab=borradores");
        }}
        onPurchaseComplete={(newBalance) => {
          setCreditBalance(newBalance);
          setBuyCreditsOpen(false);
          // Tras comprar, si ya alcanza, se publica de inmediato y se descuenta.
          // Aquí había que distinguir el caso "ya publicado, solo faltaba el
          // cobro" para no duplicar el aviso; ese estado ya no existe, porque
          // publicar y cobrar van juntos, y `draftListingId` hace que se
          // reutilice el mismo aviso en vez de crear otro.
          // Sin redondear: con saldo 16.00 y costo 16.14, `Math.round` daba por
          // bueno lo que la BD rechaza (resto de IT3-016).
          if (newBalance >= totalCredits) {
            doPublish();
          } else {
            toast({
              title: "Saldo añadido",
              description: `Tu saldo es ${formatCredits(newBalance)}, pero este aviso cuesta ${formatCredits(totalCredits)}. Compra un poco más para publicar.`,
            });
          }
        }}
      />

      {/* Único modal al publicar: confirmar. La identidad ya viene del perfil
          (verificada al comprar saldo), así que aquí solo se confirma. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="text-secondary" size={20} /> Confirmar publicación
            </DialogTitle>
            <DialogDescription>
              Revisa los datos y confirma para publicar tu aviso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="p-3 border bg-muted/30 space-y-1.5">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Aviso</span>
                <span className="font-medium text-right">{form.title || "—"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Duración</span>
                <span className="font-medium">{duration} días</span>
              </div>
              {/* Este es el último punto antes de cobrar: si los adicionales no
                  se desglosan aquí, su costo por día se descubre en el total. */}
              {extrasSum > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Adicionales ({duration} días)</span>
                  <span className="font-medium">{formatSoles(extrasSum)}</span>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Total</span>
                <span className="font-extrabold text-primary">{formatSoles(total)}</span>
              </div>
            </div>
            {/* EFFE-066/090: publicar NO emite comprobante (solo descuenta
                saldo). Antes aquí había un recuadro "Datos del comprobante" que
                hacía creer que al publicar se emitía una boleta/factura. */}
            {/* Si no alcanza, decirlo AQUÍ con la cifra exacta. Antes el usuario
                confirmaba, esperaba, y recién entonces le saltaba un error de
                saldo sin decirle cuánto le faltaba. */}
            {creditBalance !== null && creditBalance < totalCredits && (
              <p className="text-xs text-destructive font-medium">
                Te faltan {formatCredits(Math.round((totalCredits - creditBalance) * 100) / 100)} — se cobrarán ahora con tarjeta.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Se descontará de tu saldo al publicar. <span className="font-semibold text-foreground">Publicar no emite comprobante</span>: la boleta o factura se emite al comprar créditos.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={confirmAndPublish} disabled={publishing}>
              Confirmar y publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación post-pago */}
      <Dialog open={successOpen.open} onOpenChange={(o) => setSuccessOpen((s) => ({ ...s, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="text-success" size={20} /> ¡Aviso publicado!
            </DialogTitle>
            <DialogDescription>
              Tu aviso ya está visible y se descontó el saldo correspondiente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              El comprobante se emite al <span className="font-semibold text-foreground">comprar créditos</span>; puedes revisarlos en <span className="font-semibold text-foreground">Mis comprobantes</span>.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSuccessOpen({ open: false, number: "", email: "" })}>
              Cerrar
            </Button>
            <Button onClick={() => { setSuccessOpen({ open: false, number: "", email: "" }); navigate("/dashboard/anunciante/avisos"); }}>
              Ir a mis avisos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdvertiserPublish;
