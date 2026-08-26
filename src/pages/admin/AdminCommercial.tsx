import { useEffect, useRef, useState } from "react";
import { AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, FileText, SlidersHorizontal, Save, GripVertical, Eye, Upload, RefreshCw, Ban, Search, FileSpreadsheet, Download } from "lucide-react";
import { InvoiceDetailDialog } from "@/components/InvoiceDetailDialog";
import { personKindLabel } from "@/lib/identity";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePagination, TablePagination } from "@/components/TablePagination";
import { exportRows } from "@/lib/exportReport";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { formatSoles } from "@/lib/pricing";
import { CATEGORY_ICON_NAMES as ICON_OPTIONS, CATEGORY_PHOTO_POOL, iconFor, invalidateCategories } from "@/lib/categories";
import { imgUrlCover } from "@/lib/imageUrl";
import {
  fetchSettings, setSetting, fetchAllInvoices, INVOICES_PAGE_SIZE, retryInvoiceEmission,
  previsualizarAnulacion, anularComprobante, type PrevisualizacionAnulacion,
  fetchCategories, createCategory, updateCategory, deleteCategory, reorderCategories,
  uploadCategoryImage, uploadDefaultListingImage, removeDefaultListingImage,
  type AdminInvoice, type AdminCategory,
} from "@/lib/admin";
import { FALLBACK_IMG, invalidarImagenPorDefecto } from "@/lib/imagenPorDefecto";
import { mensajeDeError } from "@/lib/errores";

// Foto que se ve en la tarjeta nº `index` cuando la categoría no tiene una
// propia: la misma de reserva que pinta la portada, para que el panel enseñe
// exactamente lo que verá el visitante.
const photoFor = (imageUrl: string | null, index: number) =>
  imageUrl || CATEGORY_PHOTO_POOL[index % CATEGORY_PHOTO_POOL.length];

/**
 * Diálogo de anulación.
 *
 * Se pide una previsualización al servidor ANTES de enseñar nada, porque anular
 * retira saldo y emite un documento fiscal: quien lo hace tiene que ver los
 * números concretos —cuánto se devuelve, cuánto se puede retirar de verdad y
 * cuánto se queda por el camino— en vez de un «¿seguro?» a ciegas.
 *
 * Y si el usuario ya gastó parte de lo comprado, hay que marcar una casilla
 * aparte: el servidor rechaza la anulación sin ese visto bueno explícito.
 */
