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
import { Search, UserCheck, UserX, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { adminUsers, AdminUserStatus } from "@/data/adminMockData";
import { toast } from "@/hooks/use-toast";

const statusColor: Record<AdminUserStatus, string> = {
  Activo: "bg-success/15 text-success border-success/30",
  Pendiente: "bg-warning/15 text-warning border-warning/30",
  Suspendido: "bg-destructive/15 text-destructive border-destructive/30",
};

const PAGE_SIZE = 5;

type User = (typeof adminUsers)[number];

const AdminUsers = ({ role }: { role: AdminRole }) => {
  const [q, setQ] = useState("");
  const [r, setR] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () =>
      adminUsers.filter((u) =>
        (r === "all" || u.role === r) &&
        (q === "" || u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase())),
      ),
    [q, r],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const list = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const act = (l: string, u: User) => toast({ title: l, description: `${u.name} · ${u.email}` });

  const renderActions = (u: User, compact = false) => {
    const Btn = compact ? "outline" : "ghost";
    const size: "icon" | "sm" = compact ? "sm" : "icon";
    const iconSize = compact ? 14 : 16;
    return (
      <>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size={size} variant={Btn as any} className="text-success" title="Activar"><UserCheck size={iconSize} /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Activar a {u.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                El usuario recibirá acceso completo a la plataforma. Se le notificará por correo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => act("Usuario activado", u)}>Activar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size={size} variant={Btn as any} className="text-warning" title="Suspender"><UserX size={iconSize} /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Suspender a {u.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                El usuario perderá acceso temporal a la plataforma hasta su reactivación. Se le notificará por correo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => act("Usuario suspendido", u)}>Suspender</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size={size} variant={Btn as any} className="text-destructive" title="Eliminar"><Trash2 size={iconSize} /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar al usuario {u.name}?</AlertDialogTitle>
              <AlertDialogDescription>Esta acción es permanente y eliminará todos sus datos.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => act("Usuario eliminado", u)}>Eliminar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  };

  return (
    <AdminLayout role={role} title="Gestión de usuarios" breadcrumb={["Operación", "Usuarios"]}>
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base md:text-lg">Usuarios registrados</CardTitle>
            <p className="text-xs text-muted-foreground">{filtered.length} resultados</p>
          </div>
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Buscar usuario o correo..." className="pl-9" />
            </div>
            <Select value={r} onValueChange={(v) => { setR(v); setPage(1); }}>
              <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los roles</SelectItem>
                <SelectItem value="Anunciante">Anunciantes</SelectItem>
                <SelectItem value="Buscador">Buscadores</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Avisos</TableHead>
                  <TableHead>Registro</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                          {u.name.split(" ").map(n => n[0]).slice(0, 2).join("")}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{u.name}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{u.id}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell><Badge variant="outline">{u.role}</Badge></TableCell>
                    <TableCell>{u.listings}</TableCell>
                    <TableCell className="text-muted-foreground">{u.date}</TableCell>
                    <TableCell><Badge className={statusColor[u.status]} variant="outline">{u.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">{renderActions(u)}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden space-y-3">
            {list.map((u) => (
              <div key={u.id} className="border p-4 bg-card">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {u.name.split(" ").map(n => n[0]).slice(0, 2).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <Badge className={statusColor[u.status]} variant="outline">{u.status}</Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                  <Badge variant="outline">{u.role}</Badge>
                  <span>{u.listings} avisos</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">{renderActions(u, true)}</div>
              </div>
            ))}
          </div>

          {filtered.length > 0 && (
            <div className="flex items-center justify-between mt-5 pt-4 border-t">
              <p className="text-xs text-muted-foreground">Página {page} de {totalPages}</p>
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
    </AdminLayout>
  );
};

export default AdminUsers;
