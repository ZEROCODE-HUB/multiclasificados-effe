import { useState, useEffect } from "react";
import { AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Send, Megaphone, Users, Target, Mail, Bell, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { fetchAudienceCount, sendIndividualMessage, broadcastMessage, fetchCommStats, type CommStats } from "@/lib/admin";

const timeAgo = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
};

// Audiencias REALES respaldadas por la BD (profiles / user_roles). No se ofrecen
// segmentos por región/interés porque el perfil de usuario aún no guarda esos
// datos; añadirlos requeriría derivar la audiencia de saved_searches (pendiente).
const AUDIENCES = [
  { value: "all", label: "Todos los usuarios" },
  { value: "anunciante", label: "Solo anunciantes" },
  { value: "buscador", label: "Solo buscadores" },
];

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

  // Individual
  const [individualTo, setIndividualTo] = useState("");
  const [indSubject, setIndSubject] = useState("");
  const [indBody, setIndBody] = useState("");
  const [indEmail, setIndEmail] = useState(false);
  const [sendingInd, setSendingInd] = useState(false);

  // Masivo
  const [audience, setAudience] = useState("all");
  const [massSubject, setMassSubject] = useState("");
  const [massBody, setMassBody] = useState("");
  const [massEmail, setMassEmail] = useState(false);
  const [copyStaff, setCopyStaff] = useState(false);
  const [sendingMass, setSendingMass] = useState(false);

  // Conteo REAL de destinatarios para la audiencia elegida.
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    setCount(null);
    fetchAudienceCount(audience)
      .then((n) => { if (alive) setCount(n); })
      .catch(() => { if (alive) setCount(null); });
    return () => { alive = false; };
  }, [audience]);

  const sendIndividual = async () => {
    if (!individualTo.trim()) { toast({ title: "Falta el destinatario", variant: "destructive" }); return; }
    if (!indSubject.trim() || !indBody.trim()) {
      toast({ title: "Asunto y mensaje son obligatorios", variant: "destructive" }); return;
    }
    setSendingInd(true);
    try {
      const { sent, recipient } = await sendIndividualMessage(individualTo.trim(), indSubject.trim(), indBody.trim(), indEmail);
      if (sent === 0) {
        toast({ title: "No se encontró al destinatario", description: "Revisa el correo o nombre.", variant: "destructive" });
        return;
      }
      toast({ title: "Mensaje enviado", description: `${recipient}${indEmail ? " · in-app + email" : " · in-app"}` });
      setIndividualTo(""); setIndSubject(""); setIndBody(""); setIndEmail(false);
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
      const n = await broadcastMessage(audience, massSubject.trim(), massBody.trim(), massEmail, copyStaff);
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
                    <Input
                      value={individualTo}
                      onChange={(e) => setIndividualTo(e.target.value)}
                      placeholder="Correo o nombre del destinatario..."
                      className="mt-1"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Se busca por correo exacto o por nombre. Recibe la notificación in-app y push.
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
                    <Label className="flex items-center gap-1.5"><Target size={12} /> Audiencia</Label>
                    <Select value={audience} onValueChange={setAudience}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AUDIENCES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
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
                    <Checkbox checked={massEmail} onCheckedChange={(v) => setMassEmail(!!v)} />
                    <Mail size={14} /> <span>Enviar también por correo electrónico</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <Checkbox checked={copyStaff} onCheckedChange={(v) => setCopyStaff(!!v)} className="mt-0.5" />
                    <span>Incluir en copia a Administradores y Superadministradores</span>
                  </label>

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="gap-1">
                      <Users size={12} />
                      {count === null ? "calculando…" : `${count.toLocaleString()} destinatarios`}
                    </Badge>
                    <Badge variant="outline" className="gap-1"><Bell size={12} /> Notificación in-app + Push</Badge>
                    {massEmail && <Badge variant="outline" className="gap-1"><Mail size={12} /> Email</Badge>}
                    {copyStaff && <Badge variant="outline" className="text-secondary border-secondary/40">CC: equipo interno</Badge>}
                  </div>
                  <Button className="w-full md:w-auto" onClick={sendMasivo} disabled={sendingMass || count === 0 || !canSend}>
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