function AnularDialog({ inv, onHecho }: { inv: AdminInvoice; onHecho: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [previa, setPrevia] = useState<PrevisualizacionAnulacion | null>(null);
  const [motivo, setMotivo] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setPrevia(null); setMotivo(""); setAcepta(false);
    previsualizarAnulacion(inv.id)
      .then(setPrevia)
      .catch((e) => {
        toast({ title: "No se pudo consultar", description: mensajeDeError(e, "Error"), variant: "destructive" });
        setAbierto(false);
      });
  }, [abierto, inv.id]);

  const faltaSaldo = previa ? !previa.saldoSuficiente : false;
  const puedeEnviar = !!previa && motivo.trim().length >= 3 && (!faltaSaldo || acepta) && !enviando;

  const confirmar = async () => {
    setEnviando(true);
    try {
      const r = await anularComprobante(inv.id, motivo.trim(), acepta);
      if (!r.anulado) {
        toast({ title: "No se anuló", description: r.motivo ?? "Inténtalo de nuevo.", variant: "destructive" });
      } else {
        toast({
          title: `${inv.number} anulado`,
          description: [
            r.creditosRetirados > 0 ? `Se retiraron ${formatSoles(r.creditosRetirados)} de saldo.` : "No había saldo que retirar.",
            r.nota ? `Nota de crédito ${r.nota} en camino a SUNAT.` : "",
            "Recuerda devolver el cobro desde el panel de Izipay.",
          ].filter(Boolean).join(" "),
        });
      }
      setAbierto(false);
      onHecho();
    } catch (e) {
      toast({ title: "No se pudo anular", description: mensajeDeError(e, "Error"), variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  const Fila = ({ k, v, fuerte }: { k: string; v: string; fuerte?: boolean }) => (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className={fuerte ? "font-bold" : "font-medium"}>{v}</span>
    </div>
  );

  return (
    <AlertDialog open={abierto} onOpenChange={setAbierto}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-destructive" title="Anular comprobante">
          <Ban size={14} /> Anular
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Anular {inv.number}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-1">
              {!previa ? (
                <p className="text-sm">Comprobando qué pasaría…</p>
              ) : (
                <>
                  <div className="space-y-1 rounded-md border p-3">
                    <Fila k="Se compró" v={formatSoles(previa.creditosCompra)} />
                    <Fila k="Saldo del usuario ahora" v={formatSoles(previa.saldoActual)} />
                    <Fila k="Se le retirará" v={formatSoles(previa.seRetirara)} fuerte />
                    {previa.sinRecuperar > 0 && (
                      <Fila k="Ya gastado (no se recupera)" v={formatSoles(previa.sinRecuperar)} fuerte />
                    )}
                  </div>

                  <p className="text-sm">
                    {previa.emitiraNota
                      ? "Se emitirá una nota de crédito ante SUNAT para anularlo."
                      : "Es un comprobante interno, no declarado: no se manda nada a SUNAT."}
                  </p>

                  {/* Lo que la app NO hace, dicho claro: el dinero se devuelve
                      a mano en Izipay y nadie debería descubrirlo por su cuenta. */}
                  <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900
                                dark:bg-amber-950/40 dark:text-amber-200">
                    El dinero del cobro <b>no</b> se devuelve automáticamente. Tienes que
                    hacerlo desde el panel de Izipay.
                  </p>

                  {faltaSaldo && (
                    <label className="flex items-start gap-2 rounded-md border border-destructive/40 p-2 text-xs">
                      <input type="checkbox" className="mt-0.5" checked={acepta}
                             onChange={(e) => setAcepta(e.target.checked)} />
                      <span>
                        El usuario ya gastó {formatSoles(previa.sinRecuperar)} de lo que compró.
                        Entiendo que esa parte <b>no se recupera</b> y quiero anular igual.
                      </span>
                    </label>
                  )}

                  <div className="space-y-1">
                    <Label htmlFor="motivo-anulacion" className="text-xs">Motivo (queda registrado)</Label>
                    <Input id="motivo-anulacion" value={motivo} maxLength={200}
                           onChange={(e) => setMotivo(e.target.value)}
                           placeholder="Cobro duplicado, devolución solicitada…" />
                  </div>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!puedeEnviar}
            onClick={(e) => { e.preventDefault(); void confirmar(); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {enviando ? "Anulando…" : "Anular"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Estado de la emisión electrónica de un comprobante ───────────────────────
// El panel enseñaba solo el número y el importe, así que un comprobante que
// SUNAT hubiera rechazado era indistinguible de uno correcto. Estas etiquetas
// dicen en una ojeada cuál necesita atención.
const ESTADO_SUNAT: Record<string, { texto: string; clase: string }> = {
  aceptado:  { texto: "Aceptado",  clase: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  observado: { texto: "Observado", clase: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  rechazado: { texto: "Rechazado", clase: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  error:     { texto: "Error",     clase: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  vencido:   { texto: "Vencido",   clase: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  pendiente: { texto: "En cola",   clase: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  enviando:  { texto: "Enviando…", clase: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  omitido:   { texto: "Interno",   clase: "bg-muted text-muted-foreground" },
};

/** Solo tiene sentido reintentar lo que acabó mal o se quedó a medias. */
const puedeReintentar = (inv: AdminInvoice) =>
  !inv.anuladoAt
  && (["rechazado", "error", "vencido"].includes(inv.sunatStatus)
    || inv.emailStatus === "error"
    || inv.needsReview);

function EstadoEmision({ inv }: { inv: AdminInvoice }) {
  // Un comprobante anulado ya no se describe por cómo fue su emisión: lo que
  // importa es que está anulado y con qué nota.
  if (inv.anuladoAt) {
    return (
      <div className="flex flex-col gap-1 items-center">
        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap
                         text-red-800 dark:bg-red-950 dark:text-red-200"
              title={inv.anuladoMotivo ?? undefined}>
          Anulado
        </span>
        {inv.notaNumber && (
          <span className="font-mono text-[10px] text-muted-foreground">{inv.notaNumber}</span>
        )}
      </div>
    );
  }

  const s = ESTADO_SUNAT[inv.sunatStatus] ?? ESTADO_SUNAT.omitido;
  return (
    <div className="flex flex-col gap-1 items-center">
      <span
        className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap", s.clase)}
        title={inv.sunatError ?? undefined}
      >
        {s.texto}
      </span>
      {inv.emailStatus === "error" && (
        <span className="text-[10px] font-semibold text-red-700 dark:text-red-300">correo falló</span>
      )}
      {inv.emailStatus === "enviado" && (
        <span className="text-[10px] text-muted-foreground">correo enviado</span>
      )}
      {inv.needsReview && (
        <span className="text-[10px] font-semibold text-destructive">revisar</span>
      )}
    </div>
  );
}

// Tarjeta arrastrable. El asa (grip) es el único punto de agarre para que los
// botones de editar/eliminar sigan siendo clicables y la página pueda scrollear
// con el dedo en móvil.
function SortableCategoryCard({ cat, index, disabled, canEdit, onEdit, onDelete }: {
  cat: AdminCategory;
  index: number;
  disabled: boolean;
  canEdit: boolean;
  onEdit: (c: AdminCategory) => void;
  onDelete: (c: AdminCategory) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: cat.id, disabled });
  const Icon = iconFor(cat.icon);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "border p-4 bg-card",
        isDragging ? "relative z-10 shadow-lg opacity-90" : "card-lift",
      )}
    >
      {/* Misma foto y mismo recorte que la tarjeta de la portada. */}
      <div className="relative aspect-[4/3] -m-4 mb-3 overflow-hidden border-b bg-muted">
        <img
          src={imgUrlCover(photoFor(cat.image_url, index), 300)}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {!cat.image_url && (
          <span className="absolute bottom-2 left-2 rounded bg-background/85 px-2 py-0.5 text-[10px] text-muted-foreground">
            Foto de reserva
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {!disabled && (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              title="Arrastra para reordenar"
              aria-label={`Reordenar ${cat.name}`}
              className="touch-none cursor-grab active:cursor-grabbing p-1 -ml-1 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
            >
              <GripVertical size={16} />
            </button>
          )}
          <div className="w-10 h-10 rounded-lg bg-accent text-accent-foreground flex items-center justify-center">
            <Icon size={18} />
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" title="Editar" onClick={() => onEdit(cat)}><Pencil size={14} /></Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" className="text-destructive" title="Eliminar"><Trash2 size={14} /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar "{cat.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {cat.count > 0
                      ? `Esta categoría tiene ${cat.count} aviso(s) asociados. No podrás eliminarla hasta reasignar o quitar esos avisos.`
                      : "Esta acción es permanente. La categoría dejará de estar disponible para nuevos avisos."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(cat)}>Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
      <p className="font-semibold text-sm">{cat.name}</p>
      <p className="text-xs text-muted-foreground">{cat.count.toLocaleString()} avisos</p>
    </div>
  );
}


const AdminCommercial = ({ role }: { role: AdminRole }) => {
  // Editar categorías exige 'Configuración comercial' · Editar (edit); el
  // servidor lo reexige vía RLS. Las variables del sistema siguen siendo
  // superadmin-only (set_setting / RLS settings_manage_super).
  const { can } = usePermissions(role === "admin");
  const canEdit = can("Configuración comercial", "edit");
  const isSuper = role === "superadmin";

  // ===== Categorías (tabla real `categories`) =====
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [catsLoading, setCatsLoading] = useState(true);
  // `real` = las categorías vinieron de la BD. En modo demo no hay nada que persistir.
  const [catsReal, setCatsReal] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [catDialog, setCatDialog] = useState<{ open: boolean; editing: AdminCategory | null }>({ open: false, editing: null });
  const [catName, setCatName] = useState("");
  const [catIcon, setCatIcon] = useState("Tag");
  const [catConditionEnabled, setCatConditionEnabled] = useState(true);
  const [savingCat, setSavingCat] = useState(false);
  // Imagen de portada: `catImage` es la ya guardada (null = quitar / sin foto),
  // `catFile` la que está pendiente de subir y `catPreview` su vista local.
  const [catImage, setCatImage] = useState<string | null>(null);
  const [catFile, setCatFile] = useState<File | null>(null);
  const [catPreview, setCatPreview] = useState<string | null>(null);
  const catFileRef = useRef<HTMLInputElement>(null);

  // El objectURL de la vista previa hay que revocarlo o se filtra el blob.
  useEffect(() => () => { if (catPreview) URL.revokeObjectURL(catPreview); }, [catPreview]);

  const clearCatFile = () => {
    setCatFile(null);
    setCatPreview(null); // el useEffect de arriba revoca el anterior
  };

  const onPickCatImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Archivo no válido", description: "Selecciona una imagen (JPG, PNG o WebP).", variant: "destructive" });
      return;
    }
    // 8 MB es el tope ANTES de comprimir: compressImage la deja en 200-400 KB,
    // muy por debajo del límite de 5 MB del bucket.
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "Imagen muy pesada", description: "La foto no debe superar 8 MB.", variant: "destructive" });
      return;
    }
    setCatFile(file);
    setCatPreview(URL.createObjectURL(file));
  };

  // Posición que ocupará la categoría en la portada: decide qué foto de reserva
  // se enseña en el diálogo cuando todavía no tiene una propia.
  const catDialogIndex = catDialog.editing
    ? Math.max(0, cats.findIndex((c) => c.id === catDialog.editing!.id))
    : cats.length;

  const loadCats = () => {
    setCatsLoading(true);
    fetchCategories().then(({ data, real }) => { setCats(data); setCatsReal(real); setCatsLoading(false); });
  };
  useEffect(() => { loadCats(); }, []);

  const sensors = useSensors(
    // La distancia mínima evita que un clic en el asa se interprete como arrastre.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const canReorder = catsReal && cats.length > 1 && canEdit;

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = cats.findIndex((c) => c.id === active.id);
    const to = cats.findIndex((c) => c.id === over.id);
    if (from < 0 || to < 0) return;

    const previous = cats;
    const next = arrayMove(cats, from, to);
    setCats(next); // optimista: la tarjeta se queda donde la soltaron
    setSavingOrder(true);
    try {
      await reorderCategories(next.map((c) => c.id));
      await invalidateCategories(); // refresca el resto de la plataforma
      toast({ title: "Orden actualizado", description: "Se aplicó en toda la plataforma." });
    } catch (e) {
      setCats(previous);
      toast({ title: "No se pudo guardar el orden", description: mensajeDeError(e, "Error"), variant: "destructive" });
    }
    setSavingOrder(false);
  };

  const openNewCat = () => {
    setCatName(""); setCatIcon("Tag"); setCatConditionEnabled(true);
    setCatImage(null); clearCatFile();
    setCatDialog({ open: true, editing: null });
  };
  const openEditCat = (c: AdminCategory) => {
    setCatName(c.name); setCatIcon(c.icon); setCatConditionEnabled(c.condition_enabled);
    setCatImage(c.image_url); clearCatFile();
    setCatDialog({ open: true, editing: c });
  };

  const saveCat = async () => {
    if (!catName.trim()) return;
    setSavingCat(true);
    try {
      if (catDialog.editing) {
        const prev = catDialog.editing.image_url;
        // Solo se manda `image_url` si hubo cambio: foto nueva, o "Quitar".
        let image_url: string | null | undefined;
        if (catFile) image_url = await uploadCategoryImage(catDialog.editing.id, catFile, prev);
        else if (catImage === null && prev) image_url = null;
        await updateCategory(catDialog.editing.id, {
          name: catName.trim(), icon: catIcon, condition_enabled: catConditionEnabled,
          ...(image_url !== undefined ? { image_url } : {}),
        });
        toast({ title: "Categoría actualizada", description: catName.trim() });
      } else {
        // `sort_order` es 1-based (como el seed): la nueva va al final.
        // La foto se sube DESPUÉS de crear: el id sale de slugify(nombre) y el
        // nombre puede cambiar antes de pulsar Crear; subirla antes dejaría
        // archivos con slugs que nunca existieron.
        const id = await createCategory({ name: catName.trim(), icon: catIcon, sort_order: cats.length + 1, condition_enabled: catConditionEnabled });
        if (catFile) {
          try {
            const url = await uploadCategoryImage(id, catFile);
            await updateCategory(id, { image_url: url });
          } catch (e) {
            // La categoría ya está creada: no se revierte, solo se avisa. Hasta
            // que suban una foto, la portada usará una de reserva.
            toast({
              title: "Categoría creada, pero sin imagen",
              description: mensajeDeError(e, "No se pudo subir la foto. Vuelve a intentarlo desde Editar."),
              variant: "destructive",
            });
          }
        }
        toast({ title: "Categoría creada", description: catName.trim() });
      }
      setCatDialog({ open: false, editing: null });
      loadCats();
      void invalidateCategories();
    } catch (e) {
      toast({ title: "No se pudo guardar", description: mensajeDeError(e, "Error"), variant: "destructive" });
    }
    setSavingCat(false);
  };

  const deleteCat = async (c: AdminCategory) => {
    // No se puede borrar una categoría con avisos (FK restrictiva en `listings`).
    if (c.count > 0) {
      toast({
        title: "No se puede eliminar",
        description: `"${c.name}" tiene ${c.count} aviso(s) asociados. Reasigna o elimina esos avisos primero.`,
        variant: "destructive",
      });
      return;
    }
    try {
      await deleteCategory(c.id);
      toast({ title: "Categoría eliminada", description: c.name });
      loadCats();
      void invalidateCategories();
    } catch (e) {
      toast({ title: "No se pudo eliminar", description: mensajeDeError(e, "Error"), variant: "destructive" });
    }
  };

  // ===== Variables del sistema (REQ-ADM-04) =====
  // El precio del aviso destacado NO va aquí: se configura en Tarifas y
  // descuentos > Precios de adicionales, y tenerlo en dos sitios invitaba a
  // dejarlos descuadrados. Las pasarelas (Stripe/Culqi) no son variables del
  // sistema y se quitaron de esta vista.
  const SETTING_KEYS = {
    commission_pct: "Comisión por transacción (%)",
    free_listings_limit: "Límite de publicaciones gratis",
    maintenance_mode: "Modo mantenimiento",
    default_listing_image: "Imagen de los avisos sin foto",
  } as const;
  type SettingKey = keyof typeof SETTING_KEYS;
  // Cada ajuste tiene SU tipo: los dos primeros van a un <Input type="number">
  // y el tercero a un interruptor. Como `Record<SettingKey, any>` esto no se
  // comprobaba y un booleano podía acabar en un campo numérico.
  interface Ajustes {
    commission_pct: number; free_listings_limit: number; maintenance_mode: boolean;
    // URL de la imagen para avisos sin foto. null = usar la del bundle.
    default_listing_image: string | null;
  }
  const [settings, setSettings] = useState<Ajustes>({
    commission_pct: 0, free_listings_limit: 0, maintenance_mode: false,
    default_listing_image: null,
  });

  // Imagen por defecto: archivo elegido pendiente de subir + su vista previa.
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const imgFileRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (imgPreview) URL.revokeObjectURL(imgPreview); }, [imgPreview]);

  const onPickDefaultImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Archivo no válido", description: "Selecciona una imagen (JPG, PNG o WebP).", variant: "destructive" });
      return;
    }
    // 8 MB antes de comprimir; `compressImage` la deja muy por debajo del tope
    // de 5 MB del bucket.
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "Imagen muy pesada", description: "La imagen no debe superar 8 MB.", variant: "destructive" });
      return;
    }
    setImgFile(file);
    setImgPreview(URL.createObjectURL(file));
  };

  // "Quitar" solo marca la intención: el borrado real se hace al guardar, para
  // no dejar la portada sin imagen si el usuario se arrepiente y no guarda.
  const quitarImagenPorDefecto = () => {
    setImgFile(null);
    setImgPreview(null);
    setSettings((s) => ({ ...s, default_listing_image: null }));
  };
  const [savingSettings, setSavingSettings] = useState(false);

  // ===== Boletas y facturas (todos los anunciantes, desde la BD) =====
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoiceDetail, setInvoiceDetail] = useState<AdminInvoice | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  // Buscador y filtros de comprobantes. La lista ya no se trae entera: se filtra
  // y se pagina en el servidor, porque con unos miles de boletas la pantalla no
  // llegaba a cargar.
  const [invSearch, setInvSearch] = useState("");
  const [invTipo, setInvTipo] = useState<"all" | "boleta" | "factura">("all");
  const [invSunat, setInvSunat] = useState<string>("all");
  const [invDesde, setInvDesde] = useState("");
  const [invHasta, setInvHasta] = useState("");
  const [invAnulados, setInvAnulados] = useState(false);
  // Llegar con `?atencion=1` desde el aviso del panel abre la lista ya filtrada
  // a los que se quedaron a medias. Sin esto, el aviso decia "3 comprobantes
  // necesitan revision" y soltaba al administrador en la lista entera, a
  // buscarlos entre veinte por pagina — que es justo el problema que resuelve.
  const [invAtencion, setInvAtencion] = useState(
    () => new URLSearchParams(window.location.search).get("atencion") === "1",
  );
  const [invPage, setInvPage] = useState(1);
  const [invTotal, setInvTotal] = useState(0);
  const invTotalPages = Math.max(1, Math.ceil(invTotal / INVOICES_PAGE_SIZE));

  const filtroInvoices = () => ({
    search: invSearch || undefined,
    tipo: invTipo === "all" ? undefined : invTipo,
    sunat: invSunat === "all" ? undefined : invSunat,
    desde: invDesde || undefined,
    hasta: invHasta || undefined,
    soloAnulados: invAnulados || undefined,
    soloAtencion: invAtencion || undefined,
    page: invPage,
  });

  /** Vuelve a leer los comprobantes. Lo usan el reintento y la anulación. */
  /**
   * Descarga los comprobantes que hay en pantalla… pero TODOS los que cumplen
   * el filtro, no solo la página. Un reporte contable que trae 20 filas de 300
   * no sirve para cuadrar nada.
   */
  const exportarComprobantes = async (formato: "xlsx" | "csv" | "pdf") => {
    try {
      const { data } = await fetchAllInvoices({ ...filtroInvoices(), page: 1, pageSize: 5000 });
      const filas = data.map((inv) => ({
        "N° Comprobante": inv.number,
        Tipo: inv.type === "factura" ? "Factura" : "Boleta",
        Fecha: inv.date.slice(0, 10),
        Anunciante: inv.advertiser,
        "DNI/RUC": inv.docNumber ?? "",
        Correo: inv.email,
        Concepto: inv.listingTitle,
        Estado: inv.anuladoAt ? "Anulado" : inv.sunatStatus,
        "Monto (S/)": Number(inv.amount.toFixed(2)),
      }));
      exportRows(formato, "comprobantes", "Boletas y facturas", filas, { landscape: true });
      toast({ title: "Comprobantes exportados", description: `${filas.length} filas` });
    } catch {
      toast({ title: "No se pudo exportar", variant: "destructive" });
    }
  };

  const recargarInvoices = async () => {
    const { data, total } = await fetchAllInvoices(filtroInvoices());
    setInvoices(data);
    setInvTotal(total);
  };

  // Devuelve el comprobante a la cola de emisión y de correo. El permiso lo
  // comprueba la propia RPC en el servidor, no aquí.
  const reintentar = async (inv: AdminInvoice) => {
    setRetrying(inv.id);
    try {
      await retryInvoiceEmission(inv.id);
      toast({
        title: "Comprobante en cola",
        description: `${inv.number} se volverá a enviar en unos instantes.`,
      });
      const { data } = await fetchAllInvoices();
      setInvoices(data);
    } catch (e) {
      toast({
        title: "No se pudo reintentar",
        description: mensajeDeError(e, "Error"),
        variant: "destructive",
      });
    } finally {
      setRetrying(null);
    }
  };

  useEffect(() => {
    fetchSettings().then((rows) => {
      if (!rows.length) return;
      setSettings((prev) => {
        const next = { ...prev };
        // El valor llega como jsonb: se convierte al tipo que espera cada campo.
        rows.forEach((s) => {
          if (s.key === "commission_pct") next.commission_pct = Number(s.value) || 0;
          else if (s.key === "free_listings_limit") next.free_listings_limit = Number(s.value) || 0;
          else if (s.key === "maintenance_mode") next.maintenance_mode = s.value === true || s.value === "true";
          else if (s.key === "default_listing_image") next.default_listing_image = typeof s.value === "string" && s.value ? s.value : null;
        });
        return next;
      });
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      fetchAllInvoices(filtroInvoices()).then(({ data, total }) => {
        if (mounted) { setInvoices(data); setInvTotal(total); setInvoicesLoading(false); }
      });
    };
    // Debounce solo para lo que se teclea; los desplegables ya llegan resueltos.
    const t = setTimeout(load, invSearch ? 300 : 0);
    // Refresca cuando se emite un comprobante nuevo (misma pestaña u otra).
    window.addEventListener("effe:invoices-updated", load);
    window.addEventListener("storage", load);
    return () => {
      mounted = false;
      clearTimeout(t);
      window.removeEventListener("effe:invoices-updated", load);
      window.removeEventListener("storage", load);
    };
    // `filtroInvoices` se recrea en cada render: lo que importa son los
    // filtros de la lista de abajo, que son sus únicas entradas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invSearch, invTipo, invSunat, invDesde, invHasta, invAnulados, invAtencion, invPage]);

  // Cambiar un filtro devuelve a la primera página: si no, se puede quedar
  // mirando la página 5 de un resultado que ahora tiene una.
  useEffect(() => { setInvPage(1); }, [invSearch, invTipo, invSunat, invDesde, invHasta, invAnulados, invAtencion]);

  const saveSettings = async () => {
    setSavingSettings(true);
    const anterior = settings.default_listing_image;
    try {
      // La imagen se sube ANTES de guardar los ajustes: si la subida falla no se
      // escribe una URL que no existe.
      const imagen = imgFile
        ? await uploadDefaultListingImage(imgFile, anterior)
        : settings.default_listing_image;

      const aGuardar: Ajustes = { ...settings, default_listing_image: imagen };
      await Promise.all(
        (Object.keys(SETTING_KEYS) as SettingKey[]).map((k) =>
          setSetting(k, aGuardar[k], SETTING_KEYS[k]),
        ),
      );

      // Solo cuando la base de datos aceptó el cambio se borra la imagen vieja
      // del bucket. Al revés, un guardado fallido dejaría la portada apuntando a
      // un archivo ya borrado.
      if (anterior && anterior !== imagen) await removeDefaultListingImage(anterior);

      setSettings(aGuardar);
      setImgFile(null);
      setImgPreview(null);
      // Que el resto de la app coja la imagen nueva sin recargar.
      void invalidarImagenPorDefecto();

      toast({ title: "Configuración guardada", description: "Las variables del sistema se actualizaron." });
    } catch (e) {
      toast({ title: "No se pudo guardar", description: mensajeDeError(e, "Error"), variant: "destructive" });
    }
    setSavingSettings(false);
  };

  return (
    <>
      <Tabs defaultValue="categorias">
        <TabsList className="w-full overflow-x-auto justify-start no-scrollbar">
          <TabsTrigger value="categorias">Categorías</TabsTrigger>
          <TabsTrigger value="sistema">Sistema</TabsTrigger>
          <TabsTrigger value="boletas">Boletas y facturas</TabsTrigger>
        </TabsList>

        {/* CATEGORÍAS */}
        <TabsContent value="categorias" className="pt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base md:text-lg">Categorías y subcategorías</CardTitle>
                {!canEdit && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Solo lectura: no tienes permiso para editar categorías. Un superadministrador puede habilitarlo en Roles y permisos.
                  </p>
                )}
                {canReorder && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {savingOrder
                      ? "Guardando orden…"
                      : "Arrastra las tarjetas por el asa para cambiar el orden. Se aplica en toda la plataforma."}
                  </p>
                )}
              </div>
              {canEdit && (
                <Button size="sm" className="gap-2 shrink-0" onClick={openNewCat}><Plus size={14} /> Nueva</Button>
              )}
            </CardHeader>
            <CardContent>
              {catsLoading && <p className="text-sm text-muted-foreground py-6 text-center">Cargando categorías…</p>}
              {!catsLoading && cats.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No hay categorías. Crea la primera.</p>}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={cats.map((c) => c.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {cats.map((c, i) => (
                      <SortableCategoryCard
                        key={c.id}
                        cat={c}
                        index={i}
                        disabled={!canReorder}
                        canEdit={canEdit}
                        onEdit={openEditCat}
                        onDelete={deleteCat}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </CardContent>
          </Card>

          <Dialog open={catDialog.open} onOpenChange={(o) => setCatDialog((s) => ({ ...s, open: o }))}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{catDialog.editing ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
                <DialogDescription>
                  {catDialog.editing ? "Modifica el nombre, la foto de portada o el icono." : "Crea una nueva categoría para clasificar avisos."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Ej. Maquinaria pesada" />
                </div>
                <div className="space-y-2">
                  <Label>Imagen de portada</Label>
                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border bg-muted">
                    <img
                      src={catPreview ?? imgUrlCover(photoFor(catImage, catDialogIndex), 400)}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    {!catImage && !catPreview && (
                      <span className="absolute bottom-2 left-2 rounded bg-background/85 px-2 py-0.5 text-[10px] text-muted-foreground">
                        Foto de reserva
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="gap-1.5"
                      onClick={() => catFileRef.current?.click()} disabled={savingCat}>
                      <Upload size={14} /> {catImage || catPreview ? "Cambiar imagen" : "Subir imagen"}
                    </Button>
                    {(catImage || catPreview) && (
                      <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={savingCat}
                        onClick={() => { clearCatFile(); setCatImage(null); }}>
                        Quitar
                      </Button>
                    )}
                  </div>
                  <input
                    ref={catFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    // Se limpia el value para que volver a elegir el mismo archivo dispare el change.
                    onChange={(e) => { onPickCatImage(e.target.files?.[0]); e.target.value = ""; }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Es la foto que se ve en la pantalla de inicio. Usa una imagen horizontal (4:3), mínimo 800×600.
                    Se recorta y se comprime automáticamente.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Icono</Label>
                  <div className="grid grid-cols-6 gap-2">
                    {ICON_OPTIONS.map((name) => {
                      const Ico = iconFor(name);
                      const active = catIcon === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setCatIcon(name)}
                          title={name}
                          className={cn(
                            "h-10 rounded-lg border flex items-center justify-center transition-colors",
                            active ? "border-secondary bg-secondary/15 text-secondary" : "hover:bg-muted text-muted-foreground",
                          )}
                        >
                          <Ico size={18} />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5 pr-3">
                    <Label htmlFor="cat-condition" className="cursor-pointer">Habilitar condición</Label>
                    <p className="text-xs text-muted-foreground">
                      Muestra el campo "Condición" (Nuevo / Usado) al publicar. Desactívalo en categorías como Servicios o Empleos.
                    </p>
                  </div>
                  <Switch id="cat-condition" checked={catConditionEnabled} onCheckedChange={setCatConditionEnabled} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCatDialog({ open: false, editing: null })}>Cancelar</Button>
                <Button onClick={saveCat} disabled={savingCat || !catName.trim()}>
                  {savingCat ? (catFile ? "Subiendo imagen…" : "Guardando...") : catDialog.editing ? "Guardar" : "Crear"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>



        {/* SISTEMA (variables globales) */}
        <TabsContent value="sistema" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-secondary" /> Variables del sistema
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{SETTING_KEYS.commission_pct}</Label>
                  <Input type="number" value={settings.commission_pct}
                    onChange={(e) => setSettings((s) => ({ ...s, commission_pct: Number(e.target.value) }))} />
                </div>
                <div className="space-y-2">
                  <Label>{SETTING_KEYS.free_listings_limit}</Label>
                  <Input type="number" value={settings.free_listings_limit}
                    onChange={(e) => setSettings((s) => ({ ...s, free_listings_limit: Number(e.target.value) }))} />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between border rounded-lg p-4">
                  <div className="pr-4">
                    <p className="font-medium text-sm">{SETTING_KEYS.maintenance_mode}</p>
                    <p className="text-xs text-muted-foreground">
                      Bloquea el acceso a la plataforma. El personal del panel sigue entrando, para poder desactivarlo.
                    </p>
                  </div>
                  <Switch checked={!!settings.maintenance_mode}
                    onCheckedChange={(v) => setSettings((s) => ({ ...s, maintenance_mode: v }))} />
                </div>
              </div>

              {/* Imagen de los avisos sin foto. Antes era una constante del
                  código y había que desplegar para cambiarla. */}
              <div className="space-y-2 border-t pt-5">
                <Label>Imagen de los avisos sin foto</Label>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative aspect-[4/3] w-full sm:w-56 shrink-0 overflow-hidden rounded-lg border bg-muted">
                    <img
                      src={imgPreview ?? settings.default_listing_image ?? FALLBACK_IMG}
                      alt="Imagen que verán los avisos sin foto"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    {!settings.default_listing_image && !imgPreview && (
                      <span className="absolute bottom-2 left-2 rounded bg-background/85 px-2 py-0.5 text-[10px] text-muted-foreground">
                        Imagen de fábrica
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 min-w-0">
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" className="gap-1.5"
                        onClick={() => imgFileRef.current?.click()} disabled={savingSettings || !isSuper}>
                        <Upload size={14} /> {settings.default_listing_image || imgPreview ? "Cambiar imagen" : "Subir imagen"}
                      </Button>
                      {(settings.default_listing_image || imgPreview) && (
                        <Button type="button" variant="ghost" size="sm" className="text-destructive"
                          disabled={savingSettings || !isSuper}
                          onClick={quitarImagenPorDefecto}>
                          Quitar
                        </Button>
                      )}
                    </div>
                    <input
                      ref={imgFileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { onPickDefaultImage(e.target.files?.[0]); e.target.value = ""; }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Es lo que se ve en un aviso publicado sin fotos, en la portada, la búsqueda y su ficha.
                      Usa una imagen horizontal (4:3), mínimo 800×600; se comprime automáticamente.
                      Si la quitas, vuelve la imagen de fábrica.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                {!isSuper && (
                  <p className="text-xs text-muted-foreground">Solo un superadministrador puede cambiar estas variables.</p>
                )}
                <Button onClick={saveSettings} disabled={savingSettings || !isSuper} className="gap-2">
                  <Save size={14} /> {savingSettings ? "Guardando..." : "Guardar configuración"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BOLETAS — con estado de emisión y reintento */}
        <TabsContent value="boletas" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                <FileText size={16} className="text-secondary" /> Boletas y facturas generadas
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <div className="flex flex-wrap items-end gap-2 mb-4">
                <div className="relative flex-1 min-w-[220px]">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={invSearch}
                    onChange={(e) => setInvSearch(e.target.value)}
                    placeholder="N° comprobante, anunciante, DNI/RUC, correo…"
                    className="h-9 pl-9"
                  />
                </div>
                <Select value={invTipo} onValueChange={(v) => setInvTipo(v as "all" | "boleta" | "factura")}>
                  <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="boleta">Boletas</SelectItem>
                    <SelectItem value="factura">Facturas</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={invSunat} onValueChange={setInvSunat}>
                  <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Cualquier estado</SelectItem>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="emitido">Emitido</SelectItem>
                    <SelectItem value="omitido">Interno (sin SUNAT)</SelectItem>
                    <SelectItem value="vencido">Vencido</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="date" value={invDesde} onChange={(e) => setInvDesde(e.target.value)} className="h-9 w-40" />
                <Input type="date" value={invHasta} onChange={(e) => setInvHasta(e.target.value)} className="h-9 w-40" />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground h-9 px-1">
                  <input type="checkbox" checked={invAnulados} onChange={(e) => setInvAnulados(e.target.checked)} />
                  Solo anulados
                </label>
                {/* Tiene que poder APAGARSE desde aqui: quien llega por el aviso
                    del panel llega filtrado, y si no ve por que solo salen tres
                    comprobantes, lo siguiente que piensa es que se perdieron los
                    demas. */}
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground h-9 px-1">
                  <input type="checkbox" checked={invAtencion} onChange={(e) => setInvAtencion(e.target.checked)} />
                  Solo los que necesitan revisión
                </label>
                <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => exportarComprobantes("xlsx")}>
                  <FileSpreadsheet size={14} /> Excel
                </Button>
                <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => exportarComprobantes("csv")}>
                  <Download size={14} /> CSV
                </Button>
                <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => exportarComprobantes("pdf")}>
                  <FileText size={14} /> PDF
                </Button>
              </div>
              {invoicesLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Cargando comprobantes…</p>
              ) : invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {invSearch || invTipo !== "all" || invSunat !== "all" || invDesde || invHasta || invAnulados || invAtencion
                    ? "Ningún comprobante coincide con estos filtros."
                    : "Aún no se han generado boletas."}
                </p>
              ) : (
                <Table>
                  {/* Alineación por tipo de dato, no por gusto: el texto a la
                      izquierda (se lee desde ahí), las fechas y los estados
                      centrados, y todo lo que son cifras a la derecha, que es
                      como se comparan de un vistazo. Y `whitespace-nowrap` donde
                      partir en dos líneas estropea el dato: "S/" separado de su
                      importe, o una fecha rota, no se leen: se descifran. La
                      tabla ya scrollea en horizontal, así que ensanchar una
                      columna no rompe la página. */}
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">N° Comprobante</TableHead>
                      <TableHead className="text-center">Tipo</TableHead>
                      <TableHead className="text-center">Fecha</TableHead>
                      <TableHead>Anunciante</TableHead>
                      <TableHead className="text-right whitespace-nowrap">DNI/RUC</TableHead>
                      <TableHead className="text-center whitespace-nowrap">Usuario/Empresa</TableHead>
                      {/* No es el título de un aviso: es el concepto de lo que
                          se cobró ("Compra de saldo: 1 aviso · 7 días"). Se
                          llamaba "Aviso" y hacía pensar que se emitía un
                          comprobante por cada publicación. */}
                      <TableHead>Concepto</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Ver</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id} className={inv.needsReview ? "bg-destructive/5" : undefined}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {inv.number}
                          {inv.esPrueba && (
                            <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-bold
                                             text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                              PRUEBA
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs capitalize text-center">{inv.type}</TableCell>
                        <TableCell className="text-xs text-center whitespace-nowrap">
                          {new Date(inv.date).toLocaleDateString("es-PE")}
                        </TableCell>
                        <TableCell className="text-sm">{inv.advertiser}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground text-right tabular-nums">
                          {inv.docNumber || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-center">{personKindLabel(inv.docType, inv.docNumber)}</TableCell>
                        <TableCell className="text-sm font-medium">{inv.listingTitle}</TableCell>
                        <TableCell className="text-center">
                          <EstadoEmision inv={inv} />
                        </TableCell>
                        {/* El símbolo de moneda no se separa de su importe. */}
                        <TableCell className="text-right font-bold tabular-nums whitespace-nowrap">
                          {formatSoles(inv.amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {puedeReintentar(inv) && (
                              <Button
                                variant="outline" size="sm" className="gap-1.5"
                                disabled={retrying === inv.id}
                                onClick={() => reintentar(inv)}
                              >
                                <RefreshCw size={14} className={retrying === inv.id ? "animate-spin" : undefined} />
                                Reintentar
                              </Button>
                            )}
                            {/* Anular es irreversible y mueve saldo, así que
                                solo aparece donde tiene sentido: en comprobantes
                                que no estén ya anulados. El permiso lo reexige
                                el servidor dentro de la RPC. */}
                            {!inv.anuladoAt && (
                              <AnularDialog inv={inv} onHecho={recargarInvoices} />
                            )}
                            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setInvoiceDetail(inv)}>
                              <Eye size={14} /> Ver
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {!invoicesLoading && invoices.length > 0 && (
                <TablePagination
                  page={invPage}
                  totalPages={invTotalPages}
                  total={invTotal}
                  from={invTotal === 0 ? 0 : (invPage - 1) * INVOICES_PAGE_SIZE + 1}
                  to={Math.min(invPage * INVOICES_PAGE_SIZE, invTotal)}
                  setPage={setInvPage}
                  noun="comprobantes"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <InvoiceDetailDialog invoice={invoiceDetail} onClose={() => setInvoiceDetail(null)} />
    </>
  );
};

export default AdminCommercial;
