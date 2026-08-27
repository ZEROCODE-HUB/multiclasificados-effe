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
import { Search, UserCheck, Ban, BadgeCheck, KeyRound, Trash2, ChevronLeft, ChevronRight, Coins, Copy, Check, Loader2, Bell } from "lucide-react";
import { PrefsNotificacionDialog } from "@/components/PrefsNotificacionDialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchAdminUsers, setUserStatus, verifyUser, deleteUser, reactivarUsuario, setUserRole, ajustarSaldo, saldoDeUsuario, type AdminUser } from "@/lib/admin";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/lib/supabase";
import { formatCredits } from "@/lib/pricing";
import { toast } from "@/hooks/use-toast";
import { mensajeDeError } from "@/lib/errores";
import { metaFor } from "@/pages/admin/estadoDeUsuario";

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

// 20 filas por pantalla. Estaba en 5 y el cliente lo reportó: revisar cien
// usuarios costaba veinte clics de paginación. La lista ya viene entera del
// servidor y se corta en el navegador, así que subirlo no cuesta consultas.
const PAGE_SIZE = 20;

const AdminUsers = ({ role }: { role: AdminRole }) => {
  // Matriz de permisos: solo restringe al rol admin (superadmin = acceso total).
  const { can } = usePermissions(role === "admin");
  const canEdit = can("Gestión de usuarios", "edit");
  const canApprove = can("Gestión de usuarios", "approve"); // verificar identidad
  const canDelete = can("Gestión de usuarios", "delete");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [r, setR] = useState("all");
  // B-01: Activos / Inactivos / Todos. Se filtra en cliente como el rol y la
  // búsqueda —la lista ya viene entera— para que las tres se combinen sin ir y
  // volver al servidor en cada cambio.
  const [est, setEst] = useState("all");
  // Usuario cuyas notificaciones se están mirando (B-02).
  const [prefsDe, setPrefsDe] = useState<AdminUser | null>(null);
  const [page, setPage] = useState(1);
  // Diálogo "Otorgar créditos": usuario objetivo + cantidad.
  // Cuadro de saldo: otorgar o devolver, con el saldo actual a la vista.
  const [grantFor, setGrantFor] = useState<AdminUser | null>(null);
  const [grantAmount, setGrantAmount] = useState("");
  const [grantModo, setGrantModo] = useState<"otorgar" | "quitar">("otorgar");
  const [grantMotivo, setGrantMotivo] = useState("");
  const [grantSaldo, setGrantSaldo] = useState<number | null>(null);
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
        // `?? "active"`: hay filas antiguas sin estado, y son clientes activos.
        // Sin esto, filtrar por "activos" las dejaría fuera.
        (est === "all" || (u.status ?? "active") === est) &&
        (q === "" || (u.full_name ?? "").toLowerCase().includes(q.toLowerCase()) || (u.email ?? "").toLowerCase().includes(q.toLowerCase())),
      ),
    [users, q, r, est],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const list = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Ejecuta una acción real contra la BD si el id es un usuario real (uuid);
  // si es un dato mock (sin backend) solo muestra el toast para no romper la demo.
  const run = async (label: string, u: AdminUser, fn: () => Promise<unknown>) => {
    if (!isUuid(u.id)) { toast({ title: label, description: `${u.full_name} · ${u.email}` }); return; }
    try {
      await fn();
      toast({ title: label, description: `${u.full_name} · ${u.email}` });
      load();
    } catch (e) {
      toast({ title: "No se pudo completar", description: mensajeDeError(e, "Error"), variant: "destructive" });
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
        toast({ title: "No se pudo generar el enlace", description: mensajeDeError(e, "Error"), variant: "destructive" }),
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

  const montoValido = Number(grantAmount) > 0;
  const delta = grantModo === "quitar" ? -Number(grantAmount) : Number(grantAmount);
  const saldoResultante = grantSaldo === null ? null : Math.round((grantSaldo + delta) * 100) / 100;
  const puedeAjustar = montoValido && grantMotivo.trim().length > 0 && (saldoResultante === null || saldoResultante >= 0);

  const doGrant = () => {
    if (!grantFor || !puedeAjustar) return;
    const u = grantFor;
    const monto = Number(grantAmount);
    const motivo = grantMotivo.trim();
    const quita = grantModo === "quitar";
    setGrantFor(null);
    run(
      quita ? `Se devolvió ${formatCredits(monto)} de saldo` : `Se otorgó ${formatCredits(monto)} de saldo`,
      u,
      () => ajustarSaldo(u.id, quita ? -monto : monto, motivo).then(() => undefined),
    );
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
    // Tipado como la variante que espera <Button>, en vez de colarlo con `as any`.
    const Btn: "outline" | "ghost" = compact ? "outline" : "ghost";
    const size: "icon" | "sm" = compact ? "sm" : "icon";
    const iconSize = compact ? 14 : 16;
    // Un solo botón que alterna según el estado: si la cuenta está parada
    // permite devolverla, y en cualquier otro caso permite suspenderla.
    //
    // "inactive" ENTRA AQUÍ, y faltaba: un cliente dado de baja veía el botón
    // de "Suspender" y no tenía por dónde volver. La función del servidor
    // (admin_reactivar_usuario, migración 0127) estaba escrita desde el
    // principio, pero no la llamaba nadie: la baja era un camino de ida.
    const dadoDeBaja = u.status === "inactive";
    const isSuspended = u.status === "suspended" || u.status === "banned" || dadoDeBaja;
    return (
      <>
        {canEdit && (
        <>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size={size}
              variant={Btn}
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
                {dadoDeBaja
                  ? "La cuenta vuelve a quedar activa. Sus avisos NO se republican solos: los pausó la baja y los retoma el propio anunciante cuando quiera."
                  : isSuspended
                    ? "El usuario recibirá acceso completo a la plataforma. Se le notificará por correo."
                    : "El usuario perderá el acceso a la plataforma hasta que se reactive su cuenta."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              {isSuspended ? (
                // Una baja se deshace con su propia función, no poniendo el
                // estado a mano: `admin_reactivar_usuario` deja constancia en la
                // auditoría de que se revirtió una baja, que no es lo mismo que
                // levantar una suspensión.
                <AlertDialogAction
                  onClick={() => run(
                    dadoDeBaja ? "Cliente reactivado" : "Usuario reactivado",
                    u,
                    () => (dadoDeBaja ? reactivarUsuario(u.id) : setUserStatus(u.id, "active")),
                  )}
                >
                  Reactivar
                </AlertDialogAction>
              ) : (
                <AlertDialogAction onClick={() => run("Usuario suspendido", u, () => setUserStatus(u.id, "suspended"))}>Suspender</AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </>
        )}

        {/* Verificar identidad cuelga de "approve" (lo exige el servidor,
            admin_verify_user), no de "edit". */}
        {canApprove && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size={size} variant={Btn} className={u.verified ? "text-secondary" : "text-muted-foreground"} title={u.verified ? "Quitar verificación" : "Verificar"}><BadgeCheck size={iconSize} /></Button>
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
        )}

        {canEdit && (
        <>
        <Button
          size={size}
          variant={Btn}
          className="text-primary"
          title="Restablecer contraseña"
          onClick={() => openReset(u)}
        >
          <KeyRound size={iconSize} />
        </Button>

        {/* B-02: reactivar lo que el propio usuario apagó. El caso real es
            alguien que llama diciendo que no le llegan los avisos y resulta que
            se los desactivó él hace meses. */}
        <Button
          size={size}
          variant={Btn}
          className="text-primary"
          title="Notificaciones"
          onClick={() => setPrefsDe(u)}
        >
          <Bell size={iconSize} />
        </Button>

        <Button
          size={size}
          variant={Btn}
          className="text-secondary"
          title="Saldo"
          onClick={() => {
            setGrantFor(u);
            setGrantAmount("");
            setGrantMotivo("");
            setGrantModo("otorgar");
            setGrantSaldo(null);
            // Sin esto se decide a ciegas: la RLS de user_credits no deja al
            // panel leer el saldo de otro, hace falta la RPC.
            if (isUuid(u.id)) saldoDeUsuario(u.id).then(setGrantSaldo).catch(() => setGrantSaldo(null));
          }}
        >
          <Coins size={iconSize} />
        </Button>
        </>
        )}

        {canDelete && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size={size} variant={Btn} className="text-destructive" title="Eliminar"><Trash2 size={iconSize} /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              {/* DICE LO QUE VA A PASAR CON ESTA PERSONA, no cómo funciona la
                  regla en general. El mismo botón da de baja o borra para
                  siempre según un dato que quien pulsa no veía: antes el cuadro
                  explicaba las dos ramas y dejaba adivinar cuál tocaba. Para
                  algo irreversible, eso es poco.
                  `tiene_rastro` lo calcula la MISMA función del servidor que
                  toma la decisión, así que el aviso y lo que ocurre no pueden
                  discrepar. */}
              <AlertDialogTitle>
                {u.tiene_rastro === false
                  ? `¿Eliminar a ${u.full_name} de forma permanente?`
                  : `¿Dar de baja a ${u.full_name}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {u.tiene_rastro === false ? (
                  <>
                    Esta cuenta <b>no tiene ningún aviso, pedido ni boleta</b>, así que se
                    borrará por completo. <b>No se puede deshacer.</b>
                  </>
                ) : (
                  <>
                    Este cliente <b>ya tiene historial</b> (avisos, pedidos o boletas), así que
                    no se borra: queda como <b>inactivo</b>, pierde el acceso y sus avisos
                    activos se pausan. Su historial se conserva, porque SUNAT o el Poder
                    Judicial pueden pedir la relación de quienes contrataron.
                    <br /><br />
                    Puedes reactivarlo después desde esta misma lista.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={async () => {
                  // El resultado decide el mensaje: dar por hecho "eliminado"
                  // haría creer que se borró un cliente que sigue en la base.
                  if (!isUuid(u.id)) { toast({ title: "Usuario dado de baja", description: u.full_name }); return; }
                  try {
                    const accion = await deleteUser(u.id);
                    toast({
                      title: accion === "desactivado" ? "Cliente desactivado" : "Usuario eliminado",
                      description: accion === "desactivado"
                        ? `${u.full_name} conserva su historial y sus avisos quedaron pausados.`
                        : `${u.full_name} · ${u.email}`,
                    });
                    load();
                  } catch (e) {
                    toast({ title: "No se pudo completar", description: mensajeDeError(e, "Error"), variant: "destructive" });
                  }
                }}
              >
                Dar de baja
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
            {/* B-01: lo pide el punto tal cual — "que al momento de emitir
                reportes se permita en los filtros colocar esa opción de
                Activos/Inactivos". Es lo que van a pedir SUNAT o el Poder
                Judicial, así que sin esto la baja existiría pero no se podría
                consultar. */}
            <Select value={est} onValueChange={(v) => { setEst(v); setPage(1); }}>
              <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="inactive">Inactivos</SelectItem>
                <SelectItem value="suspended">Suspendidos</SelectItem>
                <SelectItem value="banned">Baneados</SelectItem>
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

      {/* Diálogo: saldo del usuario — otorgar o devolver */}
      <AlertDialog open={!!grantFor} onOpenChange={(o) => { if (!o) setGrantFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Coins size={18} className="text-secondary" /> Saldo de {grantFor?.full_name}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {grantFor?.email}. Todo movimiento queda en el historial del usuario y en la auditoría.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-1">
            <div className="flex items-center justify-between border bg-muted/30 px-3 py-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Saldo actual</span>
              <span className="font-extrabold text-secondary">
                {grantSaldo === null
                  ? <Loader2 size={14} className="animate-spin" />
                  : formatCredits(grantSaldo)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={grantModo === "otorgar" ? "default" : "outline"}
                onClick={() => setGrantModo("otorgar")}
              >
                Otorgar
              </Button>
              <Button
                type="button"
                variant={grantModo === "quitar" ? "default" : "outline"}
                onClick={() => setGrantModo("quitar")}
              >
                Quitar
              </Button>
            </div>

            <div>
              <Label className="text-xs">Monto en S/</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                autoFocus
                placeholder="Ej. 100"
                value={grantAmount}
                onChange={(e) => setGrantAmount(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && puedeAjustar) doGrant(); }}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">Motivo <span className="text-destructive">*</span></Label>
              {/* Obligatorio a propósito: dentro de un mes, "S/ 200 el día 12"
                  sin explicación no se puede defender ante nadie. */}
              <Textarea
                placeholder="Ej. Devolución acordada por soporte / abono duplicado"
                value={grantMotivo}
                onChange={(e) => setGrantMotivo(e.target.value)}
                className="mt-1 min-h-[64px]"
              />
            </div>

            {montoValido && saldoResultante !== null && (
              <p className={`text-xs ${saldoResultante < 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                {saldoResultante < 0
                  ? `No alcanza: el usuario solo tiene ${formatCredits(grantSaldo ?? 0)}.`
                  : `Quedará en ${formatCredits(saldoResultante)}.`}
              </p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doGrant} disabled={!puedeAjustar}>
              {grantModo === "quitar" ? "Quitar" : "Otorgar"} {montoValido ? formatCredits(Number(grantAmount)) : ""}
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
      <PrefsNotificacionDialog
        userId={prefsDe?.id ?? null}
        nombre={prefsDe?.full_name ?? ""}
        puedeEditar={canEdit}
        onClose={() => setPrefsDe(null)}
      />
    </>
  );
};

export default AdminUsers;
