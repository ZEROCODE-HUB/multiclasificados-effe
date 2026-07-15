import { useEffect, useState } from "react";
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
import { Plus, Pencil, Trash2, FileText, SlidersHorizontal, Save, GripVertical, Eye } from "lucide-react";
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
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { formatSoles } from "@/lib/pricing";
import { CATEGORY_ICON_NAMES as ICON_OPTIONS, iconFor, invalidateCategories } from "@/lib/categories";
import {
  fetchSettings, setSetting, fetchAllInvoices,
  fetchCategories, createCategory, updateCategory, deleteCategory, reorderCategories,
  type AdminInvoice, type AdminCategory,
} from "@/lib/admin";

// Tarjeta arrastrable. El asa (grip) es el único punto de agarre para que los
// botones de editar/eliminar sigan siendo clicables y la página pueda scrollear
// con el dedo en móvil.
function SortableCategoryCard({ cat, disabled, canEdit, onEdit, onDelete }: {
  cat: AdminCategory;
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
    } catch (e: any) {
      setCats(previous);
      toast({ title: "No se pudo guardar el orden", description: e?.message ?? "Error", variant: "destructive" });
    }
    setSavingOrder(false);
  };

  const openNewCat = () => { setCatName(""); setCatIcon("Tag"); setCatConditionEnabled(true); setCatDialog({ open: true, editing: null }); };
  const openEditCat = (c: AdminCategory) => { setCatName(c.name); setCatIcon(c.icon); setCatConditionEnabled(c.condition_enabled); setCatDialog({ open: true, editing: c }); };

  const saveCat = async () => {
    if (!catName.trim()) return;
    setSavingCat(true);
    try {
      if (catDialog.editing) {
        await updateCategory(catDialog.editing.id, { name: catName.trim(), icon: catIcon, condition_enabled: catConditionEnabled });
        toast({ title: "Categoría actualizada", description: catName.trim() });
      } else {
        // `sort_order` es 1-based (como el seed): la nueva va al final.
        await createCategory({ name: catName.trim(), icon: catIcon, sort_order: cats.length + 1, condition_enabled: catConditionEnabled });
        toast({ title: "Categoría creada", description: catName.trim() });
      }
      setCatDialog({ open: false, editing: null });
      loadCats();
      void invalidateCategories();
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e?.message ?? "Error", variant: "destructive" });
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
    } catch (e: any) {
      toast({ title: "No se pudo eliminar", description: e?.message ?? "Error", variant: "destructive" });
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
  } as const;
  type SettingKey = keyof typeof SETTING_KEYS;
  const [settings, setSettings] = useState<Record<SettingKey, any>>({
    commission_pct: 0, free_listings_limit: 0, maintenance_mode: false,
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // ===== Boletas y facturas (todos los anunciantes, desde la BD) =====
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoiceDetail, setInvoiceDetail] = useState<AdminInvoice | null>(null);
  const invoicesPager = usePagination(invoices, 10, invoices.length);

  useEffect(() => {
    fetchSettings().then((rows) => {
      if (!rows.length) return;
      setSettings((prev) => {
        const next = { ...prev };
        rows.forEach((s) => { if (s.key in next) (next as any)[s.key] = s.value; });
        return next;
      });
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      fetchAllInvoices().then(({ data }) => {
        if (mounted) { setInvoices(data); setInvoicesLoading(false); }
      });
    };
    load();
    // Refresca cuando se emite un comprobante nuevo (misma pestaña u otra).
    window.addEventListener("effe:invoices-updated", load);
    window.addEventListener("storage", load);
    return () => {
      mounted = false;
      window.removeEventListener("effe:invoices-updated", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await Promise.all(
        (Object.keys(SETTING_KEYS) as SettingKey[]).map((k) =>
          setSetting(k, settings[k], SETTING_KEYS[k]),
        ),
      );
      toast({ title: "Configuración guardada", description: "Las variables del sistema se actualizaron." });
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e?.message ?? "Error", variant: "destructive" });
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
                    {cats.map((c) => (
                      <SortableCategoryCard
                        key={c.id}
                        cat={c}
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
                  {catDialog.editing ? "Modifica el nombre de la categoría." : "Crea una nueva categoría para clasificar avisos."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Ej. Maquinaria pesada" />
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
                  {savingCat ? "Guardando..." : catDialog.editing ? "Guardar" : "Crear"}
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

        {/* BOLETAS (solo lectura) */}
        <TabsContent value="boletas" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                <FileText size={16} className="text-secondary" /> Boletas y facturas generadas
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {invoicesLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Cargando comprobantes…</p>
              ) : invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Aún no se han generado boletas.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N° Comprobante</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Anunciante</TableHead>
                      <TableHead>DNI/RUC</TableHead>
                      <TableHead>Usuario/Empresa</TableHead>
                      <TableHead>Aviso</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Ver</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoicesPager.pageItems.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-xs">{inv.number}</TableCell>
                        <TableCell className="text-xs capitalize">{inv.type}</TableCell>
                        <TableCell className="text-xs">{new Date(inv.date).toLocaleDateString("es-PE")}</TableCell>
                        <TableCell className="text-sm">{inv.advertiser}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{inv.docNumber || "—"}</TableCell>
                        <TableCell className="text-xs">{personKindLabel(inv.docType, inv.docNumber)}</TableCell>
                        <TableCell className="text-sm font-medium">{inv.listingTitle}</TableCell>
                        <TableCell className="text-right font-bold">{formatSoles(inv.amount)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setInvoiceDetail(inv)}>
                            <Eye size={14} /> Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {!invoicesLoading && invoices.length > 0 && (
                <TablePagination {...invoicesPager} noun="comprobantes" />
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
