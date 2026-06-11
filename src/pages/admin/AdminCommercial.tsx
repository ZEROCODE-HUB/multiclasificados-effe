import { AdminLayout, AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import { categories } from "@/data/mockData";
import { plans } from "@/data/adminMockData";
import { toast } from "@/hooks/use-toast";

const promos = [
  { name: "Black Friday", discount: "30%", status: "Activa", until: "2026-06-30" },
  { name: "Primer aviso gratis", discount: "100%", status: "Activa", until: "Permanente" },
  { name: "Pro x 3 meses", discount: "20%", status: "Programada", until: "2026-07-15" },
];

const AdminCommercial = ({ role }: { role: AdminRole }) => {
  const act = (l: string) => toast({ title: l });
  return (
    <AdminLayout role={role} title="Configuración comercial" breadcrumb={["Operación", "Comercial"]}>
      <Tabs defaultValue="categorias">
        <TabsList className="w-full overflow-x-auto justify-start no-scrollbar">
          <TabsTrigger value="categorias">Categorías</TabsTrigger>
          <TabsTrigger value="planes">Planes y tarifas</TabsTrigger>
          <TabsTrigger value="promos">Promociones</TabsTrigger>
        </TabsList>

        <TabsContent value="categorias" className="pt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base md:text-lg">Categorías y subcategorías</CardTitle>
              <Button size="sm" className="gap-2" onClick={() => act("Nueva categoría")}><Plus size={14} /> Nueva</Button>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {categories.map((c) => (
                <div key={c.id} className="border rounded-xl p-4 bg-card card-lift">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-accent text-accent-foreground flex items-center justify-center">
                      <c.icon size={18} />
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost"><Pencil size={14} /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive"><Trash2 size={14} /></Button>
                    </div>
                  </div>
                  <p className="font-semibold text-sm">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.count.toLocaleString()} avisos</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="planes" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((p) => (
              <Card key={p.id} className="card-lift">
                <CardHeader>
                  <Badge className="w-fit" variant="outline">{p.id.toUpperCase()}</Badge>
                  <CardTitle className="text-lg">{p.name}</CardTitle>
                  <p className="text-2xl font-extrabold text-secondary">{p.price}<span className="text-xs text-muted-foreground font-normal"> / mes</span></p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground">Hasta <b className="text-foreground">{p.listings}</b> avisos</p>
                  <p className="text-muted-foreground"><b className="text-foreground">{p.featured}</b> destacados</p>
                  <p className="text-muted-foreground"><b className="text-foreground">{p.active.toLocaleString()}</b> suscriptores</p>
                  <Button size="sm" variant="outline" className="w-full mt-3" onClick={() => act(`Editar ${p.name}`)}>Editar plan</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="promos" className="pt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base md:text-lg">Promociones</CardTitle>
              <Button size="sm" className="gap-2" onClick={() => act("Nueva promoción")}><Plus size={14} /> Nueva</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {promos.map((p) => (
                <div key={p.name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg gradient-secondary text-secondary-foreground flex items-center justify-center">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{p.name}</p>
                      <p className="text-xs text-muted-foreground">Hasta {p.until}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-secondary border-secondary/40">-{p.discount}</Badge>
                    <Badge className={p.status === "Activa" ? "bg-success/15 text-success border-success/30" : "bg-warning/15 text-warning border-warning/30"} variant="outline">{p.status}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
};

export default AdminCommercial;
