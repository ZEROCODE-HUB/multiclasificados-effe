import { useEffect, useMemo, useState } from "react";
import { AdminRole } from "@/components/AdminLayout";
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
import { Search, UserCheck, Ban, BadgeCheck, KeyRound, Trash2, ChevronLeft, ChevronRight, Coins, Copy, Check, Loader2 } from "lucide-react";
import { fetchAdminUsers, setUserStatus, verifyUser, deleteUser, setUserRole, grantCredits, type AdminUser } from "@/lib/admin";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

// Mapa estado real (BD) -> etiqueta y color del diseño existente.
const statusMeta: Record<string, { label: string; color: string }> = {
  active:    { label: "Activo",     color: "bg-success/15 text-success border-success/30" },
  pending:   { label: "Pendiente",  color: "bg-warning/15 text-warning border-warning/30" },
  suspended: { label: "Suspendido", color: "bg-destructive/15 text-destructive border-destructive/30" },
  // "banned" heredado se muestra también como Suspendido (unificamos el bloqueo).
  banned:    { label: "Suspendido", color: "bg-destructive/15 text-destructive border-destructive/30" },
};
const metaFor = (s: string) => statusMeta[s] ?? statusMeta.active;

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/**
 * Roles de un usuario, con "anunciante" consolidado en "buscador".
 *
 * No había separación real de permisos entre ambos (RequireRole les da el mismo
 * rango), así que el rol dejó de asignarse y de filtrarse. La migración 0043
 * lo consolida en la BD; esta normalización hace que el panel se vea igual
 * aunque queden filas viejas sin migrar.
 */
const rolesOf = (roles: string): string[] => [
  ...new Set(roles.split(",").filter(Boolean).map((r) => (r === "anunciante" ? "buscador" : r))),
];

const PAGE_SIZE = 5;

