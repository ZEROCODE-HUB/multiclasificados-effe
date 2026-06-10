import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Eye, MousePointerClick, MessageSquare, Users } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend,
} from "recharts";

const stats = [
  { label: "Vistas totales", value: "4,521", change: "+12%", icon: Eye, color: "text-primary", bg: "bg-primary/10" },
  { label: "Clics en contacto", value: "234", change: "+8%", icon: MousePointerClick, color: "text-secondary", bg: "bg-secondary/10" },
  { label: "Mensajes recibidos", value: "67", change: "+15%", icon: MessageSquare, color: "text-success", bg: "bg-success/10" },
  { label: "Postulaciones", value: "23", change: "+5%", icon: Users, color: "text-warning", bg: "bg-warning/10" },
];

const topListings = [
  { title: "Departamento 3 dormitorios en Miraflores", views: 342, contacts: 18, conversion: "5.3%" },
  { title: "Toyota Corolla 2024", views: 189, contacts: 12, conversion: "6.3%" },
  { title: "Desarrollador Full Stack - Remoto", views: 567, contacts: 45, conversion: "7.9%" },
  { title: "iPhone 15 Pro Max 256GB", views: 423, contacts: 28, conversion: "6.6%" },
];

const trendData = [
  { day: "1", vistas: 120, contactos: 8 },
  { day: "5", vistas: 180, contactos: 12 },
  { day: "10", vistas: 240, contactos: 18 },
  { day: "15", vistas: 200, contactos: 14 },
  { day: "20", vistas: 320, contactos: 22 },
  { day: "25", vistas: 380, contactos: 28 },
  { day: "30", vistas: 450, contactos: 34 },
];

const barData = topListings.map((l) => ({
  name: l.title.length > 16 ? l.title.slice(0, 14) + "…" : l.title,
  Vistas: l.views,
  Contactos: l.contacts,
}));

const AdvertiserStats = () => (
  <DashboardLayout role="anunciante">
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Estadísticas</h1>
        <p className="text-muted-foreground">Rendimiento de tus avisos en los últimos 30 días.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${stat.bg} ${stat.color}`}>
                  <stat.icon size={18} />
                </div>
                <span className="text-[10px] text-success font-bold flex items-center gap-1 bg-success/10 px-2 py-0.5 rounded-full">
                  <TrendingUp size={10} /> {stat.change}
                </span>
              </div>
              <p className="text-2xl font-extrabold text-foreground leading-none">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tendencia de vistas y contactos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVistas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorContactos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="vistas" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorVistas)" strokeWidth={2} />
                <Area type="monotone" dataKey="contactos" stroke="hsl(var(--secondary))" fillOpacity={1} fill="url(#colorContactos)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Comparativa por aviso</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Vistas" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Contactos" fill="hsl(var(--secondary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Rendimiento por aviso</CardTitle></CardHeader>
        <CardContent>
          <div className="-mx-6 px-6 overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
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
                    <td className="py-3 font-medium text-foreground whitespace-nowrap pr-4">{l.title}</td>
                    <td className="py-3 text-right text-muted-foreground">{l.views}</td>
                    <td className="py-3 text-right text-muted-foreground">{l.contacts}</td>
                    <td className="py-3 text-right text-secondary font-semibold">{l.conversion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  </DashboardLayout>
);

export default AdvertiserStats;
