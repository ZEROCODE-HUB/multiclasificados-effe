import { useEffect, useState } from "react";
import { AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePagination, TablePagination } from "@/components/TablePagination";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Save, Calculator, RotateCcw, Plus, Pencil, Trash2, Tag, Percent, Loader2 } from "lucide-react";
import {
  DEFAULT_SETTINGS,
  PricingSettings,
  DURATION_OPTIONS,
  buildMatrix,
  extrasTotal,
  loadSettings,
  priceForDuration,
  saveSettings,
  formatSoles,
} from "@/lib/pricing";
import {
  fetchPromotions, upsertPromotion, deletePromotion, type Promotion,
} from "@/lib/promotions";
import { supabase } from "@/lib/supabase";
import { useCategories } from "@/hooks/useCategories";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "@/hooks/use-toast";

// ===== Promociones (persistidas en la base de datos) =====
// Conversión ISO (BD) ↔ valor de <input type="datetime-local"> (hora local).
const toLocalInput = (iso: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (local: string): string => (local ? new Date(local).toISOString() : "");

// Cantidades 1..10 desplegando porcentajes acumulados.
// Convertimos `descPorAviso` (descuento acumulativo simétrico) en un arreglo editable de %
// donde el % en la fila N representa el descuento vs. el nivel N-1.
const QUANTITY_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const DURATION_ROWS: Array<7 | 15 | 30 | 60 | 90> = [7, 15, 30, 60, 90];

// Los adicionales que el panel deja editar. `img100`/`pdf100` van incluidos en
// el precio base y no se ofrecen aquí. La lista se usa dos veces: la tabla de
// tarifas y la previsualización de lo que costarán.
const EXTRAS_EDITABLES = [
  ["img500", "Segunda imagen (hasta 500 KB)"],
  ["pdf500", "PDF adjunto (hasta 500 KB)"],
  ["video20", "Video del aviso (hasta 20 s)"],
  ["urgente", "Urgente"],
  ["destacado", "Destacado"],
  ["confidencial", "Confidencial"],
] as const;

const AdminPricing = ({ role }: { role: AdminRole }) => {
  // Editar tarifas/promos/paquetes exige 'Pagos y planes' · Editar (edit); el
  // servidor lo reexige vía RLS (pricing_settings / promotions / credit_packages).
  const { can } = usePermissions(role === "admin");
  const canEdit = can("Pagos y planes", "edit");

  const categories = useCategories();
  const [s, setS] = useState<PricingSettings>(() => loadSettings());
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  // % de descuento por aviso editable por fila (filas 2..10). Se guarda como
  // texto para permitir el campo VACÍO (vacío = 0), sin forzar un "0" molesto.
  const [qtyDiscounts, setQtyDiscounts] = useState<string[]>(() => {
    const init = loadSettings().descPorAviso * 100;
    return QUANTITY_ROWS.map((n) => (n === 1 ? "0" : String(init)));
  });

  const [offers, setOffers] = useState<Promotion[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [offerSaving, setOfferSaving] = useState(false);
  const [offerDialog, setOfferDialog] = useState<{ open: boolean; editing: Promotion | null }>({ open: false, editing: null });
  const [offerForm, setOfferForm] = useState<Promotion>({
    id: "", name: "", starts_at: "", ends_at: "", discount_pct: 0, category_ids: [], is_active: true,
  });
  // % como texto para permitir el campo vacío (vacío = 0).
  const [discountText, setDiscountText] = useState("");

  const matrix = buildMatrix(s);
  const matrixPager = usePagination(matrix, 10, matrix.length);

  // Cargar pricing_settings desde Supabase al montar
  useEffect(() => {
    supabase
      .from("pricing_settings")
      .select("*")
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettingsId(data.id ?? null);
          const descCantidad = Array.isArray(data.desc_cantidad) && data.desc_cantidad.length
            ? (data.desc_cantidad as number[])
            : undefined;
          const loaded: PricingSettings = {
            base: Number(data.base),
            descPorAviso: Number(data.desc_por_aviso),
            descCantidad,
            saltos: { ...DEFAULT_SETTINGS.saltos, ...(data.saltos ?? {}) },
            extras: { ...DEFAULT_SETTINGS.extras, ...(data.extras ?? {}) },
          };
          setS(loaded);
          setQtyDiscounts(QUANTITY_ROWS.map((n) =>
            n === 1 ? "0" : String(Math.round((descCantidad?.[n] ?? loaded.descPorAviso) * 100 * 100) / 100),
          ));
        }
        setSettingsLoading(false);
      });
  }, []);

  // Cargar promociones desde la base de datos
  useEffect(() => {
    fetchPromotions().then((list) => { setOffers(list); setOffersLoading(false); });
  }, []);

  useEffect(() => {
    const sync = () => setS(loadSettings());
    window.addEventListener("effe:pricing-updated", sync);
    return () => window.removeEventListener("effe:pricing-updated", sync);
  }, []);

  const save = async () => {
    // % real por cada nivel de cantidad (índice n = descuento vs. nivel anterior).
    // Campo vacío se interpreta como 0.
    const descCantidad: number[] = [0];
    QUANTITY_ROWS.forEach((n, idx) => { descCantidad[n] = (parseFloat(qtyDiscounts[idx]) || 0) / 100; });
    // descPorAviso queda como respaldo (promedio de niveles 2..10).
    const arr = qtyDiscounts.slice(1).map((v) => parseFloat(v) || 0);
    const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : s.descPorAviso * 100;
    const next: PricingSettings = { ...s, descCantidad, descPorAviso: avg / 100 };
    setS(next);

    // Persistir en Supabase pricing_settings (actualiza la MISMA fila, sin duplicar).
    const { data: { user } } = await supabase.auth.getUser();
    const row: Record<string, unknown> = {
      base: next.base,
      desc_por_aviso: next.descPorAviso,
      desc_cantidad: descCantidad,
      saltos: next.saltos,
      extras: next.extras,
      is_active: true,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    if (settingsId) row.id = settingsId;
    const { data: saved, error: saveErr } = await supabase
      .from("pricing_settings")
      .upsert(row)
      .select("id")
      .single();
    if (saveErr) {
      toast({ title: "Error al guardar", description: saveErr.message, variant: "destructive" });
      return;
    }
    if (saved?.id) setSettingsId(saved.id);

    // El caché local se actualiza SOLO si la base de datos aceptó el cambio.
    // Antes se escribía primero: si el guardado fallaba, el navegador se quedaba
    // enseñando la tarifa nueva mientras la BD seguía con la vieja. Daba igual
    // cuando el precio lo calculaba el cliente; ahora que cobra el servidor, eso
    // es enseñar un precio y cobrar otro.
    saveSettings(next);

    toast({ title: "Tarifas actualizadas", description: "Guardado en la base de datos." });
  };

  const reset = () => {
    setS(DEFAULT_SETTINGS);
    setQtyDiscounts(QUANTITY_ROWS.map((n) => (n === 1 ? "0" : String(DEFAULT_SETTINGS.descPorAviso * 100))));
    saveSettings(DEFAULT_SETTINGS);
    toast({ title: "Restablecido a valores por defecto" });
  };

  // ===== Promociones helpers =====
  const openNewOffer = () => {
    setOfferForm({ id: "", name: "", starts_at: "", ends_at: "", discount_pct: 0, category_ids: [], is_active: true });
    setDiscountText("");
    setOfferDialog({ open: true, editing: null });
  };
  const openEditOffer = (o: Promotion) => {
    setOfferForm({ ...o });
    setDiscountText(String(o.discount_pct));
    setOfferDialog({ open: true, editing: o });
  };
  const saveOffer = async () => {
    if (!offerForm.name.trim() || !offerForm.starts_at || !offerForm.ends_at) {
      toast({ title: "Completa los datos requeridos", description: "Nombre, fecha de inicio y fin son obligatorios.", variant: "destructive" });
      return;
    }
    if (new Date(offerForm.ends_at) <= new Date(offerForm.starts_at)) {
      toast({ title: "Fechas inválidas", description: "La fecha de fin debe ser posterior a la de inicio.", variant: "destructive" });
      return;
    }
    setOfferSaving(true);
    try {
      // Campo vacío = 0; se acota a 0–100.
      const pct = Math.max(0, Math.min(100, parseFloat(discountText) || 0));
      const payload = { ...offerForm, discount_pct: pct, id: offerDialog.editing ? offerForm.id : undefined };
      const saved = await upsertPromotion(payload);
      setOffers((prev) => offerDialog.editing ? prev.map((o) => (o.id === saved.id ? saved : o)) : [saved, ...prev]);
      setOfferDialog({ open: false, editing: null });
      toast({ title: offerDialog.editing ? "Promoción actualizada" : "Promoción creada", description: saved.name });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar.", variant: "destructive" });
    } finally {
      setOfferSaving(false);
    }
  };
  const deleteOffer = async (id: string) => {
    try {
      await deletePromotion(id);
      setOffers((prev) => prev.filter((o) => o.id !== id));
      toast({ title: "Promoción eliminada" });
    } catch (e) {
      toast({ title: "Error al eliminar", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };
  const toggleCategory = (id: string) => {
    setOfferForm((f) => ({
      ...f,
      category_ids: f.category_ids.includes(id) ? f.category_ids.filter((x) => x !== id) : [...f.category_ids, id],
    }));
  };
  const toggleAllCategories = () => {
    setOfferForm((f) => ({
      ...f,
      category_ids: f.category_ids.length === categories.length ? [] : categories.map((c) => c.id),
    }));
  };
  const allCatsSelected = offerForm.category_ids.length === categories.length;

  return (
    <>
      {!canEdit && (
        <p className="mb-4 text-xs rounded-lg border bg-muted/50 px-3 py-2 text-muted-foreground">
          Solo lectura: no tienes permiso para editar tarifas, promociones ni paquetes. Un superadministrador puede habilitarlo en Roles y permisos.
        </p>
      )}
      <Tabs defaultValue="descuentos">
        <TabsList className="w-full overflow-x-auto justify-start no-scrollbar">
          <TabsTrigger value="descuentos">Parámetros de descuento</TabsTrigger>
          <TabsTrigger value="adicionales">Precios de adicionales</TabsTrigger>
          <TabsTrigger value="ofertas">Promociones</TabsTrigger>
          <TabsTrigger value="matriz">Matriz de precios</TabsTrigger>
        </TabsList>

        {/* ===== Parámetros de descuento ===== */}
        <TabsContent value="descuentos" className="pt-4 space-y-5">
          {/* Subsección A — Precio base */}
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator size={16} className="text-secondary" /> Precio base
              </CardTitle>
              <CardDescription className="text-xs">
                La matriz de precios se calcula automáticamente a partir de este valor y los descuentos.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 max-w-md">
              <Label>Precio base (1 aviso, 7 días) en S/ con IGV</Label>
              <Input
                type="number"
                step="0.01"
                value={s.base}
                onChange={(e) => setS({ ...s, base: parseFloat(e.target.value) || 0 })}
                className="mt-1"
              />
            </CardContent>
          </Card>

          {/* Subsección B — Descuento por cantidad de avisos */}
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base">Descuento por cantidad de avisos</CardTitle>
              <CardDescription className="text-xs">
                El descuento se aplica de forma acumulativa sobre el nivel anterior.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">N° de avisos</TableHead>
                      <TableHead>% de descuento vs. nivel anterior</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {QUANTITY_ROWS.map((n, idx) => (
                      <TableRow key={n}>
                        <TableCell className="font-bold">{n}</TableCell>
                        <TableCell>
                          {n === 1 ? (
                            <span className="text-muted-foreground text-sm">0% (base)</span>
                          ) : (
                            <Input
                              type="number"
                              step="1"
                              min={0}
                              max={100}
                              placeholder="0"
                              value={qtyDiscounts[idx]}
                              onChange={(e) => setQtyDiscounts((prev) => prev.map((p, i) => (i === idx ? e.target.value : p)))}
                              className="max-w-[160px]"
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Subsección C — Descuento por rango de días */}
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base">Descuento por rango de días</CardTitle>
              <CardDescription className="text-xs">
                El precio de cada rango resulta de duplicar el rango anterior y aplicar el descuento indicado.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Días</TableHead>
                      <TableHead>% de descuento aplicado al duplicar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {DURATION_ROWS.map((d) => (
                      <TableRow key={d}>
                        <TableCell className="font-bold">{d}</TableCell>
                        <TableCell>
                          {d === 7 ? (
                            <span className="text-muted-foreground text-sm">0% (base)</span>
                          ) : (
                            <Input
                              type="number"
                              step="0.01"
                              value={(s.saltos[d as 15 | 30 | 60 | 90] * 100).toFixed(2)}
                              onChange={(e) =>
                                setS({
                                  ...s,
                                  saltos: { ...s.saltos, [d]: (parseFloat(e.target.value) || 0) / 100 },
                                })
                              }
                              className="max-w-[160px]"
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button onClick={save} disabled={!canEdit} className="gap-2"><Save size={14} /> Guardar cambios</Button>
            <Button variant="outline" onClick={reset} className="gap-2"><RotateCcw size={14} /> Restablecer</Button>
          </div>
        </TabsContent>

        {/* ===== Precios de adicionales ===== */}
        <TabsContent value="adicionales" className="pt-4 space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <Tag size={16} className="text-secondary" /> Precios de adicionales
              </CardTitle>
              {/* Decía "valores fijos, independientes de los descuentos por
                  cantidad o duración", que desde que el adicional se cobra por
                  día es justo lo contrario. */}
              <CardDescription className="text-xs">
                <strong className="text-foreground">Es una tarifa DIARIA</strong>: se multiplica por los días que dure el aviso.
                Un adicional de S/ 5 en un aviso de 30 días son S/ 150.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Adicional</TableHead>
                      <TableHead className="w-40">Precio por día (S/)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {EXTRAS_EDITABLES.map(([key, label]) => (
                      <TableRow key={key}>
                        <TableCell className="font-medium">{label}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={s.extras[key]}
                            disabled={!canEdit}
                            onChange={(e) => setS({ ...s, extras: { ...s.extras, [key]: parseFloat(e.target.value) || 0 } })}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Lo que de verdad va a pagar el usuario. Sin esto es fácil dejar un
              S/ 5 creyendo que es el precio total del adicional. */}
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base">Lo que costará cada adicional</CardTitle>
              <CardDescription className="text-xs">
                Con las tarifas de arriba, según la duración que elija el anunciante.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Adicional</TableHead>
                      {DURATION_OPTIONS.map((d) => (
                        <TableHead key={d} className="text-right">{d} días</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {EXTRAS_EDITABLES.map(([key, label]) => (
                      <TableRow key={key}>
                        <TableCell className="font-medium whitespace-nowrap">{label}</TableCell>
                        {DURATION_OPTIONS.map((d) => (
                          <TableCell key={d} className="text-right tabular-nums">
                            {formatSoles(extrasTotal({ [key]: 1 }, d, s))}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                Como referencia, el aviso solo (sin adicionales) cuesta{" "}
                {DURATION_OPTIONS.map((d) => `${formatSoles(priceForDuration(1, d, s))} a ${d} días`).join(" · ")}.
              </p>
            </CardContent>
          </Card>

          <Button onClick={save} disabled={!canEdit} className="gap-2"><Save size={14} /> Guardar cambios</Button>
        </TabsContent>

        {/* ===== Ofertas y Descuentos ===== */}
        <TabsContent value="ofertas" className="pt-4 space-y-4">
          <Card>
            <CardHeader className="border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Percent size={16} className="text-secondary" /> Promociones
                </CardTitle>
                <CardDescription className="text-xs">
                  Descuento por categoría y período. Se aplica automáticamente al publicar.
                </CardDescription>
              </div>
              {canEdit && (
                <Button size="sm" className="gap-2" onClick={openNewOffer}><Plus size={14} /> Nueva promoción</Button>
              )}
            </CardHeader>
            <CardContent className="pt-5 overflow-x-auto">
              {offersLoading ? (
                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
              ) : offers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Aún no hay promociones configuradas.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Inicio</TableHead>
                      <TableHead>Fin</TableHead>
                      <TableHead>% Descuento</TableHead>
                      <TableHead>Categorías</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {offers.map((o) => {
                      const now = Date.now();
                      const vigente = o.is_active && new Date(o.starts_at).getTime() <= now && new Date(o.ends_at).getTime() >= now;
                      return (
                        <TableRow key={o.id}>
                          <TableCell className="font-semibold">{o.name}</TableCell>
                          <TableCell className="text-xs">{new Date(o.starts_at).toLocaleString("es-PE")}</TableCell>
                          <TableCell className="text-xs">{new Date(o.ends_at).toLocaleString("es-PE")}</TableCell>
                          <TableCell className="font-bold">{o.discount_pct}%</TableCell>
                          <TableCell className="text-xs">
                            {o.category_ids.length === 0 || o.category_ids.length === categories.length
                              ? "Todas"
                              : o.category_ids
                                  .map((id) => categories.find((c) => c.id === id)?.name ?? id)
                                  .join(", ")}
                          </TableCell>
                          <TableCell>
                            {!o.is_active
                              ? <Badge variant="outline">Inactiva</Badge>
                              : vigente
                                ? <Badge className="bg-success text-success-foreground">Vigente</Badge>
                                : <Badge variant="outline">Programada</Badge>}
                          </TableCell>
                          <TableCell className="text-right">
                            {canEdit ? (
                              <>
                                <Button size="icon" variant="ghost" onClick={() => openEditOffer(o)}><Pencil size={14} /></Button>
                                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteOffer(o.id)}><Trash2 size={14} /></Button>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Dialog open={offerDialog.open} onOpenChange={(o) => setOfferDialog((s) => ({ ...s, open: o }))}>
            <DialogContent className="sm:max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{offerDialog.editing ? "Editar promoción" : "Nueva promoción"}</DialogTitle>
                <DialogDescription>El descuento se aplica automáticamente al costo al publicar en las categorías elegidas durante el período.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nombre de la promoción</Label>
                  <Input value={offerForm.name} onChange={(e) => setOfferForm({ ...offerForm, name: e.target.value })} placeholder="Ej. Día de la Madre" className="mt-1" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Fecha y hora de inicio</Label>
                    <Input type="datetime-local" value={toLocalInput(offerForm.starts_at)} onChange={(e) => setOfferForm({ ...offerForm, starts_at: fromLocalInput(e.target.value) })} className="mt-1" />
                  </div>
                  <div>
                    <Label>Fecha y hora de fin</Label>
                    <Input type="datetime-local" value={toLocalInput(offerForm.ends_at)} onChange={(e) => setOfferForm({ ...offerForm, ends_at: fromLocalInput(e.target.value) })} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>% de descuento (0–100)</Label>
                  <Input
                    type="number"
                    step="1"
                    min={0}
                    max={100}
                    placeholder="0"
                    value={discountText}
                    onChange={(e) => setDiscountText(e.target.value)}
                    className="mt-1 max-w-[160px]"
                  />
                  {(parseFloat(discountText) || 0) === 100 && (
                    <p className="text-[11px] text-secondary font-semibold mt-1">Publicar en esas categorías costará S/ 0.</p>
                  )}
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox checked={offerForm.is_active} onCheckedChange={(v) => setOfferForm({ ...offerForm, is_active: !!v })} />
                  Activa (se aplica dentro del período)
                </label>
                <div>
                  <Label>Aplicar a categorías</Label>
                  <div className="mt-2 border p-3 space-y-2 max-h-60 overflow-y-auto">
                    <label className="flex items-center gap-2 cursor-pointer font-semibold text-sm">
                      <Checkbox checked={allCatsSelected} onCheckedChange={toggleAllCategories} />
                      Todas las categorías
                    </label>
                    <div className="border-t pt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {categories.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm">
                          <Checkbox checked={offerForm.category_ids.includes(c.id)} onCheckedChange={() => toggleCategory(c.id)} />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOfferDialog({ open: false, editing: null })} disabled={offerSaving}>Cancelar</Button>
                <Button onClick={saveOffer} disabled={offerSaving} className="gap-2">
                  {offerSaving ? <><Loader2 size={14} className="animate-spin" /> Guardando…</> : <><Save size={14} /> Guardar promoción</>}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ===== Matriz de precios ===== */}
        <TabsContent value="matriz" className="pt-4">
          <Card>
            <CardHeader className="border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Matriz de precios (S/ incluye IGV)</CardTitle>
                <CardDescription className="text-xs">Calculada automáticamente a partir de los parámetros.</CardDescription>
              </div>
              <Badge variant="outline" className="text-secondary border-secondary/40">Automática</Badge>
            </CardHeader>
            <CardContent className="overflow-x-auto pt-5">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Avisos</TableHead>
                    <TableHead>7 días</TableHead>
                    <TableHead>15 días</TableHead>
                    <TableHead>30 días</TableHead>
                    <TableHead>60 días</TableHead>
                    <TableHead>90 días</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrixPager.pageItems.map((row) => (
                    <TableRow key={row.n}>
                      <TableCell className="font-bold text-primary">{row.n}</TableCell>
                      <TableCell className="font-mono text-xs">{formatSoles(row.values[7])}</TableCell>
                      <TableCell className="font-mono text-xs">{formatSoles(row.values[15])}</TableCell>
                      <TableCell className="font-mono text-xs">{formatSoles(row.values[30])}</TableCell>
                      <TableCell className="font-mono text-xs">{formatSoles(row.values[60])}</TableCell>
                      <TableCell className="font-mono text-xs">{formatSoles(row.values[90])}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination {...matrixPager} noun="filas" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
};

export default AdminPricing;
