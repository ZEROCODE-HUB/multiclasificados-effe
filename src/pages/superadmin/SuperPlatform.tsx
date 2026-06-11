import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

const SuperPlatform = () => (
  <AdminLayout role="superadmin" title="Configuración global" breadcrumb={["Plataforma", "Configuración"]}>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base md:text-lg">Información general</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Nombre de la plataforma</Label><Input defaultValue="eFFe Multiclasificados" className="mt-1" /></div>
          <div><Label>URL pública</Label><Input defaultValue="https://effemulticlasificados.pe" className="mt-1" /></div>
          <div><Label>Correo de soporte</Label><Input defaultValue="soporte@effe.pe" className="mt-1" /></div>
          <div><Label>País / Moneda principal</Label>
            <Select defaultValue="pe"><SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="pe">Perú (PEN)</SelectItem>
                <SelectItem value="cl">Chile (CLP)</SelectItem>
                <SelectItem value="co">Colombia (COP)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base md:text-lg">Funciones</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {[
            { l: "Registro público abierto", d: "Permitir que cualquier visitante se registre", v: true },
            { l: "Aprobación manual de avisos", d: "Todo aviso requiere revisión antes de publicarse", v: true },
            { l: "Pagos online", d: "Activar pasarelas de pago para planes premium", v: true },
            { l: "Modo mantenimiento", d: "Mostrar página de mantenimiento al público", v: false },
            { l: "Chat entre usuarios", d: "Habilitar mensajería interna", v: true },
          ].map((f) => (
            <div key={f.l} className="flex items-center justify-between gap-4 p-3 rounded-lg hover:bg-muted/50">
              <div>
                <p className="text-sm font-medium">{f.l}</p>
                <p className="text-xs text-muted-foreground">{f.d}</p>
              </div>
              <Switch defaultChecked={f.v} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
    <div className="flex justify-end">
      <Button onClick={() => toast({ title: "Configuración guardada" })}>Guardar configuración</Button>
    </div>
  </AdminLayout>
);

export default SuperPlatform;
