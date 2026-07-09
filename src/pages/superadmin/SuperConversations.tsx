import { useEffect, useMemo, useRef, useState } from "react";
import { AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, AlertOctagon, ArrowLeft, Eye } from "lucide-react";
import {
  fetchReports, assignReport, resolveReport, fetchConversationBetween, fetchAdminListing,
  type AdminReport, type ModMessage, type AdminListingDetail,
} from "@/lib/admin";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

// Mapa estado real (BD) -> etiqueta + color del diseño existente.
const statusMeta: Record<string, { label: string; color: string }> = {
  open:      { label: "Abierto",     color: "bg-destructive/15 text-destructive border-destructive/30" },
  reviewing: { label: "En revisión", color: "bg-warning/15 text-warning border-warning/30" },
  resolved:  { label: "Resuelto",    color: "bg-success/15 text-success border-success/30" },
};
const metaFor = (s: string) => statusMeta[s] ?? statusMeta.open;

// Estado del aviso (tabla listings) → etiqueta legible para el moderador.
const listingStatusLabel: Record<string, string> = {
  active: "Activo", paused: "Pausado", pending: "Pendiente",
  rejected: "Rechazado", draft: "Borrador", expired: "Expirado",
};

const money = (price: number, currency: string) =>
  `${currency === "USD" ? "$" : "S/"} ${Number(price ?? 0).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const SuperConversations = ({ role = "superadmin" as AdminRole }: { role?: AdminRole }) => {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [me, setMe] = useState<string | null>(null);
  const [convo, setConvo] = useState<ModMessage[]>([]);
  const [convoLoading, setConvoLoading] = useState(false);
  // Hay una acción de moderación en vuelo: bloquea los botones hasta que vuelva.
  const [busy, setBusy] = useState(false);
  // Aviso denunciado, que se muestra en un diálogo sin salir de la denuncia.
  const [avisoOpen, setAvisoOpen] = useState(false);
  const [aviso, setAviso] = useState<AdminListingDetail | null>(null);
  const [avisoEstado, setAvisoEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const convoRef = useRef<HTMLDivElement>(null);

  const load = () => fetchReports().then(({ data }) => setReports(data));
  useEffect(() => {
    load();
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const filtered = useMemo(
    () =>
      reports.filter((r) =>
        q === "" ||
        [r.reporter, r.reported, r.reason, r.listing_title].some((f) => (f ?? "").toLowerCase().includes(q.toLowerCase())),
      ),
    [reports, q],
  );
  const item = reports.find((r) => r.id === selected);

  // Carga la conversación entre reportante y reportado al abrir una denuncia.
  useEffect(() => {
    if (!item) { setConvo([]); return; }
    setConvoLoading(true);
    let active = true;
    fetchConversationBetween(item.reporter_id, item.reported_id).then((msgs) => {
      if (active) { setConvo(msgs); setConvoLoading(false); }
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.reporter_id, item?.reported_id]);

  // Al cargar/cambiar la conversación, baja al último mensaje.
  useEffect(() => {
    if (convoRef.current) convoRef.current.scrollTop = convoRef.current.scrollHeight;
  }, [convo]);

  const act = async (label: string, fn: () => Promise<void>) => {
    if (!item || !isUuid(item.id)) { toast({ title: label }); return; }
    if (busy) return; // el botón ya está deshabilitado; esto cubre el doble toque.
    setBusy(true);
    try {
      await fn();
      toast({ title: label });
      await load();
    } catch (e: any) {
      toast({ title: "No se pudo completar", description: e?.message ?? "Error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const verAviso = async () => {
    if (!item?.listing_id) return;
    setAvisoOpen(true);
    setAviso(null);
    setAvisoEstado("cargando");
    try {
      const l = await fetchAdminListing(item.listing_id);
      setAviso(l);
      setAvisoEstado(l ? "listo" : "error");
    } catch {
      setAvisoEstado("error");
    }
  };

  const markReviewing = () => {
    // Sin sesión no hay a quién asignarla. Antes caía en `item.reported_id`, que
    // asignaba la denuncia... al propio usuario denunciado.
    if (!me) {
      toast({ title: "No se pudo identificar al moderador", variant: "destructive" });
      return;
    }
    return act("Marcada en revisión", () => assignReport(item!.id, me));
  };
  const warnUser = () => act("Usuario advertido", () => resolveReport(item!.id, "warn", "Advertencia emitida por moderación"));
  const suspendUser = () => act("Cuenta suspendida", () => resolveReport(item!.id, "ban", item!.reason));

  return (
    <>
      {/* En desktop: dos paneles a altura fija con scroll interno. En móvil: el
          contenido fluye y hace scroll con la página (incluidos los botones). */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:h-[calc(100vh-220px)] lg:min-h-[500px]">
        <Card className={`lg:col-span-1 flex flex-col ${selected ? "hidden lg:flex" : "flex"}`}>
          <CardHeader className="space-y-2">
            <CardTitle className="text-base md:text-lg">Reclamos</CardTitle>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..." className="pl-9 h-9" />
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-2">
            {filtered.map((r) => {
              const m = metaFor(r.status);
              return (
                <button
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className={`w-full text-left p-3 border rounded-lg hover:bg-muted/50 transition ${selected === r.id ? "bg-muted border-secondary/40" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-mono text-muted-foreground">{r.id.slice(0, 8)}</p>
                      <p className="text-sm font-semibold truncate">{r.reporter ?? "Anónimo"} → {r.reported ?? "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.reason}</p>
                    </div>
                    <Badge variant="outline" className={m.color}>{m.label}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{(r.created_at ?? "").slice(0, 10)}</p>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No hay denuncias.</p>
            )}
          </CardContent>
        </Card>

        <Card className={`lg:col-span-2 flex flex-col ${selected ? "flex" : "hidden lg:flex"}`}>
          {item ? (
            <>
              <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                  <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setSelected(null)}><ArrowLeft size={18} /></Button>
                  <div className="w-10 h-10 rounded-full bg-destructive/15 text-destructive flex items-center justify-center"><AlertOctagon size={18} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{item.reporter ?? "Anónimo"} reportó a {item.reported ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{item.reason} · {(item.created_at ?? "").slice(0, 10)}</p>
                  </div>
                  <Badge variant="outline" className={metaFor(item.status).color}>{metaFor(item.status).label}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto py-4 space-y-3 bg-muted/30">
                <div className="rounded-xl border bg-card p-4 space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Detalle de la denuncia</p>
                  <p className="text-sm"><span className="text-muted-foreground">Tipo:</span> {item.target_type === "user" ? "Usuario" : "Aviso"}</p>
                  {item.listing_title && <p className="text-sm"><span className="text-muted-foreground">Aviso:</span> {item.listing_title}</p>}
                  <p className="text-sm"><span className="text-muted-foreground">Motivo:</span> {item.reason}</p>
                  {item.category && <p className="text-sm"><span className="text-muted-foreground">Categoría:</span> {item.category}</p>}
                  {item.assignee && <p className="text-sm"><span className="text-muted-foreground">Asignada a:</span> {item.assignee}</p>}
                  {item.action_taken && <p className="text-sm"><span className="text-muted-foreground">Acción tomada:</span> {item.action_taken}</p>}
                  {/* Denuncia sobre un aviso: sin esto el moderador no puede ver
                      qué se publicó. Se abre aquí mismo, sin salir de la denuncia. */}
                  {item.target_type === "listing" && item.listing_id && (
                    <Button variant="outline" size="sm" className="mt-1 gap-1.5" onClick={verAviso}>
                      <Eye size={14} /> Ver aviso
                    </Button>
                  )}
                </div>
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2">
                    Conversación entre ambos usuarios
                  </p>
                  {/* Leyenda: quién es quién */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                      <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/50" />
                      Denunciante: {item.reporter ?? "—"}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-secondary">
                      Denunciado: {item.reported ?? "—"}
                      <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
                    </span>
                  </div>
                  {convoLoading ? (
                    <p className="text-xs text-muted-foreground text-center py-6">Cargando conversación…</p>
                  ) : convo.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      No hay mensajes registrados entre estos usuarios.
                    </p>
                  ) : (
                    <div ref={convoRef} className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                      {convo.map((m) => {
                        // Denunciado a la DERECHA; denunciante (y cualquier otro) a la izquierda.
                        const isDenunciado = item.reported_id != null && m.sender_id === item.reported_id;
                        const initials = (m.sender_name ?? "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                        return (
                          <div key={m.id} className={`flex ${isDenunciado ? "justify-end" : "justify-start"}`}>
                            <div className={`flex items-end gap-2 max-w-[80%] ${isDenunciado ? "flex-row-reverse" : ""}`}>
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${isDenunciado ? "bg-secondary/25 text-secondary" : "bg-muted-foreground/20 text-foreground"}`}>
                                {initials || "?"}
                              </div>
                              <div className={`rounded-lg px-3 py-2 ${isDenunciado ? "bg-secondary/15" : "bg-muted"}`}>
                                <p className="text-[10px] font-semibold mb-0.5">
                                  <span className="text-muted-foreground">{m.sender_name ?? "Usuario"}</span>
                                  <span className={isDenunciado ? "text-secondary" : "text-muted-foreground/70"}> · {isDenunciado ? "Denunciado" : "Denunciante"}</span>
                                </p>
                                <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                                <p className="text-[9px] text-muted-foreground mt-1 text-right">
                                  {new Date(m.created_at).toLocaleString("es-PE")}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
              <div className="border-t p-4 flex flex-col sm:flex-row gap-2">
                {/* Solo se marca en revisión una denuncia abierta: una vez asignada
                    (o resuelta) volver a pulsar no hace nada útil. */}
                <Button variant="outline" className="flex-1" disabled={busy || item.status !== "open"} onClick={markReviewing}>
                  {item.status === "reviewing" ? "En revisión" : "Marcar en revisión"}
                </Button>
                <Button variant="outline" className="flex-1 text-warning" disabled={busy} onClick={warnUser}>Advertir usuario</Button>
                <Button className="flex-1 bg-destructive hover:bg-destructive/90" disabled={busy} onClick={suspendUser}>Suspender cuenta</Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                <AlertOctagon size={40} className="mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">Selecciona un reclamo</p>
                <p className="text-xs text-muted-foreground">Podrás ver la conversación completa entre los usuarios.</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Aviso denunciado. Se carga con admin_get_listing: la vista pública solo
          expone avisos activos, y el denunciado suele estar ya deshabilitado. */}
      <Dialog open={avisoOpen} onOpenChange={setAvisoOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base pr-6">{aviso?.title ?? item?.listing_title ?? "Aviso denunciado"}</DialogTitle>
            <DialogDescription className="text-xs">Aviso denunciado por: {item?.reason ?? "—"}</DialogDescription>
          </DialogHeader>

          {avisoEstado === "cargando" && (
            <p className="text-sm text-muted-foreground py-8 text-center">Cargando el aviso…</p>
          )}
          {avisoEstado === "error" && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No se pudo cargar el aviso. Puede haber sido eliminado.
            </p>
          )}

          {avisoEstado === "listo" && aviso && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{listingStatusLabel[aviso.status] ?? aviso.status}</Badge>
                {aviso.featured && <Badge variant="outline">Destacado</Badge>}
                {aviso.urgent && <Badge variant="outline">Urgente</Badge>}
                <span className="text-lg font-bold text-secondary ml-auto">{money(aviso.price, aviso.currency)}</span>
              </div>

              {aviso.images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {aviso.images.map((url) => (
                    <img key={url} src={url} alt="" className="w-full h-28 object-cover rounded-lg border" />
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <p><span className="text-muted-foreground">Anunciante:</span> {aviso.advertiser ?? "—"}</p>
                <p><span className="text-muted-foreground">Vistas:</span> {aviso.views}</p>
                {aviso.category_id && <p><span className="text-muted-foreground">Categoría:</span> {aviso.category_id}</p>}
                {aviso.location && <p><span className="text-muted-foreground">Ubicación:</span> {aviso.location}</p>}
                {aviso.condition && <p><span className="text-muted-foreground">Estado:</span> {aviso.condition}</p>}
                <p><span className="text-muted-foreground">Publicado:</span> {(aviso.published_at ?? aviso.created_at).slice(0, 10)}</p>
              </div>

              {aviso.description && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1">Descripción</p>
                  <p className="text-sm whitespace-pre-wrap break-words">{aviso.description}</p>
                </div>
              )}

              {aviso.rejection_reason && (
                <p className="text-sm text-destructive">
                  <span className="text-muted-foreground">Motivo del rechazo:</span> {aviso.rejection_reason}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SuperConversations;
