import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, ShieldAlert, Key } from "lucide-react";

const SuperSecurity = () => (
  <AdminLayout role="superadmin" title="Seguridad" breadcrumb={["Plataforma", "Seguridad"]}>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
      {[
        { icon: ShieldAlert, label: "Intentos fallidos 24h", value: "142", color: "bg-warning/15 text-warning" },
        { icon: Lock, label: "Sesiones activas", value: "3,210", color: "bg-success/15 text-success" },
        { icon: Key, label: "Tokens API activos", value: "18", color: "bg-primary/10 text-primary" },
      ].map((k) => (
        <Card key={k.label}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${k.color}`}><k.icon size={18} /></div>
            <div>
              <p className="text-xl font-extrabold">{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>

    <Card>
      <CardHeader><CardTitle className="text-base md:text-lg">Políticas de seguridad</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {[
          { l: "Autenticación de dos factores (2FA)", d: "Requerir 2FA a todos los administradores", v: true },
          { l: "Bloqueo tras 5 intentos fallidos", d: "Bloquear cuenta por 30 minutos", v: true },
          { l: "Caducidad de contraseñas", d: "Forzar cambio cada 90 días", v: false },
          { l: "Lista blanca de IPs", d: "Solo permitir login desde IPs autorizadas", v: false },
          { l: "Cifrado en reposo", d: "AES-256 sobre datos sensibles", v: true },
        ].map((p) => (
          <div key={p.l} className="flex items-center justify-between gap-4 p-3 rounded-lg hover:bg-muted/50">
            <div>
              <p className="text-sm font-medium">{p.l}</p>
              <p className="text-xs text-muted-foreground">{p.d}</p>
            </div>
            <Switch defaultChecked={p.v} />
          </div>
        ))}
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle className="text-base md:text-lg">Política de contraseñas</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div><Label>Longitud mínima</Label><Input type="number" defaultValue={10} className="mt-1" /></div>
        <div><Label>Intentos antes de bloqueo</Label><Input type="number" defaultValue={5} className="mt-1" /></div>
        <div><Label>Tiempo de sesión (min)</Label><Input type="number" defaultValue={60} className="mt-1" /></div>
        <div className="md:col-span-3 flex justify-end"><Button>Guardar políticas</Button></div>
      </CardContent>
    </Card>
  </AdminLayout>
);

export default SuperSecurity;
