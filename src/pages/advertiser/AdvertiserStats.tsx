import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Eye, MousePointerClick, MessageSquare, Users } from "lucide-react";

const stats = [
  { label: "Vistas totales", value: "4,521", change: "+12%", icon: Eye },
  { label: "Clics en contacto", value: "234", change: "+8%", icon: MousePointerClick },
  { label: "Mensajes recibidos", value: "67", change: "+15%", icon: MessageSquare },
  { label: "Postulaciones", value: "23", change: "+5%", icon: Users },
];

const topListings = [
  { title: "Departamento 3 dormitorios en Miraflores", views: 342, contacts: 18, conversion: "5.3%" },
  { title: "Toyota Corolla 2024", views: 189, contacts: 12, conversion: "6.3%" },
  { title: "Desarrollador Full Stack - Remoto", views: 567, contacts: 45, conversion: "7.9%" },
  { title: "iPhone 15 Pro Max 256GB", views: 423, contacts: 28, conversion: "6.6%" },
];

const AdvertiserStats = () => (
  <DashboardLayout role="anunciante">
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Estadísticas</h1>
        <p className="text-muted-foreground">Rendimiento de tus avisos en los últimos 30 días.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <stat.icon size={20} className="text-secondary" />
                <span className="text-xs text-success font-medium flex items-center gap-1">
                  <TrendingUp size={12} /> {stat.change}
                </span>
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Rendimiento por aviso</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-3 font-medium">Aviso</th>
                  <th className="pb-3 font-medium text-right">Vistas</th>
                  <th className="pb-3 font-medium text-right">Contactos</th>
                  <th className="pb-3 font-medium text-right">Conversión</th>
                </tr>
              </thead>
              <tbody>
                {topListings.map((l, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="py-3 font-medium text-foreground">{l.title}</td>
                    <td className="py-3 text-right text-muted-foreground">{l.views}</td>
                    <td className="py-3 text-right text-muted-foreground">{l.contacts}</td>
                    <td className="py-3 text-right text-secondary font-medium">{l.conversion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Tendencia de vistas</CardTitle></CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center bg-muted/50 rounded-lg border border-dashed border-border">
            <div className="text-center text-muted-foreground">
              <TrendingUp size={40} className="mx-auto mb-2 text-secondary/40" />
              <p className="text-sm font-medium">Gráfico de tendencia</p>
              <p className="text-xs">Evolución de vistas y contactos</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </DashboardLayout>
);

export default AdvertiserStats;
