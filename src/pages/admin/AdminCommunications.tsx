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
import { Send, Megaphone, Users, Mail, Bell, Loader2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import {
  fetchAudienceCount, sendIndividualMessage, broadcastMessage, fetchCommStats,
  fetchAdminUsers, type CommStats, type AdminUser,
} from "@/lib/admin";

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

  // Conteo REAL de destinatarios para la audiencia elegida. `countError`
  // distingue "no se pudo calcular" de "calculando…" y de "0 destinatarios",
  // que antes se confundían todos en `null` (IT2-023).
  const [count, setCount] = useState<number | null>(null);
  const [countError, setCountError] = useState(false);
  useEffect(() => {
    let alive = true;
    setCount(null);
    setCountError(false);
    fetchAudienceCount(BROADCAST_AUDIENCE)
      .then((n) => { if (alive) setCount(n); })
      .catch(() => { if (alive) { setCount(null); setCountError(true); } });
    return () => { alive = false; };
  }, []);

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
    } catch (e: any) {
      toast({ title: "No se pudo enviar", description: e?.message ?? "Error", variant: "destructive" });
    } finally {
      setSendingInd(false);
    }
  };

  const sendMasivo = async () => {
    if (!massSubject.trim() || !massBody.trim()) {
      toast({ title: "Asunto y mensaje son obligatorios", variant: "destructive" }); return;
    }
    setSendingMass(true);
    try {
      const n = await broadcastMessage(BROADCAST_AUDIENCE, massSubject.trim(), massBody.trim(), massEmail, copyStaff);
      toast({ title: "Envío realizado", description: `${n.toLocaleString()} destinatarios${massEmail ? " · in-app + email" : " · in-app"}` });
      setMassSubject(""); setMassBody("");
      loadStats();
    } catch (e: any) {
      toast({ title: "No se pudo enviar", description: e?.message ?? "Error", variant: "destructive" });
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
                      {countError
                        ? "no se pudo calcular"
                        : count === null
                          ? "calculando…"
                          : `${count.toLocaleString()} destinatarios`}
                    </Badge>
                    <Badge variant="outline" className="gap-1"><Bell size={12} /> Notificación in-app + Push</Badge>
                    {massEmail && <Badge variant="outline" className="gap-1"><Mail size={12} /> Email</Badge>}
                    {copyStaff && <Badge variant="outline" className="text-secondary border-secondary/40">CC: equipo interno</Badge>}
                  </div>
                  {/* Aviso explícito cuando la audiencia no tiene a nadie (IT2-023). */}
                  {count === 0 && !countError && (
                    <p className="text-xs text-muted-foreground">
                      Esta audiencia no tiene destinatarios; no hay a quién enviar.
                    </p>
                  )}
                  <Button className="w-full md:w-auto" onClick={sendMasivo} disabled={sendingMass || count === 0 || countError || count === null || !canSend}>
                    {sendingMass && <Loader2 size={14} className="mr-2 animate-spin" />}
                    Enviar a {count === null ? "…" : count.toLocaleString()}
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
