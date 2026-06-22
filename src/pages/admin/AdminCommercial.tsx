import { useState } from "react";
import { AdminLayout, AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { categories as initialCategories } from "@/data/mockData";
import { toast } from "@/hooks/use-toast";
import { loadInvoices, formatSoles } from "@/lib/pricing";


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

  // ===== Planes =====
  const [plans, setPlans] = useState<Plan[]>(initialPlans);
  const [planDialog, setPlanDialog] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState<Plan | null>(null);
  const openEditPlan = (p: Plan) => { setPlanForm({ ...p }); setPlanDialog(p); };
  const savePlan = () => {
    if (!planForm) return;
    setPlans((prev) => prev.map((p) => p.id === planForm.id ? planForm : p));
    toast({ title: "Plan actualizado", description: planForm.name });
    setPlanDialog(null);
  };

  // ===== Promociones =====
  const [promos, setPromos] = useState<Promo[]>(initialPromos);
  const [promoDialog, setPromoDialog] = useState(false);
  const [promoForm, setPromoForm] = useState<{ name: string; discount: string; until: string }>({ name: "", discount: "", until: "" });

  const createPromo = () => {
    if (!promoForm.name.trim()) return;
    const next: Promo = {
      id: Date.now(),
      name: promoForm.name.trim(),
      discount: promoForm.discount || "0%",
      until: promoForm.until || "Permanente",
      status: "Programada",
    };
    setPromos((p) => [next, ...p]);
    toast({ title: "Promoción creada", description: next.name });
    setPromoForm({ name: "", discount: "", until: "" });
    setPromoDialog(false);
  };

  const togglePromo = (p: Promo) => {
    const newStatus: Promo["status"] = p.status === "Activa" ? "Pausada" : "Activa";
    setPromos((prev) => prev.map((x) => x.id === p.id ? { ...x, status: newStatus } : x));
    toast({ title: `Promoción ${newStatus.toLowerCase()}`, description: p.name });
  };

  const deletePromo = (p: Promo) => {
    setPromos((prev) => prev.filter((x) => x.id !== p.id));
    toast({ title: "Promoción eliminada", description: p.name });
  };

  return (
    <AdminLayout role={role} title="Configuración comercial" breadcrumb={["Operación", "Comercial"]}>
      <Tabs defaultValue="categorias">
        <TabsList className="w-full overflow-x-auto justify-start no-scrollbar">
          <TabsTrigger value="categorias">Categorías</TabsTrigger>
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
