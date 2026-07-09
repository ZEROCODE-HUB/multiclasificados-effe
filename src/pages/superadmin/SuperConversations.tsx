import { useEffect, useMemo, useRef, useState } from "react";
import { AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, AlertOctagon, ArrowLeft, ExternalLink } from "lucide-react";
import { fetchReports, assignReport, resolveReport, fetchConversationBetween, type AdminReport, type ModMessage } from "@/lib/admin";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

// Mapa estado real (BD) -> etiqueta + color del diseño existente.
const statusMeta: Record<string, { label: string; color: string }> = {
  open:      { label: "Abierto",     color: "bg-destructive/15 text-destructive border-destructive/30" },
  reviewing: { label: "En revisión", color: "bg-warning/15 text-warning border-warning/30" },
  resolved:  { label: "Resuelto",    color: "bg-success/15 text-success border-success/30" },
};
const metaFor = (s: string) => statusMeta[s] ?? statusMeta.open;

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
                      qué se publicó. Se abre en otra pestaña para no perder la denuncia. */}
                  {item.target_type === "listing" && item.listing_id && (
                    <Button asChild variant="outline" size="sm" className="mt-1 gap-1.5">
                      <a href={`/aviso/${item.listing_id}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={14} /> Ver aviso
                      </a>
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
    </>
  );
};

export default SuperConversations;
