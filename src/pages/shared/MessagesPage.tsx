import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Send, Search, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { loadSold, markSold } from "@/lib/pricing";

const conversations = [
  { id: 1, listingId: "AV-10241", name: "María López", listing: "Departamento 3 dormitorios", lastMsg: "Hola, ¿sigue disponible?", time: "Hace 2h", unread: 2 },
  { id: 2, listingId: "AV-10239", name: "Carlos Ruiz", listing: "Desarrollador Full Stack", lastMsg: "Me interesa el puesto.", time: "Hace 5h", unread: 0 },
  { id: 3, listingId: "AV-10240", name: "Ana Torres", listing: "Toyota Corolla 2024", lastMsg: "¿Puede enviar más fotos?", time: "Ayer", unread: 1 },
  { id: 4, listingId: "AV-10238", name: "Pedro Gómez", listing: "iPhone 15 Pro Max", lastMsg: "¿Aceptaría un cambio?", time: "Hace 2 días", unread: 0 },
];

const sampleMessages = [
  { from: "María López", text: "Hola, buenas tardes. Vi su aviso del departamento en Miraflores.", time: "14:20", mine: false },
  { from: "Tú", text: "¡Hola María! Sí, aún está disponible. ¿Le gustaría agendar una visita?", time: "14:25", mine: true },
  { from: "María López", text: "Sí, me encantaría. ¿Está disponible este fin de semana?", time: "14:30", mine: false },
  { from: "Tú", text: "Por supuesto. ¿Le parece bien el sábado a las 10am?", time: "14:35", mine: true },
  { from: "María López", text: "Perfecto, ahí estaré. ¿Me puede enviar la dirección exacta?", time: "15:00", mine: false },
];

const MessagesPage = ({ role }: { role: "anunciante" | "buscador" }) => {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [sold, setSold] = useState(() => loadSold());

  useEffect(() => {
    const sync = () => setSold(loadSold());
    window.addEventListener("effe:sold-updated", sync);
    return () => window.removeEventListener("effe:sold-updated", sync);
  }, []);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const selectedSold = selected ? sold[selected.listingId] : undefined;
  const role_side: "buyer" | "seller" = role === "buscador" ? "buyer" : "seller";
  const selfMarked = selected ? !!(role_side === "buyer" ? selectedSold?.buyer : selectedSold?.seller) : false;

  const send = () => {
    if (!draft.trim()) return;
    toast({ title: "Mensaje enviado", description: draft });
    setDraft("");
  };

  const toggleSold = () => {
    if (!selected) return;
    markSold(selected.listingId, role_side, role_side === "buyer" ? "Comprador" : selected.name);
    setSold(loadSold());
    toast({ title: "Venta marcada como concretada" });
  };


  return (
    <DashboardLayout role={role}>
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold text-foreground mb-4 lg:block hidden">Mensajes</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:h-[calc(100vh-12rem)]">
          {/* Conversations list — mobile: only shown when none selected; desktop: always shown */}
          <Card className={`lg:col-span-1 overflow-hidden ${selected ? "hidden lg:flex lg:flex-col" : "flex flex-col"}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base mb-2 lg:hidden">Mensajes</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input placeholder="Buscar conversaciones..." className="text-sm pl-9" />
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-y-auto flex-1">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  className={`w-full flex items-start gap-3 p-3 hover:bg-muted text-left border-b transition-colors ${
                    conv.id === selectedId ? "bg-muted" : ""
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {conv.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{conv.name}</p>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">{conv.time}</span>
                    </div>
                    <p className="text-xs text-secondary truncate font-medium">{conv.listing}</p>
                    <p className="text-xs text-muted-foreground truncate">{conv.lastMsg}</p>
                  </div>
                  {conv.unread > 0 && (
                    <span className="bg-secondary text-secondary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                      {conv.unread}
                    </span>
                  )}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Chat area — mobile: only when selected; desktop: always (placeholder if none) */}
          <Card
            className={`lg:col-span-2 flex flex-col overflow-hidden h-[calc(100vh-9rem)] lg:h-auto ${
              selected ? "flex" : "hidden lg:flex"
            }`}
          >
            {selected ? (
              <>
                <CardHeader className="border-b py-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedId(null)}
                      className="lg:hidden p-1 -ml-1 rounded-md hover:bg-muted text-muted-foreground"
                      aria-label="Volver"
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-sm font-bold">
                      {selected.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-sm truncate">{selected.name}</CardTitle>
                      <p className="text-xs text-muted-foreground truncate">{selected.listing}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/30">
                  {sampleMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2 shadow-sm ${
                          msg.mine
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-card text-foreground rounded-bl-sm border"
                        }`}
                      >
                        <p className="text-sm">{msg.text}</p>
                        <p className={`text-[10px] mt-1 ${msg.mine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                          {msg.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
                <div className="p-3 border-t flex gap-2 bg-card">
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
    </DashboardLayout>
  );
};

export default MessagesPage;
