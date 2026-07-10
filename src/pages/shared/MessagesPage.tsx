import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Send, Search, CheckCircle2, Check, CheckCheck, Flag } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { reportUser, USER_REPORT_REASONS } from "@/lib/reports";
import { loadSold, markSold } from "@/lib/pricing";
import {
  fetchConversations, fetchMessages, sendMessage, markDelivered, markRead,
  subscribeToMessages, subscribeToConversations, unsubscribe, getCurrentUserId,
  type Conversation, type ChatMessage,
} from "@/lib/messaging";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { LoadingState } from "@/components/LoadingState";

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

const fmtWhen = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? fmtTime(iso)
    : d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
};

// Indicador de estado para los mensajes propios (Enviado/Recibido/Leído).
function StatusTick({ status }: { status: ChatMessage["status"] }) {
  if (status === "read") return <CheckCheck size={13} className="text-sky-300" />;
  if (status === "delivered") return <CheckCheck size={13} className="text-primary-foreground/60" />;
  return <Check size={13} className="text-primary-foreground/60" />;
}

const MessagesPage = ({ role }: { role: "anunciante" | "buscador" }) => {
  const [params, setParams] = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(params.get("c"));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("");
  const [sold, setSold] = useState(() => loadSold());
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  // Reporte del otro participante del chat (misma tabla `reports` que el aviso).
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("");
  const [reportDetail, setReportDetail] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const { kbPad, scrollFocusedIntoView } = useKeyboardInset();

  const scrollRef = useRef<HTMLDivElement>(null);
  const msgChannel = useRef<RealtimeChannel | null>(null);

  // Carga inicial + suscripción a cambios en mis conversaciones.
  useEffect(() => {
    getCurrentUserId().then(setUserId);
    fetchConversations().then(setConversations).finally(() => setLoadingConvs(false));
    const ch = subscribeToConversations(() => {
      fetchConversations().then(setConversations);
    });
    return () => unsubscribe(ch);
  }, []);

  // Ventas (localStorage) — se conserva la función previa.
  useEffect(() => {
    const sync = () => setSold(loadSold());
    window.addEventListener("effe:sold-updated", sync);
    return () => window.removeEventListener("effe:sold-updated", sync);
  }, []);

  // Al seleccionar una conversación: carga mensajes, marca leído y se suscribe.
  useEffect(() => {
    unsubscribe(msgChannel.current);
    msgChannel.current = null;
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let active = true;
    setLoadingMsgs(true);
    fetchMessages(selectedId)
      .then((rows) => {
        if (!active) return;
        setMessages(rows);
      })
      .finally(() => active && setLoadingMsgs(false));
    markDelivered(selectedId);
    markRead(selectedId).then(() => fetchConversations().then(setConversations));

    msgChannel.current = subscribeToMessages(
      selectedId,
      (m) => {
        // INSERT: añade si no existe; si es del otro, márcalo leído.
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        getCurrentUserId().then((uid) => {
          if (m.sender_id !== uid) {
            markRead(selectedId);
            fetchConversations().then(setConversations);
          }
        });
      },
      (m) => {
        // UPDATE: actualiza el estado (delivered/read) del mensaje.
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
      }
    );
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Auto-scroll al final cuando llegan mensajes.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  const visibleConvs = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q
      ? conversations.filter(
          (c) => c.counterpart_name.toLowerCase().includes(q) || c.listing_title.toLowerCase().includes(q)
        )
      : conversations;
  }, [conversations, filter]);

  const selectedSold = selected ? sold[selected.listing_id] : undefined;
  // El lado se define por quién soy en ESTA conversación (no por el dashboard).
  const role_side: "buyer" | "seller" =
    selected && userId === selected.seller_id ? "seller" : "buyer";
  const selfMarked = selected ? !!(role_side === "buyer" ? selectedSold?.buyer : selectedSold?.seller) : false;

  const openConversation = (id: string) => {
    setSelectedId(id);
    setParams({ c: id }, { replace: true });
  };

  const closeConversation = () => {
    setSelectedId(null);
    params.delete("c");
    setParams(params, { replace: true });
  };

  const send = async () => {
    if (!draft.trim() || !selectedId) return;
    const text = draft;
    setDraft("");
    try {
      const inserted = await sendMessage(selectedId, text);
      if (inserted) {
        setMessages((prev) => (prev.some((x) => x.id === inserted.id) ? prev : [...prev, inserted]));
      }
    } catch (e) {
      setDraft(text);
      toast({ title: "No se pudo enviar", description: e instanceof Error ? e.message : "Intenta de nuevo.", variant: "destructive" });
    }
  };

  const submitReport = async () => {
    if (!selected || !reportCategory) return;
    setReportSubmitting(true);
    try {
      await reportUser(selected.counterpart_id, reportCategory, reportDetail);
      setReportOpen(false);
      setReportCategory("");
      setReportDetail("");
      toast({ title: "Usuario reportado", description: "Nuestro equipo de moderación revisará esta conversación." });
    } catch (e) {
      toast({ title: "No se pudo reportar", description: e instanceof Error ? e.message : "Intenta de nuevo.", variant: "destructive" });
    } finally {
      setReportSubmitting(false);
    }
  };

  const toggleSold = () => {
    if (!selected) return;
    markSold(selected.listing_id, role_side, role_side === "buyer" ? "Comprador" : selected.counterpart_name);
    setSold(loadSold());
    toast({ title: "Venta marcada como concretada" });
  };

  return (
    <DashboardLayout role={role} fullHeight>
      {/* En móvil el chat va edge-to-edge (como WhatsApp); en desktop se mantiene en el contenedor.
          OJO: sin animate-fade-in aquí — su transform rompería el position:fixed del grid. */}
      <div className="-mx-3 sm:-mx-6 lg:mx-0 lg:flex lg:flex-col lg:flex-1 lg:min-h-0">
        {/* El título "Mensajes" ya lo pinta la cabecera de DashboardLayout. */}

        {/* Móvil: contenedor fijo entre el navbar superior (64px) y el inferior (64px),
            a pantalla completa de lado a lado. Desktop (lg): ocupa el alto libre que le
            cede el layout (`fullHeight`) y scrollea por dentro, nunca la página. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 lg:gap-4 fixed inset-x-0 top-16 md:top-[76px] bottom-16 z-30 lg:static lg:inset-auto lg:top-auto lg:bottom-auto lg:z-auto lg:flex-1 lg:min-h-0">
          {/* Lista de conversaciones */}
          <Card className={`lg:col-span-1 overflow-hidden rounded-none border-x-0 lg:rounded-xl lg:border-x h-full lg:h-auto ${selected ? "hidden lg:flex lg:flex-col" : "flex flex-col"}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base mb-2 lg:hidden">Mensajes</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  placeholder="Buscar conversaciones..."
                  className="text-sm pl-9"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-y-auto flex-1">
              {loadingConvs ? (
                <LoadingState label="Cargando conversaciones…" />
              ) : visibleConvs.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {conversations.length === 0 ? "Aún no tienes conversaciones." : "Sin resultados."}
                </div>
              ) : (
                visibleConvs.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => openConversation(conv.id)}
                    className={`w-full flex items-start gap-3 p-3 hover:bg-muted text-left border-b transition-colors ${
                      conv.id === selectedId ? "bg-muted" : ""
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {conv.counterpart_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">{conv.counterpart_name}</p>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtWhen(conv.last_message_at)}</span>
                      </div>
                      <p className="text-xs text-secondary truncate font-medium">{conv.listing_title}</p>
                      <p className="text-xs text-muted-foreground truncate">{conv.last_message ?? "Sin mensajes aún"}</p>
                    </div>
                    {conv.unread > 0 && (
                      <span className="bg-secondary text-secondary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                        {conv.unread}
                      </span>
                    )}
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {/* Área de chat */}
          <Card
            className={`lg:col-span-2 flex flex-col overflow-hidden rounded-none border-x-0 lg:rounded-xl lg:border-x h-full lg:h-auto ${
              selected ? "flex" : "hidden lg:flex"
            }`}
          >
            {selected ? (
              <>
                <CardHeader className="border-b py-3 shrink-0 bg-card">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={closeConversation}
                      className="lg:hidden p-1 -ml-1 rounded-md hover:bg-muted text-muted-foreground"
                      aria-label="Volver"
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-sm font-bold">
                      {selected.counterpart_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-sm truncate">{selected.counterpart_name}</CardTitle>
                      <p className="text-xs text-muted-foreground truncate">{selected.listing_title}</p>
                    </div>
                    <button
                      onClick={() => setReportOpen(true)}
                      className="p-2 -mr-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors shrink-0"
                      aria-label={`Reportar a ${selected.counterpart_name}`}
                      title="Reportar a este usuario"
                    >
                      <Flag size={18} />
                    </button>
                  </div>
                  {selected.listing_category !== "empleos" && (
                    <div className="mt-2 pt-2 border-t flex items-center justify-between gap-2 flex-wrap">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox checked={selfMarked} onCheckedChange={toggleSold} />
                        <span>Marcar venta concretada ({role_side === "buyer" ? "como comprador" : "como vendedor"})</span>
                      </label>
                      {(selectedSold?.buyer && selectedSold?.seller) && (
                        <span className="text-[11px] text-success font-semibold flex items-center gap-1">
                          <CheckCircle2 size={11} /> Confirmada por ambos
                        </span>
                      )}
                    </div>
                  )}
                </CardHeader>
                <CardContent ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/30">
                  {loadingMsgs ? (
                    <LoadingState label="Cargando mensajes…" />
                  ) : messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center text-muted-foreground text-sm">
                      Escribe el primer mensaje para iniciar la conversación.
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const mine = msg.sender_id === userId;
                      return (
                        <div key={msg.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[80%] rounded-2xl px-4 py-2 shadow-sm ${
                              mine
                                ? "bg-primary text-primary-foreground rounded-br-sm"
                                : "bg-card text-foreground rounded-bl-sm border"
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                            <p className={`text-[10px] mt-1 flex items-center gap-1 justify-end ${mine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                              {fmtTime(msg.created_at)}
                              {mine && <StatusTick status={msg.status} />}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
                <div className="p-3 border-t flex gap-2 bg-card shrink-0">
                  <Input
                    placeholder="Escribe un mensaje..."
                    className="flex-1"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                  />
                  <Button size="icon" variant="hero" onClick={send}>
                    <Send size={16} />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center text-muted-foreground p-8">
                <div>
                  <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
                    <Send size={24} className="text-muted-foreground" />
                  </div>
                  <p className="font-medium">Selecciona una conversación</p>
                  <p className="text-xs mt-1">Elige un chat para ver el historial de mensajes.</p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Reportar al otro participante del chat (REQ-10). */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent
          className="sm:max-w-md max-h-[90vh] overflow-y-auto"
          onFocusCapture={scrollFocusedIntoView}
          style={kbPad ? { paddingBottom: kbPad + 24 } : undefined}
        >
          <DialogHeader>
            <DialogTitle>Reportar usuario</DialogTitle>
            <DialogDescription>
              Cuéntanos qué problema observas con {selected?.counterpart_name || "este usuario"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Motivo del reporte</Label>
            <Select value={reportCategory} onValueChange={setReportCategory}>
              <SelectTrigger><SelectValue placeholder="Selecciona un motivo" /></SelectTrigger>
              <SelectContent>
                {USER_REPORT_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Label htmlFor="chat-report-detail">Detalle (opcional)</Label>
            <Textarea
              id="chat-report-detail"
              rows={3}
              value={reportDetail}
              onChange={(e) => setReportDetail(e.target.value)}
              placeholder="Cuéntanos más sobre el problema…"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReportOpen(false)}>Cancelar</Button>
            <Button onClick={submitReport} disabled={!reportCategory || reportSubmitting} className="gap-2">
              <Flag size={14} /> {reportSubmitting ? "Enviando…" : "Enviar reporte"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default MessagesPage;
