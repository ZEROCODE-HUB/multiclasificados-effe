import { useState } from "react";
import { AdminLayout, AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Send, Megaphone, Users } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const AdminCommunications = ({ role }: { role: AdminRole }) => {
  const [sent, setSent] = useState(0);
  const send = (k: string) => { setSent((s) => s + 1); toast({ title: "Mensaje enviado", description: k }); };

  return (
    <AdminLayout role={role} title="Comunicaciones" breadcrumb={["Operación", "Comunicaciones"]}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base md:text-lg">Centro de mensajes</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="individual">
                <TabsList className="grid grid-cols-2 w-full md:w-auto">
                  <TabsTrigger value="individual" className="gap-2"><Send size={14} /> Individual</TabsTrigger>
                  <TabsTrigger value="masivo" className="gap-2"><Megaphone size={14} /> Masivo</TabsTrigger>
                </TabsList>
                <TabsContent value="individual" className="space-y-4 pt-4">
                  <div>
                    <Label>Destinatario</Label>
                    <Input placeholder="Buscar usuario por nombre o correo..." className="mt-1" />
                  </div>
                  <div>
                    <Label>Asunto</Label>
                    <Input placeholder="Asunto del mensaje" className="mt-1" />
                  </div>
                  <div>
                    <Label>Mensaje</Label>
                    <Textarea rows={6} placeholder="Escribe el contenido..." className="mt-1" />
                  </div>
                  <Button className="w-full md:w-auto" onClick={() => send("Individual")}>Enviar mensaje</Button>
                </TabsContent>
                <TabsContent value="masivo" className="space-y-4 pt-4">
                  <div>
                    <Label>Segmentación</Label>
                    <Select defaultValue="all">
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los usuarios</SelectItem>
                        <SelectItem value="anunciantes">Solo anunciantes</SelectItem>
                        <SelectItem value="buscadores">Solo buscadores</SelectItem>
                        <SelectItem value="pro">Usuarios plan Pro</SelectItem>
                        <SelectItem value="inactivos">Inactivos +30 días</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Asunto</Label>
                    <Input placeholder="Título de la campaña" className="mt-1" />
                  </div>
                  <div>
                    <Label>Contenido</Label>
                    <Textarea rows={6} placeholder="Mensaje masivo..." className="mt-1" />
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="gap-1"><Users size={12} /> ~15,420 destinatarios</Badge>
                    <Badge variant="outline">Email + Notificación in-app</Badge>
                  </div>
                  <Button className="w-full md:w-auto" onClick={() => send("Masivo")}>Programar envío</Button>
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
            {[
              { label: "Enviados hoy", value: sent + 24 },
              { label: "Tasa de apertura", value: "62%" },
              { label: "Clics", value: "18%" },
              { label: "Bajas", value: "0.4%" },
            ].map((m) => (
              <div key={m.label} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm text-muted-foreground">{m.label}</span>
                <span className="font-bold text-foreground">{m.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminCommunications;
