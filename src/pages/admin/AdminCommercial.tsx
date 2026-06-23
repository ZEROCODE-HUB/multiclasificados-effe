import { useEffect, useState } from "react";
import { AdminLayout, AdminRole } from "@/components/AdminLayout";
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
import { Plus, Pencil, Trash2, FileText, SlidersHorizontal, Save } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { categories as initialCategories } from "@/data/mockData";
import { toast } from "@/hooks/use-toast";
import { loadInvoices, formatSoles } from "@/lib/pricing";
import { fetchSettings, setSetting } from "@/lib/admin";


const AdminCommercial = ({ role }: { role: AdminRole }) => {
  // ===== Categorías =====
  const [cats, setCats] = useState(initialCategories.map((c) => ({ id: c.id, name: c.name, count: c.count, Icon: c.icon })));
  const [catDialog, setCatDialog] = useState<{ open: boolean; editing: typeof cats[number] | null }>({ open: false, editing: null });
  const [catName, setCatName] = useState("");

  const openNewCat = () => { setCatName(""); setCatDialog({ open: true, editing: null }); };
  const openEditCat = (c: typeof cats[number]) => { setCatName(c.name); setCatDialog({ open: true, editing: c }); };
  const saveCat = () => {
    if (!catName.trim()) return;
    if (catDialog.editing) {
      setCats((p) => p.map((c) => c.id === catDialog.editing!.id ? { ...c, name: catName.trim() } : c));
      toast({ title: "Categoría actualizada", description: catName.trim() });
    } else {
      setCats((p) => [...p, { id: catName.toLowerCase().replace(/\s+/g, "-"), name: catName.trim(), count: 0, Icon: initialCategories[0].icon }]);
      toast({ title: "Categoría creada", description: catName.trim() });
    }
    setCatDialog({ open: false, editing: null });
  };
  const deleteCat = (c: typeof cats[number]) => {
    setCats((p) => p.filter((x) => x.id !== c.id));
    toast({ title: "Categoría eliminada", description: c.name });
  };

  // ===== Variables del sistema (REQ-ADM-04) =====
  const SETTING_KEYS = {
    commission_pct: "Comisión por transacción (%)",
    featured_price: "Precio de aviso destacado (S/)",
    free_listings_limit: "Límite de publicaciones gratis",
    gateway_stripe: "Pasarela Stripe activa",
    gateway_culqi: "Pasarela Culqi activa",
    maintenance_mode: "Modo mantenimiento",
  } as const;
  type SettingKey = keyof typeof SETTING_KEYS;
  const [settings, setSettings] = useState<Record<SettingKey, any>>({
    commission_pct: 8, featured_price: 25, free_listings_limit: 3,
    gateway_stripe: true, gateway_culqi: false, maintenance_mode: false,
  });
  const [savingSettings, setSavingSettings] = useState(false);

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
    <AdminLayout role={role} title="Configuración comercial" breadcrumb={["Operación", "Comercial"]}>
      <Tabs defaultValue="categorias">
        <TabsList className="w-full overflow-x-auto justify-start no-scrollbar">
          <TabsTrigger value="categorias">Categorías</TabsTrigger>
          <TabsTrigger value="sistema">Sistema</TabsTrigger>
          <TabsTrigger value="boletas">Boletas y facturas</TabsTrigger>
        </TabsList>

        {/* CATEGORÍAS */}
        <TabsContent value="categorias" className="pt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base md:text-lg">Categorías y subcategorías</CardTitle>
              <Button size="sm" className="gap-2" onClick={openNewCat}><Plus size={14} /> Nueva</Button>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {cats.map((c) => (
                <div key={c.id} className="border p-4 bg-card card-lift">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-accent text-accent-foreground flex items-center justify-center">
                      <c.Icon size={18} />
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" title="Editar" onClick={() => openEditCat(c)}><Pencil size={14} /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="text-destructive" title="Eliminar"><Trash2 size={14} /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar "{c.name}"?</AlertDialogTitle>
                            <AlertDialogDescription>Los avisos asociados quedarán sin categoría.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteCat(c)}>Eliminar</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <p className="font-semibold text-sm">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.count.toLocaleString()} avisos</p>
                </div>
              ))}
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
              <div className="space-y-3">
                <Label>Nombre</Label>
                <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Ej. Maquinaria pesada" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCatDialog({ open: false, editing: null })}>Cancelar</Button>
                <Button onClick={saveCat}>{catDialog.editing ? "Guardar" : "Crear"}</Button>
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{SETTING_KEYS.commission_pct}</Label>
                  <Input type="number" value={settings.commission_pct}
                    onChange={(e) => setSettings((s) => ({ ...s, commission_pct: Number(e.target.value) }))} />
                </div>
                <div className="space-y-2">
                  <Label>{SETTING_KEYS.featured_price}</Label>
                  <Input type="number" value={settings.featured_price}
                    onChange={(e) => setSettings((s) => ({ ...s, featured_price: Number(e.target.value) }))} />
                </div>
                <div className="space-y-2">
                  <Label>{SETTING_KEYS.free_listings_limit}</Label>
                  <Input type="number" value={settings.free_listings_limit}
                    onChange={(e) => setSettings((s) => ({ ...s, free_listings_limit: Number(e.target.value) }))} />
                </div>
              </div>

              <div className="space-y-3">
                {([
                  ["gateway_stripe", SETTING_KEYS.gateway_stripe, "Acepta pagos con tarjeta vía Stripe."],
                  ["gateway_culqi", SETTING_KEYS.gateway_culqi, "Acepta pagos locales vía Culqi."],
                  ["maintenance_mode", SETTING_KEYS.maintenance_mode, "Bloquea el acceso público mientras se realizan tareas."],
                ] as const).map(([key, label, desc]) => (
                  <div key={key} className="flex items-center justify-between border rounded-lg p-4">
                    <div className="pr-4">
                      <p className="font-medium text-sm">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Switch checked={!!settings[key]}
                      onCheckedChange={(v) => setSettings((s) => ({ ...s, [key]: v }))} />
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button onClick={saveSettings} disabled={savingSettings} className="gap-2">
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
              {loadInvoices().length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Aún no se han generado boletas.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N° Boleta</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Anunciante</TableHead>
                      <TableHead>Correo</TableHead>
                      <TableHead>Aviso</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadInvoices().map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-xs">{inv.number}</TableCell>
                        <TableCell className="text-xs">{new Date(inv.date).toLocaleDateString("es-PE")}</TableCell>
                        <TableCell className="text-sm">{inv.advertiser}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{inv.email}</TableCell>
                        <TableCell className="text-sm font-medium">{inv.listingTitle}</TableCell>
                        <TableCell className="text-right font-bold">{formatSoles(inv.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
};

export default AdminCommercial;
