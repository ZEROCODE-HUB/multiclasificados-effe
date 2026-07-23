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
  Wallet, Loader2, Percent, Save,
} from "lucide-react";
import { useCategories } from "@/hooks/useCategories";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { toast } from "@/hooks/use-toast";
import {
  loadSettings, priceForDuration, formatSoles, formatCredits, avisosBreakdown, solesToCredits,
  type DurationDays, type PricingSettings, type ExtraPrices,
} from "@/lib/pricing";
import { createAndPublishListing, saveListingDraft } from "@/lib/publish";
import { urgenteAllowedFor, URGENTE_MAX_DAYS } from "@/lib/listingBadges";
import { ListingCard } from "@/components/ListingCard";
import { FALLBACK_IMG } from "@/lib/listings";
import type { Listing } from "@/data/mockData";
import { type PersonType } from "@/components/VerifyIdentityDialog";
import { fetchMyIdentity } from "@/lib/identity";
import { getCreditBalance, spendCredits } from "@/lib/credits";
import { fetchActivePromotions, bestPromoForCategory, applyDiscount, type Promotion } from "@/lib/promotions";
import { fetchPricingSettings } from "@/lib/pricingRemote";
import { BuyCreditsModal } from "@/components/BuyCreditsModal";
import { LocationPicker } from "@/components/LocationPicker";
import { supabase } from "@/lib/supabase";

interface PhotoItem { id: string; url: string; name: string; file: File; }

const DURATIONS: DurationDays[] = [3, 7, 15, 30, 60, 90];

// "Imagen adicional" admite hasta 3 por aviso (además de la portada incluida).
const MAX_EXTRA_IMAGES = 3;

