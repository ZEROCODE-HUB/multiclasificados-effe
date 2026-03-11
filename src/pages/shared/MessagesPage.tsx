import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

const conversations = [
  { id: 1, name: "María López", listing: "Departamento 3 dormitorios", lastMsg: "Hola, ¿sigue disponible?", time: "Hace 2h", unread: 2 },
  { id: 2, name: "Carlos Ruiz", listing: "Desarrollador Full Stack", lastMsg: "Me interesa el puesto.", time: "Hace 5h", unread: 0 },
  { id: 3, name: "Ana Torres", listing: "Toyota Corolla 2024", lastMsg: "¿Puede enviar más fotos?", time: "Ayer", unread: 1 },
  { id: 4, name: "Pedro Gómez", listing: "iPhone 15 Pro Max", lastMsg: "¿Aceptaría un cambio?", time: "Hace 2 días", unread: 0 },
];

const messages = [
  { from: "María López", text: "Hola, buenas tardes. Vi su aviso del departamento en Miraflores.", time: "14:20", mine: false },
  { from: "Tú", text: "¡Hola María! Sí, aún está disponible. ¿Le gustaría agendar una visita?", time: "14:25", mine: true },
  { from: "María López", text: "Sí, me encantaría. ¿Está disponible este fin de semana?", time: "14:30", mine: false },
  { from: "Tú", text: "Por supuesto. ¿Le parece bien el sábado a las 10am?", time: "14:35", mine: true },
  { from: "María López", text: "Perfecto, ahí estaré. ¿Me puede enviar la dirección exacta?", time: "15:00", mine: false },
];

const MessagesPage = ({ role }: { role: "anunciante" | "buscador" }) => (
  <DashboardLayout role={role}>
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground mb-4">Mensajes</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-12rem)]">
        {/* Conversations list */}
        <Card className="md:col-span-1 overflow-hidden">
          <CardHeader className="pb-2">
            <Input placeholder="Buscar conversaciones..." className="text-sm" />
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto">
            {conversations.map((conv) => (
              <div key={conv.id} className={`flex items-start gap-3 p-3 hover:bg-muted cursor-pointer border-b transition-colors ${conv.id === 1 ? "bg-muted" : ""}`}>
                <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-sm font-bold flex-shrink-0">
                  {conv.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground truncate">{conv.name}</p>
                    <span className="text-xs text-muted-foreground">{conv.time}</span>
                  </div>
                  <p className="text-xs text-secondary truncate">{conv.listing}</p>
                  <p className="text-xs text-muted-foreground truncate">{conv.lastMsg}</p>
                </div>
                {conv.unread > 0 && (
                  <span className="bg-secondary text-secondary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">{conv.unread}</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Chat area */}
        <Card className="md:col-span-2 flex flex-col overflow-hidden">
          <CardHeader className="border-b py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-sm font-bold">M</div>
              <div>
                <CardTitle className="text-sm">María López</CardTitle>
                <p className="text-xs text-muted-foreground">Departamento 3 dormitorios en Miraflores</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[70%] rounded-xl px-4 py-2 ${msg.mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                  <p className="text-sm">{msg.text}</p>
                  <p className={`text-xs mt-1 ${msg.mine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{msg.time}</p>
                </div>
              </div>
            ))}
          </CardContent>
          <div className="p-3 border-t flex gap-2">
            <Input placeholder="Escribe un mensaje..." className="flex-1" />
            <Button size="icon" variant="hero"><Send size={16} /></Button>
          </div>
        </Card>
      </div>
    </div>
  </DashboardLayout>
);

export default MessagesPage;
