import { useEffect, useState } from "react";
import { AdminLayout, AdminRole } from "@/components/AdminLayout";
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
import { Save, Calculator, RotateCcw, Plus, Pencil, Trash2, Tag, Percent, Wallet, Loader2 } from "lucide-react";
import {
  DEFAULT_SETTINGS,
  PricingSettings,
  buildMatrix,
  loadSettings,
  saveSettings,
  formatSoles,
} from "@/lib/pricing";
import {
  getCreditPackages, upsertCreditPackage, deleteCreditPackage, getAllCreditPackages,
  type CreditPackage,
} from "@/lib/credits";
import { supabase } from "@/lib/supabase";
import { categories } from "@/data/mockData";
import { toast } from "@/hooks/use-toast";

// ===== Ofertas (persistidas localmente) =====
interface Offer {
  id: string;
  name: string;
  startAt: string; // ISO
  endAt: string;
  discountPct: number;
  categoryIds: string[]; // [] = todas
}
const OFFERS_KEY = "effe:offers";
const loadOffers = (): Offer[] => {
  try { return JSON.parse(localStorage.getItem(OFFERS_KEY) || "[]"); } catch { return []; }
};
const saveOffers = (list: Offer[]) => localStorage.setItem(OFFERS_KEY, JSON.stringify(list));

// Cantidades 1..10 desplegando porcentajes acumulados.
// Convertimos `descPorAviso` (descuento acumulativo simétrico) en un arreglo editable de %
// donde el % en la fila N representa el descuento vs. el nivel N-1.
const QUANTITY_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const DURATION_ROWS: Array<7 | 15 | 30 | 60 | 90> = [7, 15, 30, 60, 90];

