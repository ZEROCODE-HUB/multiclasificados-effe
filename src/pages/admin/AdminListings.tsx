import { useMemo, useState } from "react";
import { AdminLayout, AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Search, Check, X, Star, Eye, ChevronLeft, ChevronRight, MapPin, Calendar, Tag, User } from "lucide-react";
import { adminListings, AdminListingStatus } from "@/data/adminMockData";
import { toast } from "@/hooks/use-toast";

const statusColor: Record<AdminListingStatus, string> = {
  Pendiente: "bg-warning/15 text-warning border-warning/30",
  Activo: "bg-success/15 text-success border-success/30",
  Rechazado: "bg-destructive/15 text-destructive border-destructive/30",
  Destacado: "bg-secondary/15 text-secondary border-secondary/30",
};

const PAGE_SIZE = 5;

type Listing = (typeof adminListings)[number];

const AdminListings = ({ role }: { role: AdminRole }) => {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Listing | null>(null);

  const filtered = useMemo(
    () =>
      adminListings.filter((l) =>
        (filter === "all" || l.status === filter) &&
        (q === "" || l.title.toLowerCase().includes(q.toLowerCase()) || l.id.toLowerCase().includes(q.toLowerCase())),
      ),
    [q, filter],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const list = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const action = (label: string, l: Listing) =>
    toast({ title: label, description: `Aviso ${l.id} · ${l.title}` });

  return (
    <AdminLayout role={role} title="Gestión de avisos" breadcrumb={["Operación", "Avisos"]}>
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base md:text-lg">Listado de avisos</CardTitle>
            <p className="text-xs text-muted-foreground">{filtered.length} resultados</p>
          </div>
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Buscar por ID o título..." className="pl-9" />
            </div>
            <Select value={filter} onValueChange={(v) => { setFilter(v); setPage(1); }}>
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
                        <Button size="icon" variant="ghost" title="Ver detalle" onClick={() => setDetail(l)}>
                          <Eye size={16} />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="text-success" title="Aprobar"><Check size={16} /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Aprobar este aviso?</AlertDialogTitle>
                              <AlertDialogDescription>
                                "{l.title}" pasará a estado <b>Activo</b> y será visible para los usuarios. Se notificará al anunciante.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => action("Aviso aprobado", l)}>Aprobar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <Button size="icon" variant="ghost" className="text-secondary" title="Destacar" onClick={() => action("Destacado", l)}><Star size={16} /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="text-destructive" title="Rechazar"><X size={16} /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Rechazar este aviso?</AlertDialogTitle>
                              <AlertDialogDescription>Se notificará al anunciante. Esta acción puede revertirse.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => action("Aviso rechazado", l)}>Rechazar</AlertDialogAction>
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
              <div key={l.id} className="border p-4 bg-card listing-shadow">
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
                  <Button size="sm" variant="outline" onClick={() => setDetail(l)}><Eye size={14} /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="text-success"><Check size={14} /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Aprobar este aviso?</AlertDialogTitle>
                        <AlertDialogDescription>"{l.title}" pasará a Activo.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => action("Aviso aprobado", l)}>Aprobar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button size="sm" variant="outline" className="text-secondary" onClick={() => action("Destacado", l)}><Star size={14} /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="text-destructive"><X size={14} /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Rechazar este aviso?</AlertDialogTitle>
                        <AlertDialogDescription>Se notificará al anunciante.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => action("Aviso rechazado", l)}>Rechazar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Sin resultados para tu búsqueda.</p>
            </div>
          )}

          {/* Paginación */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between mt-5 pt-4 border-t">
              <p className="text-xs text-muted-foreground">
                Página {page} de {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft size={14} /> Anterior
                </Button>
                <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                  Siguiente <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground">{detail.id}</p>
                    <DialogTitle className="text-lg md:text-xl">{detail.title}</DialogTitle>
                    <DialogDescription>{detail.advertiser}</DialogDescription>
                  </div>
                  <Badge className={statusColor[detail.status]} variant="outline">{detail.status}</Badge>
                </div>
              </DialogHeader>

              <div className="aspect-video bg-muted border flex items-center justify-center text-muted-foreground text-xs">
                Imagen principal del aviso
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Tag size={14} className="text-secondary" />
                  <span className="text-muted-foreground">Categoría:</span>
                  <span className="font-medium">{detail.category}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-secondary" />
                  <span className="text-muted-foreground">Publicado:</span>
                  <span className="font-medium">{detail.date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User size={14} className="text-secondary" />
                  <span className="text-muted-foreground">Anunciante:</span>
                  <span className="font-medium">{detail.advertiser}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="text-secondary" />
                  <span className="text-muted-foreground">Ubicación:</span>
                  <span className="font-medium">Lima, Perú</span>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Descripción</p>
                <p className="text-sm text-foreground leading-relaxed">
                  Aviso publicado por <b>{detail.advertiser}</b> en la categoría {detail.category}. Precio publicado: {detail.price}.
                  Toda la información se valida según las políticas de la plataforma antes de su aprobación.
                </p>
              </div>

              <div className="flex items-center justify-between border-t pt-3">
                <p className="text-2xl font-extrabold text-secondary">{detail.price}</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setDetail(null)}>Cerrar</Button>
                  <Button
                    onClick={() => { action("Aviso aprobado", detail); setDetail(null); }}
                    className="bg-success hover:bg-success/90"
                  >
                    <Check size={14} className="mr-1" /> Aprobar
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminListings;