// Extras del paquete (cantidad numérica por cada uno)
type ExtraKey = "img500" | "pdf500" | "urgente" | "destacado" | "confidencial";
const EXTRA_DEFS: Array<{ key: ExtraKey; label: string; sub?: string; icon: typeof Sparkles }> = [
  { key: "img500", label: "Imagen adicional", sub: "hasta 500 KB · hasta 3", icon: ImagePlus },
  { key: "pdf500", label: "PDF adjunto por aviso", sub: "hasta 500 KB", icon: FileText },
  { key: "urgente", label: "Marcar como Urgente", icon: Flame },
  { key: "destacado", label: "Marcar como Destacado", icon: Star },
  { key: "confidencial", label: "Marcar como Confidencial", icon: EyeOff },
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
  const [verified, setVerified] = useState(false);
  const [verifiedName, setVerifiedName] = useState("");

  // Precarga la identidad verificada del perfil para el comprobante (sin modal).
  useEffect(() => {
    let active = true;
    fetchMyIdentity().then((id) => {
      if (!active || !id) return;
      if (id.docNumber) setDocNumber(id.docNumber);
      if (id.docType) setPersonType(id.docType === "ruc" ? "juridica" : "natural");
      if (id.name) setVerifiedName(id.name);
      setVerified(id.verified);
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
  const [pdfFile, setPdfFile] = useState<{ file: File; name: string } | null>(null);
  const pdfFileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    category: "",
    title: "",
    description: "",
    price: "",
    currency: "PEN",
    location: "",
    condition: "nuevo",
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
  const [durationChosen, setDurationChosen] = useState(false);
  const [extras, setExtras] = useState<ExtrasCount>({});

  // Créditos
  const [creditBalance, setCreditBalance] = useState(0);
  const [creditLoading, setCreditLoading] = useState(true);
  // Promociones vigentes (para descontar automáticamente al publicar).
  const [promos, setPromos] = useState<Promotion[]>([]);

  // Flujo de publicación con créditos
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
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
  // Aviso YA publicado al que solo le faltó el cobro (spend_credits devolvió
  // false porque el saldo cambió). Al comprar créditos hay que cobrar ESTE
  // aviso, no publicar uno nuevo: eso creaba un duplicado.
  const pendingChargeListingId = useRef<string | null>(null);
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
      // Al volver del login se retoma la publicación por el cuadro de identidad,
      // no publicando directamente: el documento aún está sin verificar.
      if (d.resumeAtSummary && session) {
        setTimeout(() => setVerifyOpen(true), 200);
      }
      localStorage.removeItem(DRAFT_KEY);
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const packageBase = priceForDuration(quantity, duration, settings);
  const extrasSum = EXTRA_DEFS.reduce((acc, def) => {
    const c = extras[def.key] ?? 0;
    return acc + c * (settings.extras[def.key as keyof ExtraPrices] ?? 0);
  }, 0);
  const baseTotal = Math.round((packageBase + extrasSum) * 100) / 100;
  // Promoción vigente para la categoría elegida (si la hay).
  const activePromo = bestPromoForCategory(promos, form.category);
  const promoPct = activePromo?.discount_pct ?? 0;
  const total = applyDiscount(baseTotal, promoPct);
  // Costo EN CRÉDITOS (enteros). El dinero (soles) va en `total`/`baseTotal`.
  const baseCredits = solesToCredits(baseTotal);
  const totalCredits = solesToCredits(total);
  const balanceCredits = Math.round(creditBalance);
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

  const pickPhoto = (slot: "main" | "extra", files: FileList | null) => {
    if (!files || files.length === 0) return;
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
    if (slot === "main") {
      setMainPhoto(item);
    } else {
      const i = pickingSlot.current;
      setExtraPhotos((prev) => { const next = [...prev]; next[i] = item; return next; });
    }
  };

  // Abre el selector de archivo para el slot adicional `i`.
  const openExtraPicker = (i: number) => { pickingSlot.current = i; extraFileRef.current?.click(); };
  const removeExtraPhoto = (i: number) =>
    setExtraPhotos((prev) => { const next = [...prev]; next[i] = null; return next; });

  // Tope por adicional: "Imagen adicional" hasta MAX_EXTRA_IMAGES; el resto a la
  // cantidad de avisos (aquí siempre 1: un aviso por publicación).
  const maxForExtra = (key: ExtraKey) => (key === "img500" ? MAX_EXTRA_IMAGES : quantity);

  const setExtraCount = (key: ExtraKey, count: number) => {
    const v = Math.max(0, Math.min(maxForExtra(key), count));
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
  }, [quantity]);

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
    imageUrl: mainPhoto?.url || FALLBACK_IMG,
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
    setPdfFile({ file: f, name: f.name });
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

  // El salario es opcional en Empleo (EFFE-087); en el resto el precio es obligatorio.
  const canPublish = form.category && form.title && form.description && (isEmpleo || form.price) && form.location && !!mainPhoto;

  // Publica según el saldo disponible. La identidad ya viene precargada del
  // perfil (verificada al comprar saldo): no se abre ningún modal de verificación.
  const openPublishFlowAfterVerify = () => {
    if (balanceCredits >= totalCredits) {
      // Tiene créditos: se publica directo y se descuenta (sin cuadro de pagos).
      doPublish();
    } else {
      // No tiene créditos: abre el configurador para comprar.
      setBuyCreditsOpen(true);
    }
  };

  const openPublishFlow = () => {
    if (!canPublish) {
      toast({ title: "Completa los datos requeridos", description: "Faltan campos obligatorios o imágenes.", variant: "destructive" });
      return;
    }
    // EFFE-097: publicar exige haber elegido una duración de forma explícita.
    if (!durationChosen) {
      toast({ title: "Elige la duración", description: "Selecciona cuántos días durará tu aviso antes de publicar.", variant: "destructive" });
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
    setForm({ category: "", title: "", description: "", price: "", currency: "PEN", location: "", condition: "nuevo" });
    setMainPhoto(null);
    setExtraPhotos(Array(MAX_EXTRA_IMAGES).fill(null));
    setCoords(null);
    setExtras({});
    setDuration(7);
    draftListingId.current = null; // el borrador ya se convirtió en aviso publicado
    localStorage.removeItem(DRAFT_KEY);
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
      const id = await saveListingDraft({
        form: formForSubmit, lat: coords?.lat ?? null, lng: coords?.lng ?? null,
        quantity, duration, extras,
        mainPhoto: mainPhoto ? { file: mainPhoto.file, name: mainPhoto.name } : null,
        extraPhotos: extraPhotos.slice(0, extraImageCount)
          .filter((p): p is PhotoItem => !!p)
          .map((p) => ({ file: p.file, name: p.name })),
        pdf: hasPdfInPackage && pdfFile ? { file: pdfFile.file, name: pdfFile.name } : null,
        draftId: draftListingId.current,
      });
      draftListingId.current = id;
      // El borrador local ya no hace falta: la fuente de verdad pasa a ser la BD.
      localStorage.removeItem(DRAFT_KEY);
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

  // Cobra un aviso que ya quedó publicado pero cuyo descuento de créditos falló.
  // Publicar de nuevo crearía un aviso duplicado; aquí solo se descuenta.
  const chargePendingListing = async (listingId: string) => {
    if (publishingRef.current) return;
    publishingRef.current = true;
    setPublishing(true);
    const email = userEmail || "anunciante@effe.pe";
    try {
      const spent = await spendCredits(totalCredits, listingId);
      const newBalance = await getCreditBalance();
      setCreditBalance(newBalance);
      if (!spent) {
        toast({
          title: "No se pudo descontar el saldo",
          description: "Tu saldo sigue sin alcanzar para este aviso.",
          variant: "destructive",
        });
        return;
      }
      pendingChargeListingId.current = null;
      setSuccessOpen({ open: true, number: "", email });
      resetPublishForm();
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  };

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
      // 1) Crear el aviso y publicarlo
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
        mainPhoto: mainPhoto ? { file: mainPhoto.file, name: mainPhoto.name } : null,
        extraPhotos: extraPhotos.slice(0, extraImageCount)
          .filter((p): p is PhotoItem => !!p)
          .map((p) => ({ file: p.file, name: p.name })),
        pdf: hasPdfInPackage && pdfFile ? { file: pdfFile.file, name: pdfFile.name } : null,
        receiptType: "boleta",
        email,
        advertiserName: verifiedName || session?.name || "Anunciante",
        docType: tipoDoc,
        docNumber: docNumber || undefined,
      });

      // 2) Descontar créditos del saldo (según el costo del aviso)
      const spent = await spendCredits(totalCredits, listingId);
      const newBalance = await getCreditBalance();
      setCreditBalance(newBalance);
      if (!spent) {
        // El saldo cambió y ya no alcanza. El aviso YA está publicado: lo dejamos
        // anotado para cobrarlo tras la compra (sin republicarlo) y no mostramos
        // "¡Pago confirmado!" por algo que todavía no se cobró.
        pendingChargeListingId.current = listingId;
        toast({
          title: "No se pudo descontar el saldo",
          description: "Tu saldo cambió y ya no alcanza. Compra saldo para completar.",
          variant: "destructive",
        });
        setBuyCreditsOpen(true);
        return;
      }
      pendingChargeListingId.current = null;

      // 3) Publicado y saldo descontado. NO se emite boleta al publicar: el
      //    comprobante ya se emitió al comprar los créditos. Confirmamos y
      //    vaciamos el formulario para que no se pueda reenviar.
      setSuccessOpen({ open: true, number: "", email });
      resetPublishForm();
      if (!published) {
        toast({
          title: "Aviso pendiente de activación",
          description: "Se descontó tu saldo, pero el aviso quedó pendiente de activación. Nuestro equipo lo revisará.",
        });
      }
    } catch (e) {
      toast({
        title: "No se pudo publicar",
        description: e instanceof Error ? e.message : "Intenta nuevamente.",
        variant: "destructive",
      });
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  };


  const completion = (() => {
    const fields = [form.category, form.title, form.description, form.price, form.location];
    const filled = fields.filter((v) => v && v.trim().length > 0).length;
    const total = fields.length + 1; // +1 fotos
    return Math.round(((filled + (mainPhoto ? 1 : 0)) / total) * 100);
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
            {verified && (
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
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">01</span>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><Tag size={16} className="text-secondary" /> Categoría y título</CardTitle>
                    <CardDescription className="text-xs">Clasifica tu aviso para que llegue al público correcto.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                <div>
                  <Label>Categoría *</Label>
                  <Select value={form.category} onValueChange={(v) => updateForm("category", v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Título del aviso *</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => updateForm("title", e.target.value)}
                    placeholder="Ej: Departamento 3 dormitorios en Miraflores"
                    maxLength={80}
                    className="mt-1"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">{form.title.length}/80</p>
                </div>
              </CardContent>
            </Card>

            {/* Step 2: Photos — 2 slots por aviso */}
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">02</span>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><Camera size={16} className="text-secondary" /> Imágenes del aviso</CardTitle>
                    <CardDescription className="text-xs">La imagen principal va incluida. Con el adicional “Imagen adicional” puedes sumar hasta 3 imágenes más (4 en total).</CardDescription>
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
                          onClick={(e) => { e.stopPropagation(); setMainPhoto(null); }}
                          className="absolute top-1.5 right-1.5 w-7 h-7 bg-white text-destructive flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <X size={14} />
                        </span>
                      </>
                    ) : (
                      <div className="text-center px-4">
                        <ImagePlus size={28} className="mx-auto text-muted-foreground mb-2" />
                        <p className="text-xs font-semibold text-foreground">Imagen principal</p>
                        <p className="text-[11px] text-muted-foreground">Incluida · hasta 100 KB</p>
                      </div>
                    )}
                  </button>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">Imagen principal</span> — incluida sin costo, hasta 100 KB.
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
                          onClick={() => setPdfFile(null)}
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
              </CardContent>
            </Card>

            {/* Step 3: Description */}
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">03</span>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><FileText size={16} className="text-secondary" /> Descripción</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5">
                <Textarea
                  value={form.description}
                  onChange={(e) => updateForm("description", e.target.value)}
                  placeholder="Describe tu producto o servicio…"
                  className="min-h-[160px]"
                  maxLength={2000}
                />
                <p className="text-[11px] text-muted-foreground mt-1">{form.description.length}/2000</p>
              </CardContent>
            </Card>

            {/* Step 4: Price & location */}
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">04</span>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><MapPin size={16} className="text-secondary" /> Precio y ubicación</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <Label>{isEmpleo ? "Salario / Remuneración (opcional)" : "Precio del producto *"}</Label>
                    <Input type="number" value={form.price} onChange={(e) => updateForm("price", e.target.value)} placeholder={isEmpleo ? "Opcional — déjalo vacío si es a convenir" : "0.00"} className="mt-1" />
                  </div>
                  <div>
                    <Label>Moneda</Label>
                    <Select value={form.currency} onValueChange={(v) => updateForm("currency", v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PEN">PEN (S/.)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <LocationPicker
                  location={form.location}
                  onLocationChange={(v) => updateForm("location", v)}
                  lat={coords?.lat ?? null}
                  lng={coords?.lng ?? null}
                  onCoordsChange={(la, ln) =>
                    setCoords(la != null && ln != null ? { lat: la, lng: ln } : null)
                  }
                  required
                />
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

            {/* Step 5: Paquete (cantidad + duración + adicionales) */}
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">05</span>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><Package size={16} className="text-secondary" /> Duración y adicionales</CardTitle>
                    <CardDescription className="text-xs">Elige cuántos días durará tu aviso y qué extras quieres. El precio se calcula al instante.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5 space-y-6">
                {/* Duración */}
                <div>
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
                </div>

                {/* Adicionales opcionales */}
                <div>
                  <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Adicionales opcionales</Label>
                  <p className="text-[11px] text-muted-foreground mt-1 mb-2">
                    Actívalos con “+”. Se aplican a tu aviso.
                  </p>
                  {!urgenteAllowed && (
                    <p className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Flame size={12} className="text-muted-foreground shrink-0" />
                      “Urgente” solo está disponible en avisos de hasta {URGENTE_MAX_DAYS} días.
                    </p>
                  )}
                  <div className="space-y-2">
                    {visibleExtras.map(({ key, label, sub, icon: Icon }) => {
                      const count = extras[key] ?? 0;
                      const unit = settings.extras[key as keyof ExtraPrices] ?? 0;
                      return (
                        <div key={key} className={`flex items-center gap-3 p-3 border transition-all ${count > 0 ? "border-secondary bg-secondary/5" : "border-border"}`}>
                          <Icon size={16} className="text-secondary" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground leading-tight">{label}</p>
                            {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
                          </div>
                          <span className="text-xs font-bold text-muted-foreground hidden sm:inline">{formatSoles(unit)} c/u</span>
                          <div className="flex items-center border">
                            <button type="button" aria-label={`Quitar ${label}`} onClick={() => setExtraCount(key, count - 1)} className="w-8 h-8 flex items-center justify-center hover:bg-muted disabled:opacity-30" disabled={count <= 0}>
                              <Minus size={12} />
                            </button>
                            <span className="w-8 text-center text-sm font-bold">{count}</span>
                            <button type="button" aria-label={`Agregar ${label}`} onClick={() => setExtraCount(key, count + 1)} className="w-8 h-8 flex items-center justify-center hover:bg-muted disabled:opacity-30" disabled={count >= maxForExtra(key)}>
                              <Plus size={12} />
                            </button>
                          </div>
                          <span className="text-xs font-bold text-foreground w-16 text-right">{formatSoles(count * unit)}</span>
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
                        <span className="text-muted-foreground">Adicionales</span>
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
          </div>

          {/* Sidebar: live total + actions.
              Sticky bajo el navbar (~76px) con scroll interno propio si supera el alto
              de pantalla, para que el botón "Publicar" siempre quede alcanzable. */}
          <div className="space-y-6 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">
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
                      <span className="text-muted-foreground">Adicionales</span>
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
                {!creditLoading && (
                  <div className="border-t pt-3 space-y-1">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
                      Con tu saldo puedes publicar
                    </p>
                    {avisosBreakdown(balanceCredits, settings).map(({ dias, count }) => (
                      <p key={dias} className="text-[11px] text-muted-foreground">
                        <span className="font-bold text-secondary">~{count} avisos</span> de {dias} días
                      </p>
                    ))}
                    <p className="text-[10px] text-muted-foreground pt-1">Sin adicionales; los extras suman al costo.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* EFFE-089: las acciones van JUSTO debajo del costo, antes de la
                vista previa, para que "Publicar aviso" quede siempre a la vista
                en laptop (antes quedaba debajo del preview y podía no verse). */}
            <div className="flex flex-col gap-2">
              {/* `disabled` solo mientras se publica: si faltan campos dejamos el
                  botón activo para que openPublishFlow explique QUÉ falta. */}
              <Button variant="hero" size="lg" className="w-full rounded-none" onClick={openPublishFlow} disabled={publishing || savingDraft}>
                {publishing
                  ? <><Loader2 size={16} className="mr-1 animate-spin" /> Publicando…</>
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



      {/* Modal compra de créditos — configurador (cuando no hay saldo suficiente) */}
      <BuyCreditsModal
        open={buyCreditsOpen}
        onClose={() => setBuyCreditsOpen(false)}
        creditCost={totalCredits}
        currentBalance={balanceCredits}
        onPurchaseComplete={(newBalance) => {
          setCreditBalance(newBalance);
          setBuyCreditsOpen(false);
          // Tras comprar, si ya alcanza, se publica de inmediato y se descuenta.
          if (Math.round(newBalance) >= totalCredits) {
            // Si el aviso ya se publicó y solo faltaba el cobro, se cobra ese
            // aviso. Llamar a doPublish() aquí publicaría un duplicado.
            const pending = pendingChargeListingId.current;
            if (pending) chargePendingListing(pending);
            else doPublish();
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
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Total</span>
                <span className="font-extrabold text-primary">{formatSoles(total)}</span>
              </div>
            </div>
            {/* EFFE-066/090: publicar NO emite comprobante (solo descuenta
                saldo). Antes aquí había un recuadro "Datos del comprobante" que
                hacía creer que al publicar se emitía una boleta/factura. */}
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
