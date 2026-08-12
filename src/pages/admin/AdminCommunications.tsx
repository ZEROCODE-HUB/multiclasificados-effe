import { useState, useEffect } from "react";
import { AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Send, Megaphone, Users, Mail, Bell, Loader2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useCategories } from "@/hooks/useCategories";
import {
  fetchAudienceCount, sendIndividualMessage, broadcastMessage, fetchCommStats,
  fetchAdminUsers, type CommStats, type AdminUser, type AudienciaMasiva,
} from "@/lib/admin";
import { mensajeDeError } from "@/lib/errores";

const timeAgo = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
};

// El envío masivo va SIEMPRE a todos los usuarios reales. Ya no hay selector de
// audiencia: el rol "anunciante" quedó vacío (nadie lo tiene) y todo usuario
// no-staff tiene el rol "buscador", así que 'buscador' == "todos los usuarios"
// y además excluye al equipo interno (que se añade aparte con "copia al staff").
const BROADCAST_AUDIENCE = "buscador";

const AdminCommunications = ({ role }: { role: AdminRole }) => {
  // Enviar exige el permiso 'Comunicaciones' · Enviar (edit). El servidor lo
  // vuelve a exigir en admin_send_message/admin_broadcast; esto solo evita
  // mostrar botones que fallarían. superadmin corre con enforce=false.
  const { can } = usePermissions(role === "admin");
  const canSend = can("Comunicaciones", "edit");

  // Estadísticas reales (BD) de la tarjeta "Resumen de envíos".
  const [stats, setStats] = useState<CommStats | null>(null);
  const loadStats = () => fetchCommStats().then(setStats).catch(() => setStats(null));
  useEffect(() => { loadStats(); }, []);

  // Individual — buscador de usuario (por nombre/apellido/correo) + selección.
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<AdminUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [showUserResults, setShowUserResults] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; full_name: string; email: string } | null>(null);
  const [indSubject, setIndSubject] = useState("");
  const [indBody, setIndBody] = useState("");
  const [indEmail, setIndEmail] = useState(false);
  const [sendingInd, setSendingInd] = useState(false);

  // Masivo
  const [massSubject, setMassSubject] = useState("");
  const [massBody, setMassBody] = useState("");
  const [massEmail, setMassEmail] = useState(false);
  const [copyStaff, setCopyStaff] = useState(false);
  const [sendingMass, setSendingMass] = useState(false);

  // A quién va: a todos, o a quienes publicaron en ciertas categorías.
  const categorias = useCategories();
  const [porCategoria, setPorCategoria] = useState(false);
  const [categoriasElegidas, setCategoriasElegidas] = useState<string[]>([]);
  // Dentro de esas categorías: solo quien tiene un aviso vigente, o cualquiera
  // que haya publicado ahí alguna vez.
  const [soloVigentes, setSoloVigentes] = useState(true);

  const alternarCategoria = (id: string) =>
    setCategoriasElegidas((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );

  // El filtro que viaja a la BD. Sin categorías marcadas no se filtra nada: es
  // el mismo objeto que reciben el contador y el envío, así que no pueden
  // acabar apuntando a audiencias distintas.
  const filtro: AudienciaMasiva = {
    categories: porCategoria ? categoriasElegidas : [],
    onlyActive: porCategoria && soloVigentes,
    copyStaff,
  };
  // Marcar "por categoría" sin elegir ninguna no es una audiencia: es una
  // pregunta a medias. Se distingue de "0 destinatarios", que sí es una
  // respuesta.
  const filtroIncompleto = porCategoria && categoriasElegidas.length === 0;

  // Conteo REAL de destinatarios para la audiencia elegida. `countError`
  // distingue "no se pudo calcular" de "calculando…" y de "0 destinatarios",
  // que antes se confundían todos en `null` (IT2-023).
  //
  // Lo calcula la MISMA función de la BD que arma el envío (comm_destinatarios,
  // migración 0088), copia al equipo interno incluida. Antes eran dos caminos y
  // el contador se apañaba con un truco —pedir la audiencia 'all', que equivale
  // a usuarios ∪ staff— que dejó de valer en cuanto hubo filtros de por medio.
  const [count, setCount] = useState<number | null>(null);
  const [countError, setCountError] = useState(false);
  // La firma del filtro, para no re-consultar en cada render por el hecho de
  // que `filtro` sea un objeto nuevo cada vez.
  const filtroKey = JSON.stringify([porCategoria, [...categoriasElegidas].sort(), soloVigentes, copyStaff]);
  useEffect(() => {
    if (filtroIncompleto) { setCount(null); setCountError(false); return; }
    let alive = true;
    setCount(null); setCountError(false);
    // Pequeña espera: marcar cuatro categorías seguidas no debe disparar cuatro
    // consultas.
    const t = setTimeout(() => {
      fetchAudienceCount(BROADCAST_AUDIENCE, filtro)
        .then((n) => { if (alive) setCount(n); })
        .catch(() => { if (alive) setCountError(true); });
    }, 200);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroKey, filtroIncompleto]);

  // Búsqueda de destinatario (individual) con debounce. No busca si ya hay uno
  // seleccionado o si el texto es demasiado corto (< 2 caracteres).
  useEffect(() => {
    const q = userQuery.trim();
    if (selectedUser) return;
    if (q.length < 2) { setUserResults([]); setSearchingUsers(false); return; }
    let alive = true;
    setSearchingUsers(true);
    const t = setTimeout(() => {
      fetchAdminUsers({ search: q })
        .then(({ data }) => { if (alive) { setUserResults(data.slice(0, 8)); setShowUserResults(true); } })
        .catch(() => { if (alive) setUserResults([]); })
        .finally(() => { if (alive) setSearchingUsers(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [userQuery, selectedUser]);

  const clearSelectedUser = () => {
    setSelectedUser(null);
    setUserQuery("");
    setUserResults([]);
    setShowUserResults(false);
  };

  const sendIndividual = async () => {
    if (!selectedUser) { toast({ title: "Selecciona un destinatario", description: "Búscalo por nombre, apellido o correo.", variant: "destructive" }); return; }
    if (!indSubject.trim() || !indBody.trim()) {
      toast({ title: "Asunto y mensaje son obligatorios", variant: "destructive" }); return;
    }
    setSendingInd(true);
    try {
      const { sent, recipient } = await sendIndividualMessage(selectedUser.id, indSubject.trim(), indBody.trim(), indEmail);
      if (sent === 0) {
        toast({ title: "No se encontró al destinatario", description: "El usuario ya no existe.", variant: "destructive" });
        return;
      }
      toast({ title: "Mensaje enviado", description: `${recipient}${indEmail ? " · in-app + email" : " · in-app"}` });
      clearSelectedUser(); setIndSubject(""); setIndBody(""); setIndEmail(false);
      loadStats();
    } catch (e) {
      toast({ title: "No se pudo enviar", description: mensajeDeError(e, "Error"), variant: "destructive" });
    } finally {
      setSendingInd(false);
    }
  };

  const sendMasivo = async () => {
    if (!massSubject.trim() || !massBody.trim()) {
      toast({ title: "Asunto y mensaje son obligatorios", variant: "destructive" }); return;
    }
    if (filtroIncompleto) {
      toast({ title: "Elige al menos una categoría", description: "O cambia la audiencia a «Todos los usuarios».", variant: "destructive" }); return;
    }
    setSendingMass(true);
    try {
      const n = await broadcastMessage(BROADCAST_AUDIENCE, massSubject.trim(), massBody.trim(), massEmail, filtro);
      toast({ title: "Envío realizado", description: `${n.toLocaleString()} destinatarios${massEmail ? " · in-app + email" : " · in-app"}` });
      setMassSubject(""); setMassBody("");
      loadStats();
    } catch (e) {
      toast({ title: "No se pudo enviar", description: mensajeDeError(e, "Error"), variant: "destructive" });
    } finally {
      setSendingMass(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base md:text-lg">Centro de mensajes</CardTitle>
            </CardHeader>
            <CardContent>
              {!canSend && (
                <p className="mb-4 text-xs rounded-lg border bg-muted/50 px-3 py-2 text-muted-foreground">
                  Solo lectura: no tienes permiso para enviar comunicaciones. Un superadministrador puede habilitarlo en Roles y permisos.
                </p>
              )}
              <Tabs defaultValue="individual">
                <TabsList className="grid grid-cols-2 w-full md:w-auto">
                  <TabsTrigger value="individual" className="gap-2"><Send size={14} /> Individual</TabsTrigger>
                  <TabsTrigger value="masivo" className="gap-2"><Megaphone size={14} /> Masivo</TabsTrigger>
                </TabsList>

                {/* -------------------------------------------------- Individual */}
                <TabsContent value="individual" className="space-y-4 pt-4">
                  <div>
                    <Label>Destinatario</Label>
                    {selectedUser ? (
                      <div className="mt-1 flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{selectedUser.full_name || "(sin nombre)"}</p>
                          <p className="text-xs text-muted-foreground truncate">{selectedUser.email}</p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" className="gap-1 shrink-0" onClick={clearSelectedUser}>
                          <X size={14} /> Cambiar
                        </Button>
                      </div>
                    ) : (
                      <div className="relative mt-1">
                        <Input
                          value={userQuery}
                          onChange={(e) => setUserQuery(e.target.value)}
                          onFocus={() => { if (userResults.length) setShowUserResults(true); }}
                          onBlur={() => setTimeout(() => setShowUserResults(false), 150)}
                          placeholder="Busca por nombre, apellido o correo..."
                          autoComplete="off"
                        />
                        {showUserResults && userQuery.trim().length >= 2 && (
                          <div className="absolute z-40 mt-1 w-full max-h-64 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md">
                            {searchingUsers ? (
                              <p className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                                <Loader2 size={12} className="animate-spin" /> Buscando…
                              </p>
                            ) : userResults.length === 0 ? (
                              <p className="px-3 py-2.5 text-xs text-muted-foreground">Sin coincidencias.</p>
                            ) : (
                              userResults.map((u) => (
                                <button
                                  key={u.id}
                                  type="button"
                                  className="block w-full border-b px-3 py-2 text-left transition-colors last:border-0 hover:bg-muted"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => { setSelectedUser({ id: u.id, full_name: u.full_name, email: u.email }); setShowUserResults(false); }}
                                >
                                  <p className="text-sm font-medium text-foreground truncate">{u.full_name || "(sin nombre)"}</p>
                                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Busca y selecciona un usuario por nombre, apellido o correo. Recibe la notificación in-app y push.
                    </p>
                  </div>
                  <div>
                    <Label>Asunto</Label>
                    <Input value={indSubject} onChange={(e) => setIndSubject(e.target.value)} placeholder="Asunto del mensaje" className="mt-1" />
                  </div>
                  <div>
                    <Label>Mensaje</Label>
                    <Textarea value={indBody} onChange={(e) => setIndBody(e.target.value)} rows={6} placeholder="Escribe el contenido..." className="mt-1" />
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={indEmail} onCheckedChange={(v) => setIndEmail(!!v)} />
                    <Mail size={14} /> <span>Enviar también por correo electrónico</span>
                  </label>
                  <Button className="w-full md:w-auto" onClick={sendIndividual} disabled={sendingInd || !canSend}>
                    {sendingInd && <Loader2 size={14} className="mr-2 animate-spin" />}
                    Enviar mensaje
                  </Button>
                </TabsContent>

                {/* -------------------------------------------------- Masivo */}
                <TabsContent value="masivo" className="space-y-4 pt-4">
                  {/* -------- A quién va -------- */}
                  <div className="rounded-lg border p-3 space-y-3">
                    <Label>Destinatarios</Label>
                    <RadioGroup
                      value={porCategoria ? "categoria" : "todos"}
                      onValueChange={(v) => setPorCategoria(v === "categoria")}
                      className="gap-2"
                    >
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <RadioGroupItem value="todos" id="aud-todos" />
                        <span>Todos los usuarios</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <RadioGroupItem value="categoria" id="aud-categoria" />
                        <span>Quienes publicaron en ciertas categorías</span>
                      </label>
                    </RadioGroup>

                    {porCategoria && (
                      <div className="space-y-3 border-t pt-3">
                        <div>
                          <p className="text-xs font-medium text-foreground mb-2">Categorías</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                            {categorias.map((c) => (
                              <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  checked={categoriasElegidas.includes(c.id)}
                                  onCheckedChange={() => alternarCategoria(c.id)}
                                  aria-label={c.name}
                                />
                                <span className="truncate">{c.name}</span>
                              </label>
                            ))}
                          </div>
                          {categorias.length === 0 && (
                            <p className="text-xs text-muted-foreground">No se pudieron cargar las categorías.</p>
                          )}
                        </div>

                        <div>
                          <p className="text-xs font-medium text-foreground mb-2">De esos anunciantes…</p>
                          <RadioGroup
                            value={soloVigentes ? "vigentes" : "historico"}
                            onValueChange={(v) => setSoloVigentes(v === "vigentes")}
                            className="gap-2"
                          >
                            <label className="flex items-start gap-2 text-sm cursor-pointer">
                              <RadioGroupItem value="vigentes" id="aud-vigentes" className="mt-0.5" />
                              <span>
                                Solo los que tienen un aviso vigente
                                <span className="block text-[11px] text-muted-foreground">
                                  Publicado, activo y sin vencer.
                                </span>
                              </span>
                            </label>
                            <label className="flex items-start gap-2 text-sm cursor-pointer">
                              <RadioGroupItem value="historico" id="aud-historico" className="mt-0.5" />
                              <span>
                                Todos los que publicaron ahí alguna vez
                                <span className="block text-[11px] text-muted-foreground">
                                  Incluye avisos vencidos, pausados o vendidos.
                                </span>
                              </span>
                            </label>
                          </RadioGroup>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label>Asunto</Label>
                    <Input value={massSubject} onChange={(e) => setMassSubject(e.target.value)} placeholder="Título de la campaña" className="mt-1" />
                  </div>
                  <div>
                    <Label>Contenido</Label>
                    <Textarea value={massBody} onChange={(e) => setMassBody(e.target.value)} rows={6} placeholder="Mensaje masivo..." className="mt-1" />
                  </div>

                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={massEmail}
                      onCheckedChange={(v) => { const on = !!v; setMassEmail(on); if (!on) setCopyStaff(false); }}
                    />
                    <Mail size={14} /> <span>Enviar también por correo electrónico</span>
                  </label>
                  {/* La copia al equipo interno es un concepto de correo: solo se
                      habilita cuando se envía también por email. */}
                  <label className={`flex items-start gap-2 text-sm ${massEmail ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                    <Checkbox
                      checked={copyStaff}
                      disabled={!massEmail}
                      onCheckedChange={(v) => setCopyStaff(!!v)}
                      className="mt-0.5"
                    />
                    <span>
                      Incluir en copia a Administradores y Superadministradores
                      {!massEmail && (
                        <span className="block text-[11px] text-muted-foreground">
                          Disponible solo si envías también por correo electrónico.
                        </span>
                      )}
                    </span>
                  </label>

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="gap-1">
                      <Users size={12} />
                      {filtroIncompleto
                        ? "elige una categoría"
                        : countError
                          ? "no se pudo calcular"
                          : count === null
                            ? "calculando…"
                            : `${count.toLocaleString()} destinatarios`}
                    </Badge>
                    {porCategoria && !filtroIncompleto && (
                      <Badge variant="outline" className="gap-1 text-secondary border-secondary/40">
                        {categoriasElegidas.length === 1
                          ? categorias.find((c) => c.id === categoriasElegidas[0])?.name ?? "1 categoría"
                          : `${categoriasElegidas.length} categorías`}
                        {" · "}
                        {soloVigentes ? "con aviso vigente" : "histórico"}
                      </Badge>
                    )}
                    <Badge variant="outline" className="gap-1"><Bell size={12} /> Notificación in-app + Push</Badge>
                    {massEmail && <Badge variant="outline" className="gap-1"><Mail size={12} /> Email</Badge>}
                    {copyStaff && <Badge variant="outline" className="text-secondary border-secondary/40">CC: equipo interno</Badge>}
                  </div>
                  {/* Aviso explícito cuando la audiencia no tiene a nadie (IT2-023).
                      Se distingue de "aún no has elegido categoría", que no es
                      una audiencia vacía sino una pregunta a medias. */}
                  {filtroIncompleto ? (
                    <p className="text-xs text-muted-foreground">
                      Marca al menos una categoría para saber a cuántos anunciantes llega.
                    </p>
                  ) : count === 0 && !countError && (
                    <p className="text-xs text-muted-foreground">
                      {porCategoria
                        ? soloVigentes
                          ? "Nadie tiene avisos vigentes en esas categorías. Prueba con «todos los que publicaron alguna vez»."
                          : "Nadie ha publicado nunca en esas categorías."
                        : "Esta audiencia no tiene destinatarios; no hay a quién enviar."}
                    </p>
                  )}
                  <Button className="w-full md:w-auto" onClick={sendMasivo} disabled={sendingMass || filtroIncompleto || count === 0 || countError || count === null || !canSend}>
                    {sendingMass && <Loader2 size={14} className="mr-2 animate-spin" />}
                    Enviar a {filtroIncompleto || count === null ? "…" : count.toLocaleString()}
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg">Resumen de envíos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-foreground">{(stats?.today ?? 0).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Enviadas hoy</div>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-foreground">{(stats?.total ?? 0).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Total histórico</div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">Últimos envíos</div>
              {stats?.recent?.length ? (
                <div className="space-y-2">
                  {stats.recent.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 bg-muted/40 rounded-lg">
                      <div className="mt-0.5 text-secondary">
                        {r.action === "broadcast" ? <Megaphone size={14} /> : <Send size={14} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">{r.title || "(sin asunto)"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {r.action === "broadcast" ? `${r.recipients.toLocaleString()} destinatarios` : "Individual"} · {timeAgo(r.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-2">Aún no hay envíos registrados.</p>
              )}
            </div>

            <div className="p-3 bg-muted/40 rounded-lg text-[11px] text-muted-foreground leading-relaxed">
              Cada envío crea una notificación <strong>in-app</strong> (campana del usuario) y dispara la
              <strong> push</strong> a sus dispositivos. Con la casilla de correo, además se envía por <strong>email</strong>.
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default AdminCommunications;
