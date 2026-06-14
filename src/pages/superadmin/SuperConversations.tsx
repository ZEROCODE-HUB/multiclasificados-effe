import { useState } from "react";
import { AdminLayout, AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, AlertOctagon, ArrowLeft } from "lucide-react";
import { reportedConversations } from "@/data/adminMockData";

const mockChat = [
  { from: "Spam Bot 21", text: "Hola, te ofrezco un descuento exclusivo, escríbeme a este otro número urgentemente.", time: "10:32" },
  { from: "Ana García", text: "Estoy interesada, pero ¿por qué fuera de la plataforma?", time: "10:34" },
  { from: "Spam Bot 21", text: "Solo así te puedo dar el 70% de descuento, envíame tus datos bancarios.", time: "10:36" },
  { from: "Ana García", text: "Eso no es seguro, voy a reportar la conversación.", time: "10:38" },
];

const statusColor: Record<string, string> = {
  Abierto: "bg-destructive/15 text-destructive border-destructive/30",
  "En revisión": "bg-warning/15 text-warning border-warning/30",
  Resuelto: "bg-success/15 text-success border-success/30",
};

const SuperConversations = ({ role = "superadmin" as AdminRole }: { role?: AdminRole }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const item = reportedConversations.find((r) => r.id === selected);

  return (
    <AdminLayout role={role} title="Conversaciones reportadas" breadcrumb={["Comunicaciones", "Conversaciones"]}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        <Card className={`lg:col-span-1 flex flex-col ${selected ? "hidden lg:flex" : "flex"}`}>
          <CardHeader className="space-y-2">
            <CardTitle className="text-base md:text-lg">Reclamos</CardTitle>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar..." className="pl-9 h-9" />
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-2">
            {reportedConversations.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r.id)}
                className={`w-full text-left p-3 border rounded-lg hover:bg-muted/50 transition ${selected === r.id ? "bg-muted border-secondary/40" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-mono text-muted-foreground">{r.id}</p>
                    <p className="text-sm font-semibold truncate">{r.reporter} → {r.reported}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.reason}</p>
                  </div>
                  <Badge variant="outline" className={statusColor[r.status]}>{r.status}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{r.date}</p>
              </button>
            ))}
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
                    <p className="font-semibold text-sm">{item.reporter} reportó a {item.reported}</p>
                    <p className="text-xs text-muted-foreground">{item.reason} · {item.date}</p>
                  </div>
                  <Badge variant="outline" className={statusColor[item.status]}>{item.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto py-4 space-y-3 bg-muted/30">
                {mockChat.map((m, i) => {
                  const isReported = m.from === item.reported;
                  return (
                    <div key={i} className={`flex ${isReported ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${isReported ? "bg-destructive/10 border border-destructive/30" : "bg-primary text-primary-foreground"}`}>
                        <p className="text-[10px] font-semibold opacity-80 mb-1">{m.from}</p>
                        <p className="text-sm">{m.text}</p>
                        <p className="text-[10px] opacity-60 mt-1">{m.time}</p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
              <div className="border-t p-4 flex flex-col sm:flex-row gap-2">
                <Button variant="outline" className="flex-1">Marcar en revisión</Button>
                <Button variant="outline" className="flex-1 text-warning">Advertir usuario</Button>
                <Button className="flex-1 bg-destructive hover:bg-destructive/90">Suspender cuenta</Button>
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
    </AdminLayout>
  );
};

export default SuperConversations;