const AdminPricing = ({ role }: { role: AdminRole }) => {
  const [s, setS] = useState<PricingSettings>(() => loadSettings());
  const [settingsLoading, setSettingsLoading] = useState(true);

  // % de descuento por aviso editable por fila (filas 2..10).
  const [qtyDiscounts, setQtyDiscounts] = useState<number[]>(() => {
    const init = loadSettings().descPorAviso * 100;
    return QUANTITY_ROWS.map((n) => (n === 1 ? 0 : init));
  });

  const [offers, setOffers] = useState<Offer[]>(() => loadOffers());
  const [offerDialog, setOfferDialog] = useState<{ open: boolean; editing: Offer | null }>({ open: false, editing: null });
  const [offerForm, setOfferForm] = useState<Offer>({
    id: "", name: "", startAt: "", endAt: "", discountPct: 0, categoryIds: [],
  });

  // Paquetes de créditos
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [pkgLoading, setPkgLoading] = useState(true);
  const [pkgDialog, setPkgDialog] = useState<{ open: boolean; editing: CreditPackage | null }>({ open: false, editing: null });
  const [pkgForm, setPkgForm] = useState<Partial<CreditPackage>>({
    name: "", credits_amount: 50, price_soles: 45, is_active: true, sort_order: 0,
  });
  const [pkgSaving, setPkgSaving] = useState(false);

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
          const loaded: PricingSettings = {
            base: Number(data.base),
            descPorAviso: Number(data.desc_por_aviso),
            saltos: { ...DEFAULT_SETTINGS.saltos, ...(data.saltos ?? {}) },
            extras: { ...DEFAULT_SETTINGS.extras, ...(data.extras ?? {}) },
          };
          setS(loaded);
          setQtyDiscounts(QUANTITY_ROWS.map((n) => (n === 1 ? 0 : loaded.descPorAviso * 100)));
        }
        setSettingsLoading(false);
      });
  }, []);

  // Cargar paquetes de créditos
  useEffect(() => {
    getAllCreditPackages().then((pkgs) => { setPackages(pkgs); setPkgLoading(false); });
  }, []);

  useEffect(() => {
    const sync = () => setS(loadSettings());
    window.addEventListener("effe:pricing-updated", sync);
    return () => window.removeEventListener("effe:pricing-updated", sync);
  }, []);

  const save = async () => {
    const arr = qtyDiscounts.slice(1);
    const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : s.descPorAviso * 100;
    const next: PricingSettings = { ...s, descPorAviso: avg / 100 };
    setS(next);
    saveSettings(next);

    // Persistir en Supabase pricing_settings
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("pricing_settings").upsert({
      base: next.base,
      desc_por_aviso: next.descPorAviso,
      saltos: next.saltos,
      extras: next.extras,
      is_active: true,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    });

    toast({ title: "Tarifas actualizadas", description: "Guardado en la base de datos y en localStorage." });
  };

  const reset = () => {
    setS(DEFAULT_SETTINGS);
    setQtyDiscounts(QUANTITY_ROWS.map((n) => (n === 1 ? 0 : DEFAULT_SETTINGS.descPorAviso * 100)));
    saveSettings(DEFAULT_SETTINGS);
    toast({ title: "Restablecido a valores por defecto" });
  };

  // ===== Paquetes de créditos helpers =====
  const openNewPkg = () => {
    setPkgForm({ name: "", credits_amount: 50, price_soles: 45, is_active: true, sort_order: packages.length });
    setPkgDialog({ open: true, editing: null });
  };
  const openEditPkg = (pkg: CreditPackage) => {
    setPkgForm({ ...pkg });
    setPkgDialog({ open: true, editing: pkg });
  };
  const savePkg = async () => {
    if (!pkgForm.name?.trim()) {
      toast({ title: "Ingresa el nombre del paquete", variant: "destructive" }); return;
    }
    setPkgSaving(true);
    try {
      const saved = await upsertCreditPackage(pkgForm as CreditPackage);
      if (pkgDialog.editing) {
        setPackages((p) => p.map((x) => (x.id === saved.id ? saved : x)));
      } else {
        setPackages((p) => [...p, saved]);
      }
      setPkgDialog({ open: false, editing: null });
      toast({ title: pkgDialog.editing ? "Paquete actualizado" : "Paquete creado", description: saved.name });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar.", variant: "destructive" });
    } finally {
      setPkgSaving(false);
    }
  };
  const handleDeletePkg = async (id: string) => {
    try {
      await deleteCreditPackage(id);
      setPackages((p) => p.filter((x) => x.id !== id));
      toast({ title: "Paquete eliminado" });
    } catch (e) {
      toast({ title: "Error al eliminar", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  // ===== Ofertas helpers =====
  const openNewOffer = () => {
    setOfferForm({ id: `OFF-${Date.now()}`, name: "", startAt: "", endAt: "", discountPct: 0, categoryIds: [] });
    setOfferDialog({ open: true, editing: null });
  };
  const openEditOffer = (o: Offer) => {
    setOfferForm({ ...o });
    setOfferDialog({ open: true, editing: o });
  };
  const saveOffer = () => {
    if (!offerForm.name.trim() || !offerForm.startAt || !offerForm.endAt) {
      toast({ title: "Completa los datos requeridos", description: "Nombre, fecha de inicio y fin son obligatorios.", variant: "destructive" });
      return;
    }
    let next: Offer[];
    if (offerDialog.editing) {
      next = offers.map((o) => (o.id === offerDialog.editing!.id ? offerForm : o));
    } else {
      next = [offerForm, ...offers];
    }
    setOffers(next);
    saveOffers(next);
    setOfferDialog({ open: false, editing: null });
    toast({ title: offerDialog.editing ? "Oferta actualizada" : "Oferta creada", description: offerForm.name });
  };
  const deleteOffer = (id: string) => {
    const next = offers.filter((o) => o.id !== id);
    setOffers(next);
    saveOffers(next);
    toast({ title: "Oferta eliminada" });
  };
  const toggleCategory = (id: string) => {
    setOfferForm((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(id) ? f.categoryIds.filter((x) => x !== id) : [...f.categoryIds, id],
    }));
  };
  const toggleAllCategories = () => {
    setOfferForm((f) => ({
      ...f,
      categoryIds: f.categoryIds.length === categories.length ? [] : categories.map((c) => c.id),
    }));
  };
  const allCatsSelected = offerForm.categoryIds.length === categories.length;

  return (
    <AdminLayout role={role} title="Tarifas y Descuentos" breadcrumb={["Operación", "Tarifas y Descuentos"]}>
      <Tabs defaultValue="descuentos">
        <TabsList className="w-full overflow-x-auto justify-start no-scrollbar">
          <TabsTrigger value="descuentos">Parámetros de descuento</TabsTrigger>
          <TabsTrigger value="adicionales">Precios de adicionales</TabsTrigger>
          <TabsTrigger value="ofertas">Ofertas y Descuentos</TabsTrigger>
          <TabsTrigger value="matriz">Matriz de precios</TabsTrigger>
          <TabsTrigger value="creditos">Paquetes de créditos</TabsTrigger>
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
                              step="0.01"
                              value={qtyDiscounts[idx]}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value) || 0;
                                setQtyDiscounts((prev) => prev.map((p, i) => (i === idx ? v : p)));
                              }}
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
            <Button onClick={save} className="gap-2"><Save size={14} /> Guardar cambios</Button>
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
              <CardDescription className="text-xs">
                Valores fijos editables, independientes de los descuentos por cantidad o duración.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Adicional</TableHead>
                      <TableHead className="w-40">Precio (S/)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {([
                      ["img500", "Segunda imagen (hasta 500 KB)"],
                      ["pdf500", "PDF adjunto (hasta 500 KB)"],
                      ["urgente", "Urgente"],
                      ["destacado", "Destacado"],
                      ["confidencial", "Confidencial"],
                    ] as const).map(([key, label]) => (
                      <TableRow key={key}>
                        <TableCell className="font-medium">{label}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={s.extras[key]}
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
          <Button onClick={save} className="gap-2"><Save size={14} /> Guardar cambios</Button>
        </TabsContent>

        {/* ===== Ofertas y Descuentos ===== */}
        <TabsContent value="ofertas" className="pt-4 space-y-4">
          <Card>
            <CardHeader className="border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Percent size={16} className="text-secondary" /> Ofertas y Descuentos
                </CardTitle>
                <CardDescription className="text-xs">
                  Configura períodos con descuentos sobre los precios de la plataforma.
                </CardDescription>
              </div>
              <Button size="sm" className="gap-2" onClick={openNewOffer}><Plus size={14} /> Nueva oferta</Button>
            </CardHeader>
            <CardContent className="pt-5 overflow-x-auto">
              {offers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Aún no hay ofertas configuradas.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Fecha inicio</TableHead>
                      <TableHead>Fecha fin</TableHead>
                      <TableHead>% Descuento</TableHead>
                      <TableHead>Categorías</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {offers.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-semibold">{o.name}</TableCell>
                        <TableCell className="text-xs">{new Date(o.startAt).toLocaleString("es-PE")}</TableCell>
                        <TableCell className="text-xs">{new Date(o.endAt).toLocaleString("es-PE")}</TableCell>
                        <TableCell className="font-bold">{o.discountPct}%</TableCell>
                        <TableCell className="text-xs">
                          {o.categoryIds.length === 0 || o.categoryIds.length === categories.length
                            ? "Todas"
                            : o.categoryIds
                                .map((id) => categories.find((c) => c.id === id)?.name ?? id)
                                .join(", ")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => openEditOffer(o)}><Pencil size={14} /></Button>
                          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteOffer(o.id)}><Trash2 size={14} /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Dialog open={offerDialog.open} onOpenChange={(o) => setOfferDialog((s) => ({ ...s, open: o }))}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{offerDialog.editing ? "Editar oferta" : "Nueva oferta"}</DialogTitle>
                <DialogDescription>Define un período de descuento sobre los precios de la plataforma.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nombre de la oferta</Label>
                  <Input value={offerForm.name} onChange={(e) => setOfferForm({ ...offerForm, name: e.target.value })} placeholder="Ej. Black Friday" className="mt-1" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Fecha y hora de inicio</Label>
                    <Input type="datetime-local" value={offerForm.startAt} onChange={(e) => setOfferForm({ ...offerForm, startAt: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label>Fecha y hora de fin</Label>
                    <Input type="datetime-local" value={offerForm.endAt} onChange={(e) => setOfferForm({ ...offerForm, endAt: e.target.value })} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>% de descuento (0–100)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={offerForm.discountPct}
                    onChange={(e) => setOfferForm({ ...offerForm, discountPct: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
                    className="mt-1 max-w-[160px]"
                  />
                  {offerForm.discountPct === 100 && (
                    <p className="text-[11px] text-secondary font-semibold mt-1">Todos los precios se mostrarán como S/ 0.</p>
                  )}
                </div>
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
                          <Checkbox checked={offerForm.categoryIds.includes(c.id)} onCheckedChange={() => toggleCategory(c.id)} />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOfferDialog({ open: false, editing: null })}>Cancelar</Button>
                <Button onClick={saveOffer}>Guardar oferta</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ===== Matriz de precios ===== */}
        <TabsContent value="matriz" className="pt-4">
          <Card>
            <CardHeader className="border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Matriz de precios (S/. incluye IGV)</CardTitle>
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

        {/* ===== Paquetes de créditos ===== */}
        <TabsContent value="creditos" className="pt-4 space-y-4">
          <Card>
            <CardHeader className="border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Wallet size={16} className="text-secondary" /> Paquetes de créditos
                </CardTitle>
                <CardDescription className="text-xs">
                  1 crédito = 1 sol (S/). Los usuarios compran créditos en paquetes y los gastan al publicar.
                </CardDescription>
              </div>
              <Button size="sm" className="gap-2" onClick={openNewPkg}><Plus size={14} /> Nuevo paquete</Button>
            </CardHeader>
            <CardContent className="pt-5">
              {pkgLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-muted-foreground" />
                </div>
              ) : packages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No hay paquetes configurados. Crea uno con el botón "Nuevo paquete".
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Créditos</TableHead>
                        <TableHead>Precio (S/)</TableHead>
                        <TableHead>Orden</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {packages.map((pkg) => (
                        <TableRow key={pkg.id}>
                          <TableCell className="font-semibold">{pkg.name}</TableCell>
                          <TableCell className="font-bold text-secondary">{pkg.credits_amount}</TableCell>
                          <TableCell>{formatSoles(pkg.price_soles)}</TableCell>
                          <TableCell>{pkg.sort_order}</TableCell>
                          <TableCell>
                            <Badge variant={pkg.is_active ? "default" : "outline"}>
                              {pkg.is_active ? "Activo" : "Inactivo"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" onClick={() => openEditPkg(pkg)}><Pencil size={14} /></Button>
                            <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDeletePkg(pkg.id)}><Trash2 size={14} /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dialog crear/editar paquete */}
          <Dialog open={pkgDialog.open} onOpenChange={(o) => setPkgDialog((p) => ({ ...p, open: o }))}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{pkgDialog.editing ? "Editar paquete" : "Nuevo paquete de créditos"}</DialogTitle>
                <DialogDescription>Los créditos se acreditan automáticamente al completarse el pago.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nombre del paquete</Label>
                  <Input
                    value={pkgForm.name ?? ""}
                    onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })}
                    placeholder="Ej. Pro — 100 créditos"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Créditos (1 cr = S/ 1)</Label>
                    <Input
                      type="number"
                      step="1"
                      min={1}
                      value={pkgForm.credits_amount ?? ""}
                      onChange={(e) => setPkgForm({ ...pkgForm, credits_amount: parseFloat(e.target.value) || 0 })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Precio en S/</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0.01}
                      value={pkgForm.price_soles ?? ""}
                      onChange={(e) => setPkgForm({ ...pkgForm, price_soles: parseFloat(e.target.value) || 0 })}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Orden de visualización</Label>
                    <Input
                      type="number"
                      step="1"
                      min={0}
                      value={pkgForm.sort_order ?? 0}
                      onChange={(e) => setPkgForm({ ...pkgForm, sort_order: parseInt(e.target.value) || 0 })}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 cursor-pointer pb-1">
                      <Checkbox
                        checked={pkgForm.is_active ?? true}
                        onCheckedChange={(v) => setPkgForm({ ...pkgForm, is_active: !!v })}
                      />
                      <span className="text-sm">Activo (visible en tienda)</span>
                    </label>
                  </div>
                </div>
                {(pkgForm.credits_amount ?? 0) > 0 && (pkgForm.price_soles ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground border p-2 bg-muted/30">
                    Precio por crédito: <span className="font-semibold text-foreground">
                      {formatSoles((pkgForm.price_soles ?? 0) / (pkgForm.credits_amount ?? 1))}
                    </span>
                    {(pkgForm.price_soles ?? 0) < (pkgForm.credits_amount ?? 0) && (
                      <span className="text-success ml-2">
                        ({(((pkgForm.credits_amount ?? 0) - (pkgForm.price_soles ?? 0)) / (pkgForm.credits_amount ?? 1) * 100).toFixed(0)}% de descuento)
                      </span>
                    )}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPkgDialog({ open: false, editing: null })}>Cancelar</Button>
                <Button onClick={savePkg} disabled={pkgSaving} className="gap-2">
                  {pkgSaving ? <><Loader2 size={14} className="animate-spin" /> Guardando…</> : <><Save size={14} /> Guardar</>}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
};

export default AdminPricing;