const AdminUsers = ({ role }: { role: AdminRole }) => {
  // Matriz de permisos: solo restringe al rol admin (superadmin = acceso total).
  const { can } = usePermissions(role === "admin");
  const canEdit = can("Gestión de usuarios", "edit");
  const canDelete = can("Gestión de usuarios", "delete");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [r, setR] = useState("all");
  const [page, setPage] = useState(1);
  // Diálogo "Otorgar créditos": usuario objetivo + cantidad.
  const [grantFor, setGrantFor] = useState<AdminUser | null>(null);
  const [grantAmount, setGrantAmount] = useState("");
  // Diálogo "Enlace de restablecimiento": usuario, enlace generado y estado.
  const [resetFor, setResetFor] = useState<AdminUser | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetEmailed, setResetEmailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = () => fetchAdminUsers().then(({ data }) => setUsers(data));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () =>
      users.filter((u) =>
        (r === "all" || rolesOf(u.roles).includes(r)) &&
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

  // Genera un enlace SEGURO de restablecimiento (token_hash) vía Edge Function y
  // lo muestra para que el staff lo comparta con el usuario. No usa el correo de
  // Supabase (cuyo token de un solo uso queman los escáneres de enlaces).
  const openReset = (u: AdminUser) => {
    setResetFor(u); setResetLink(null); setCopied(false); setResetEmailed(false);
    if (!isUuid(u.id)) return; // usuario demo (sin backend): solo abre el diálogo
    setResetLoading(true);
    supabase.functions
      .invoke("admin-reset-password", { body: { user_id: u.id } })
      .then(({ data, error }) => {
        const err = error?.message || (data as { error?: string })?.error;
        const d = data as { link?: string; emailed?: boolean };
        if (err || (!d?.emailed && !d?.link)) throw new Error(err || "No se pudo procesar el restablecimiento");
        setResetLink(d.link ?? null);
        setResetEmailed(!!d.emailed);
        if (d.emailed) {
          toast({ title: "Correo enviado", description: `Enviamos el enlace de recuperación a ${u.email}.` });
        } else {
          toast({ title: "Enlace generado", description: "No se pudo enviar el correo; comparte el enlace manualmente." });
        }
      })
      .catch((e) =>
        toast({ title: "No se pudo generar el enlace", description: e?.message ?? "Error", variant: "destructive" }),
      )
      .finally(() => setResetLoading(false));
  };

  const copyReset = async () => {
    if (!resetLink) return;
    try {
      await navigator.clipboard.writeText(resetLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "No se pudo copiar", variant: "destructive" });
    }
  };

  const doGrant = () => {
    if (!grantFor) return;
    const u = grantFor;
    const amt = Number(grantAmount);
    setGrantFor(null);
    run(`Se otorgaron ${amt} créditos`, u, () => grantCredits(u.id, amt).then(() => undefined));
  };

  const initials = (name: string) => (name || "?").split(" ").map((n) => n[0]).slice(0, 2).join("");
  const primaryRole = (roles: string) => {
    const r0 = rolesOf(roles)[0] || "buscador";
    return r0.charAt(0).toUpperCase() + r0.slice(1);
  };

  // Roles asignables desde el panel (enum app_role).
  const ASSIGNABLE_ROLES = [
    { value: "buscador", label: "Buscador" },
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
    const RANK = ["superadmin", "admin", "moderador", "soporte", "buscador"];
    const owned = rolesOf(u.roles);
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
    // Un solo botón que alterna según el estado: si está suspendido permite
    // reactivarlo; en cualquier otro caso permite suspenderlo.
    const isSuspended = u.status === "suspended" || u.status === "banned";
    return (
      <>
        {canEdit && (
        <>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size={size}
              variant={Btn as any}
              className={isSuspended ? "text-success" : "text-destructive"}
              title={isSuspended ? "Reactivar" : "Suspender"}
            >
              {isSuspended ? <UserCheck size={iconSize} /> : <Ban size={iconSize} />}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isSuspended ? `¿Reactivar a ${u.full_name}?` : `¿Suspender al usuario ${u.full_name}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isSuspended
                  ? "El usuario recibirá acceso completo a la plataforma. Se le notificará por correo."
                  : "El usuario perderá el acceso a la plataforma hasta que se reactive su cuenta."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              {isSuspended ? (
                <AlertDialogAction onClick={() => run("Usuario reactivado", u, () => setUserStatus(u.id, "active"))}>Reactivar</AlertDialogAction>
              ) : (
                <AlertDialogAction onClick={() => run("Usuario suspendido", u, () => setUserStatus(u.id, "suspended"))}>Suspender</AlertDialogAction>
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

        <Button
          size={size}
          variant={Btn as any}
          className="text-primary"
          title="Restablecer contraseña"
          onClick={() => openReset(u)}
        >
          <KeyRound size={iconSize} />
        </Button>

        <Button
          size={size}
          variant={Btn as any}
          className="text-secondary"
          title="Otorgar créditos"
          onClick={() => { setGrantFor(u); setGrantAmount(""); }}
        >
          <Coins size={iconSize} />
        </Button>
        </>
        )}

        {canDelete && (
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
        )}
      </>
    );
  };

  return (
    <>
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
                {ASSIGNABLE_ROLES.map((x) => (
                  <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>
                ))}
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
                          <div className="w-8 h-8 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                            {initials(u.full_name)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm flex items-center gap-1">
                              {u.full_name}
                              {u.verified && <BadgeCheck size={13} className="text-secondary shrink-0" />}
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

      {/* Diálogo: otorgar créditos a un usuario */}
      <AlertDialog open={!!grantFor} onOpenChange={(o) => { if (!o) setGrantFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Coins size={18} className="text-secondary" /> Otorgar créditos
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se sumarán al saldo de <b>{grantFor?.full_name}</b> ({grantFor?.email}). Queda registrado en auditoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-1">
            <Input
              type="number"
              min="1"
              step="1"
              autoFocus
              placeholder="Cantidad de créditos (ej. 100)"
              value={grantAmount}
              onChange={(e) => setGrantAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && Number(grantAmount) > 0) doGrant(); }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doGrant} disabled={!(Number(grantAmount) > 0)}>
              Otorgar {Number(grantAmount) > 0 ? `${Number(grantAmount)} cr` : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Enlace seguro de restablecimiento de contraseña */}
      <AlertDialog open={!!resetFor} onOpenChange={(o) => { if (!o) { setResetFor(null); setResetLink(null); setResetEmailed(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <KeyRound size={18} className="text-primary" /> Restablecer contraseña
            </AlertDialogTitle>
            <AlertDialogDescription>
              {resetEmailed ? (
                <>Le enviamos un correo a <b>{resetFor?.full_name}</b> ({resetFor?.email}) con el enlace para crear una nueva contraseña. El enlace caduca en 1 hora.</>
              ) : (
                <>Comparte este enlace con <b>{resetFor?.full_name}</b> ({resetFor?.email}) por WhatsApp o el medio que uses. Al abrirlo podrá crear una nueva contraseña. Es de un solo uso y caduca en 1 hora.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-1 space-y-2">
            {resetLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                <Loader2 size={16} className="animate-spin" /> Enviando correo de recuperación…
              </div>
            ) : resetEmailed ? (
              <div className="flex items-start gap-2 rounded-md bg-success/10 text-success text-sm font-medium px-3 py-3">
                <Check size={16} className="mt-0.5 shrink-0" />
                <span>Correo de recuperación enviado a <b>{resetFor?.email}</b>. El usuario recibirá el enlace para crear una nueva contraseña (válido 1 hora).</span>
              </div>
            ) : resetLink ? (
              <>
                <p className="text-[11px] text-muted-foreground">No se pudo enviar el correo automáticamente. Comparte este enlace con el usuario:</p>
                <div className="flex items-center gap-2">
                  <Input readOnly value={resetLink} className="text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button size="icon" variant="outline" onClick={copyReset} title="Copiar enlace">
                    {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                  </Button>
                </div>
              </>
            ) : !resetFor || isUuid(resetFor.id) ? (
              <p className="text-sm text-muted-foreground py-2">No se pudo procesar el restablecimiento. Cierra e inténtalo de nuevo.</p>
            ) : (
              <p className="text-sm text-muted-foreground py-2">Usuario de demostración: sin backend para restablecer.</p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cerrar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AdminUsers;
