import { useEffect, useMemo, useState } from "react";
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
import { Search, UserCheck, Ban, BadgeCheck, KeyRound, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { fetchAdminUsers, setUserStatus, verifyUser, deleteUser, setUserRole, type AdminUser } from "@/lib/admin";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

// Mapa estado real (BD) -> etiqueta y color del diseño existente.
const statusMeta: Record<string, { label: string; color: string }> = {
  active:    { label: "Activo",     color: "bg-success/15 text-success border-success/30" },
  pending:   { label: "Pendiente",  color: "bg-warning/15 text-warning border-warning/30" },
  suspended: { label: "Suspendido", color: "bg-destructive/15 text-destructive border-destructive/30" },
  banned:    { label: "Baneado",    color: "bg-destructive/20 text-destructive border-destructive/40" },
};
const metaFor = (s: string) => statusMeta[s] ?? statusMeta.active;

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const PAGE_SIZE = 5;

// Base de URL para los enlaces del correo (reset de contraseña). Usa el dominio
// público si está definido para que el correo apunte a producción aunque el staff
// dispare la acción desde localhost; si no, cae al origen actual.
const SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;

const AdminUsers = ({ role }: { role: AdminRole }) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [r, setR] = useState("all");
  const [page, setPage] = useState(1);

  const load = () => fetchAdminUsers().then(({ data }) => setUsers(data));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () =>
      users.filter((u) =>
        (r === "all" || u.roles.split(",").includes(r)) &&
        (q === "" || (u.full_name ?? "").toLowerCase().includes(q.toLowerCase()) || (u.email ?? "").toLowerCase().includes(q.toLowerCase())),
      ),
    [users, q, r],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const list = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Ejecuta una acción real contra la BD si el id es un usuario real (uuid);
  // si es un dato mock (sin backend) solo muestra el toast para no romper la demo.
  const run = async (label: string, u: AdminUser, fn: () => Promise<void>) => {
    if (!isUuid(u.id)) { toast({ title: label, description: `${u.full_name} · ${u.email}` }); return; }
    try {
      await fn();
      toast({ title: label, description: `${u.full_name} · ${u.email}` });
      load();
    } catch (e: any) {
      toast({ title: "No se pudo completar", description: e?.message ?? "Error", variant: "destructive" });
    }
  };

  const resetPassword = (u: AdminUser) =>
    run("Correo de restablecimiento enviado", u, async () => {
      // Dispara el correo de recuperación de Supabase (no requiere Edge Function).
      const { error } = await supabase.auth.resetPasswordForEmail(u.email, {
        redirectTo: `${SITE_URL}/reset-password`,
      });
      if (error) throw error;
      // Registro de auditoría (best-effort).
      try {
        await supabase.rpc("log_audit", {
          p_action: "reset_password", p_entity_type: "user", p_entity_id: u.id,
          p_metadata: { email: u.email },
        });
      } catch { /* no bloquea el flujo */ }
    });

  const initials = (name: string) => (name || "?").split(" ").map((n) => n[0]).slice(0, 2).join("");
  const primaryRole = (roles: string) => {
    const r0 = roles.split(",")[0] || "buscador";
    return r0.charAt(0).toUpperCase() + r0.slice(1);
  };

  // Roles asignables desde el panel (enum app_role).
  const ASSIGNABLE_ROLES = [
    { value: "buscador", label: "Buscador" },
    { value: "anunciante", label: "Anunciante" },
    { value: "moderador", label: "Moderador" },
    { value: "soporte", label: "Soporte" },
    { value: "admin", label: "Admin" },
    { value: "superadmin", label: "Super Admin" },
  ];

  // Celda de rol: el superadmin puede asignar rol con un selector; los demás solo lo ven.
  const roleControl = (u: AdminUser) => {
    if (role !== "superadmin") {
      return <Badge variant="outline">{primaryRole(u.roles)}</Badge>;
    }
    // Rol "efectivo": el de mayor jerarquía que tenga el usuario.
    const RANK = ["superadmin", "admin", "moderador", "soporte", "anunciante", "buscador"];
    const owned = u.roles.split(",").filter(Boolean);
    const current = RANK.find((r) => owned.includes(r)) ?? "buscador";
    return (
      <Select
        value={current}
        onValueChange={(v) => v !== current && run(`Rol cambiado a "${v}"`, u, () => setUserRole(u.id, v))}
      >
        <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ASSIGNABLE_ROLES.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  };

  const renderActions = (u: AdminUser, compact = false) => {
    const Btn = compact ? "outline" : "ghost";
    const size: "icon" | "sm" = compact ? "sm" : "icon";
    const iconSize = compact ? 14 : 16;
    // Un solo botón que alterna según el estado: si está baneado permite
    // activarlo; en cualquier otro caso permite banearlo.
    const isBanned = u.status === "banned";
    return (
      <>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size={size}
              variant={Btn as any}
              className={isBanned ? "text-success" : "text-destructive"}
              title={isBanned ? "Activar" : "Banear"}
            >
              {isBanned ? <UserCheck size={iconSize} /> : <Ban size={iconSize} />}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isBanned ? `¿Activar a ${u.full_name}?` : `¿Banear al usuario ${u.full_name}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isBanned
                  ? "El usuario recibirá acceso completo a la plataforma. Se le notificará por correo."
                  : "El usuario perderá el acceso de forma permanente. Solo el superadministrador puede revertirlo."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              {isBanned ? (
                <AlertDialogAction onClick={() => run("Usuario activado", u, () => setUserStatus(u.id, "active"))}>Activar</AlertDialogAction>
              ) : (
                <AlertDialogAction onClick={() => run("Usuario baneado", u, () => setUserStatus(u.id, "banned"))}>Banear</AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size={size} variant={Btn as any} className={u.verified ? "text-secondary" : "text-muted-foreground"} title={u.verified ? "Quitar verificación" : "Verificar"}><BadgeCheck size={iconSize} /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{u.verified ? `¿Quitar la verificación de ${u.full_name}?` : `¿Verificar a ${u.full_name}?`}</AlertDialogTitle>
              <AlertDialogDescription>
                {u.verified ? "El perfil dejará de aparecer como verificado." : "El perfil quedará marcado como verificado / oficial."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => run(u.verified ? "Verificación retirada" : "Usuario verificado", u, () => verifyUser(u.id, !u.verified))}>
                {u.verified ? "Quitar" : "Verificar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size={size} variant={Btn as any} className="text-primary" title="Restablecer contraseña"><KeyRound size={iconSize} /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Restablecer la contraseña de {u.full_name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Se enviará un correo a {u.email} con un enlace para crear una nueva contraseña.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => resetPassword(u)}>Enviar enlace</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size={size} variant={Btn as any} className="text-destructive" title="Eliminar"><Trash2 size={iconSize} /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar al usuario {u.full_name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción es <b>permanente e irreversible</b>: se borrará la cuenta junto con su perfil,
                avisos, mensajes y demás datos. Solo el superadministrador puede hacerlo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={() => run("Usuario eliminado", u, () => deleteUser(u.id))}
              >
                Eliminar definitivamente
              </AlertDialogAction>
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
                <SelectItem value="anunciante">Anunciantes</SelectItem>
                <SelectItem value="buscador">Buscadores</SelectItem>
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
                  <TableHead>Verificación</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((u) => {
                  const m = metaFor(u.status);
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                            {initials(u.full_name)}
                          </div>
                          <div>
                            <p className="font-medium text-sm flex items-center gap-1">
                              {u.full_name}
                              {u.verified && <BadgeCheck size={13} className="text-secondary" />}
                            </p>
                            <p className="text-[10px] font-mono text-muted-foreground">{u.id.slice(0, 8)}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>{roleControl(u)}</TableCell>
                      <TableCell>{u.listings_count}</TableCell>
                      <TableCell className="text-muted-foreground">{(u.created_at ?? "").slice(0, 10)}</TableCell>
                      <TableCell><Badge className={m.color} variant="outline">{m.label}</Badge></TableCell>
                      <TableCell>
                        {u.verified ? (
                          <Badge variant="outline" className="gap-1 bg-secondary/15 text-secondary border-secondary/30">
                            <BadgeCheck size={12} /> Verificado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Sin verificar</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">{renderActions(u)}</div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden space-y-3">
            {list.map((u) => {
              const m = metaFor(u.status);
              return (
                <div key={u.id} className="border p-4 bg-card">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {initials(u.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate flex items-center gap-1">
                        {u.full_name}
                        {u.verified && <BadgeCheck size={13} className="text-secondary flex-shrink-0" />}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    <Badge className={m.color} variant="outline">{m.label}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {roleControl(u)}
                      {u.verified ? (
                        <Badge variant="outline" className="gap-1 bg-secondary/15 text-secondary border-secondary/30">
                          <BadgeCheck size={11} /> Verificado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Sin verificar</Badge>
                      )}
                    </div>
                    <span className="flex-shrink-0">{u.listings_count} avisos</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">{renderActions(u, true)}</div>
                </div>
              );
            })}
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
