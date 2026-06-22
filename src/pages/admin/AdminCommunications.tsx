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
import { Checkbox } from "@/components/ui/checkbox";
import { Send, Megaphone, Users, Target, MapPin, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const AdminCommunications = ({ role }: { role: AdminRole }) => {
  const [sent, setSent] = useState(0);
  const send = (k: string) => { setSent((s) => s + 1); toast({ title: "Mensaje enviado", description: k }); };

  // Masivo — segmentación avanzada
  const [segment, setSegment] = useState("buscadores-perfil");
  const [region, setRegion] = useState("all");
  const [interest, setInterest] = useState("all");
  const [matchAds, setMatchAds] = useState(false);
  const [copyAdmins, setCopyAdmins] = useState(true);

  return (
    <AdminLayout role={role} title="Comunicaciones" breadcrumb={["Comunicaciones", "Centro"]}>
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
                  {/* Segmentación */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="flex items-center gap-1.5"><Target size={12} /> Audiencia</Label>
                      <Select value={segment} onValueChange={setSegment}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos los usuarios</SelectItem>
                          <SelectItem value="anunciantes">Solo anunciantes</SelectItem>
                          <SelectItem value="buscadores-perfil">Buscadores por perfil</SelectItem>
                          <SelectItem value="buscadores-intereses">Buscadores por intereses</SelectItem>
                          <SelectItem value="anunciantes-activos">Anunciantes con avisos activos</SelectItem>
                          <SelectItem value="pro">Usuarios plan Pro</SelectItem>
                          <SelectItem value="inactivos">Inactivos +30 días</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="flex items-center gap-1.5"><MapPin size={12} /> Ubicación geográfica</Label>
                      <Select value={region} onValueChange={setRegion}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todo Perú</SelectItem>
                          <SelectItem value="lima">Lima Metropolitana</SelectItem>
                          <SelectItem value="arequipa">Arequipa</SelectItem>
                          <SelectItem value="trujillo">La Libertad - Trujillo</SelectItem>
                          <SelectItem value="cusco">Cusco</SelectItem>
                          <SelectItem value="piura">Piura</SelectItem>
                          <SelectItem value="chiclayo">Lambayeque - Chiclayo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="flex items-center gap-1.5"><Sparkles size={12} /> Interés / Categoría</Label>
                      <Select value={interest} onValueChange={setInterest}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos los intereses</SelectItem>
                          <SelectItem value="inmuebles">Inmuebles</SelectItem>
                          <SelectItem value="vehiculos">Vehículos</SelectItem>
                          <SelectItem value="empleos">Empleos</SelectItem>
                          <SelectItem value="tecnologia">Tecnología</SelectItem>
                          <SelectItem value="productos">Productos</SelectItem>
                          <SelectItem value="servicios">Servicios</SelectItem>
                          <SelectItem value="educacion-finanzas">Educación y Finanzas</SelectItem>
                          <SelectItem value="salud-belleza-moda">Salud, Belleza y Moda</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer p-3 border rounded-md w-full">
                        <Checkbox checked={matchAds} onCheckedChange={(v) => setMatchAds(!!v)} />
                        <span>Hacer match con avisos activos de anunciantes</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <Label>Asunto</Label>
                    <Input placeholder="Título de la campaña" className="mt-1" />
                  </div>
                  <div>
                    <Label>Contenido</Label>
                    <Textarea rows={6} placeholder="Mensaje masivo..." className="mt-1" />
                  </div>

                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <Checkbox checked={copyAdmins} onCheckedChange={(v) => setCopyAdmins(!!v)} className="mt-0.5" />
                    <span>Incluir en copia a Administradores y Superadministradores</span>
                  </label>

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="gap-1"><Users size={12} /> ~15,420 destinatarios estimados</Badge>
                    <Badge variant="outline">Email + Notificación in-app</Badge>
                    {copyAdmins && <Badge variant="outline" className="text-secondary border-secondary/40">CC: equipo interno</Badge>}
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
