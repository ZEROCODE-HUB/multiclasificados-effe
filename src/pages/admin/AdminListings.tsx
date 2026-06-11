import { useState } from "react";
import { AdminLayout, AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, Check, X, Star, Eye } from "lucide-react";
import { adminListings, AdminListingStatus } from "@/data/adminMockData";
import { toast } from "@/hooks/use-toast";

const statusColor: Record<AdminListingStatus, string> = {
  Pendiente: "bg-warning/15 text-warning border-warning/30",
  Activo: "bg-success/15 text-success border-success/30",
  Rechazado: "bg-destructive/15 text-destructive border-destructive/30",
  Destacado: "bg-secondary/15 text-secondary border-secondary/30",
};

const AdminListings = ({ role }: { role: AdminRole }) => {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const list = adminListings.filter((l) =>
    (filter === "all" || l.status === filter) &&
    (q === "" || l.title.toLowerCase().includes(q.toLowerCase()) || l.id.toLowerCase().includes(q.toLowerCase()))
  );

  const action = (label: string, id: string) => toast({ title: `${label}`, description: `Aviso ${id}` });

  return (
    <AdminLayout role={role} title="Gestión de avisos" breadcrumb={["Operación", "Avisos"]}>
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base md:text-lg">Listado de avisos</CardTitle>
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por ID o título..." className="pl-9" />
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="Pendiente">Pendientes</SelectItem>
                <SelectItem value="Activo">Activos</SelectItem>
                <SelectItem value="Destacado">Destacados</SelectItem>
                <SelectItem value="Rechazado">Rechazados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Anunciante</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.id}</TableCell>
                    <TableCell className="font-medium">{l.title}</TableCell>
                    <TableCell className="text-muted-foreground">{l.advertiser}</TableCell>
                    <TableCell><Badge variant="outline">{l.category}</Badge></TableCell>
                    <TableCell className="font-semibold">{l.price}</TableCell>
                    <TableCell><Badge className={statusColor[l.status]} variant="outline">{l.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => action("Ver detalle", l.id)}><Eye size={16} /></Button>
                        <Button size="icon" variant="ghost" className="text-success" onClick={() => action("Aprobado", l.id)}><Check size={16} /></Button>
                        <Button size="icon" variant="ghost" className="text-secondary" onClick={() => action("Destacado", l.id)}><Star size={16} /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="text-destructive"><X size={16} /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Rechazar este aviso?</AlertDialogTitle>
                              <AlertDialogDescription>Se notificará al anunciante. Esta acción puede revertirse.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => action("Rechazado", l.id)}>Rechazar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {list.map((l) => (
              <div key={l.id} className="border rounded-xl p-4 bg-card listing-shadow">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-mono text-muted-foreground">{l.id}</p>
                    <p className="font-semibold text-foreground text-sm truncate">{l.title}</p>
                    <p className="text-xs text-muted-foreground">{l.advertiser}</p>
                  </div>
                  <Badge className={statusColor[l.status]} variant="outline">{l.status}</Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                  <Badge variant="outline">{l.category}</Badge>
                  <span className="font-bold text-foreground">{l.price}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => action("Ver", l.id)}><Eye size={14} /></Button>
                  <Button size="sm" variant="outline" className="text-success" onClick={() => action("Aprobado", l.id)}><Check size={14} /></Button>
                  <Button size="sm" variant="outline" className="text-secondary" onClick={() => action("Destacado", l.id)}><Star size={14} /></Button>
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => action("Rechazado", l.id)}><X size={14} /></Button>
                </div>
              </div>
            ))}
          </div>

          {list.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Sin resultados para tu búsqueda.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default AdminListings;
