import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Cpu, Database, Globe } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const traffic = Array.from({ length: 12 }).map((_, i) => ({
  hora: `${i * 2}:00`,
  requests: 1200 + Math.round(Math.sin(i / 2) * 400 + Math.random() * 200),
}));

const SuperMonitoring = () => (
  <AdminLayout role="superadmin" title="Monitoreo general" breadcrumb={["Plataforma", "Monitoreo"]}>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {[
        { icon: Activity, label: "Uptime", value: "99.98%", color: "bg-success/15 text-success" },
        { icon: Cpu, label: "CPU promedio", value: "42%", color: "bg-primary/10 text-primary" },
        { icon: Database, label: "DB latencia", value: "18 ms", color: "bg-accent text-accent-foreground" },
        { icon: Globe, label: "Requests/min", value: "2.4K", color: "bg-secondary/15 text-secondary" },
      ].map((k) => (
        <Card key={k.label}>
          <CardContent className="p-4">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${k.color}`}><k.icon size={18} /></div>
            <p className="text-xl md:text-2xl font-extrabold">{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>

    <Card>
      <CardHeader><CardTitle className="text-base md:text-lg">Tráfico últimas 24h</CardTitle></CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={traffic}>
            <defs>
              <linearGradient id="t1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(24 95% 53%)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="hsl(24 95% 53%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 90%)" />
            <XAxis dataKey="hora" fontSize={11} stroke="hsl(220 10% 46%)" />
            <YAxis fontSize={11} stroke="hsl(220 10% 46%)" />
            <Tooltip />
            <Area type="monotone" dataKey="requests" stroke="hsl(24 95% 53%)" fill="url(#t1)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle className="text-base md:text-lg">Estado de servicios</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {[
          { s: "API Gateway", v: 98, status: "Operativo" },
          { s: "Base de datos", v: 95, status: "Operativo" },
          { s: "Procesador de pagos", v: 88, status: "Degradado" },
          { s: "Almacenamiento de imágenes", v: 99, status: "Operativo" },
          { s: "Notificaciones push", v: 92, status: "Operativo" },
        ].map((svc) => (
          <div key={svc.s}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{svc.s}</span>
              <Badge variant="outline" className={svc.status === "Operativo" ? "bg-success/15 text-success border-success/30" : "bg-warning/15 text-warning border-warning/30"}>{svc.status}</Badge>
            </div>
            <Progress value={svc.v} />
          </div>
        ))}
      </CardContent>
    </Card>
  </AdminLayout>
);

export default SuperMonitoring;
