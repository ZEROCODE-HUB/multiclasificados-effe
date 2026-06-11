import { AdminLayout, AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, ClipboardList, Clock, DollarSign, FileBarChart, AlertTriangle, ArrowUpRight } from "lucide-react";
import { adminKpis, revenueSeries, categoryDistribution, recentActivity } from "@/data/adminMockData";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ["hsl(220 56% 20%)", "hsl(24 95% 53%)", "hsl(166 60% 45%)", "hsl(220 56% 45%)", "hsl(40 95% 55%)", "hsl(220 14% 60%)"];

interface Props { role: AdminRole }

const AdminDashboard = ({ role }: Props) => {
  const kpis = [
    { label: "Usuarios registrados", value: adminKpis.users.toLocaleString(), icon: Users, trend: "+8.4%", accent: "bg-primary/10 text-primary" },
    { label: "Avisos activos", value: adminKpis.activeListings.toLocaleString(), icon: ClipboardList, trend: "+3.2%", accent: "bg-secondary/15 text-secondary" },
    { label: "Pendientes moderación", value: adminKpis.pendingListings, icon: Clock, trend: "+12", accent: "bg-warning/15 text-warning" },
    { label: "Ingresos (S/)", value: adminKpis.revenue.toLocaleString(), icon: DollarSign, trend: "+14.1%", accent: "bg-success/15 text-success" },
    { label: "Postulaciones", value: adminKpis.applications.toLocaleString(), icon: FileBarChart, trend: "+5.8%", accent: "bg-accent text-accent-foreground" },
    { label: "Reportes abiertos", value: adminKpis.reportsOpen, icon: AlertTriangle, trend: "-2", accent: "bg-destructive/15 text-destructive" },
  ];

  return (
    <AdminLayout role={role} title="Panel de control" breadcrumb={["Dashboard"]}>
      {/* Greeting */}
      <div className="relative overflow-hidden rounded-2xl gradient-hero text-primary-foreground p-5 md:p-7">
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-secondary/30 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-secondary font-bold mb-1">Bienvenido</p>
            <h2 className="text-xl md:text-3xl font-extrabold">Hola, {role === "superadmin" ? "Super Admin" : "Administrador"}</h2>
            <p className="text-primary-foreground/70 text-sm md:text-base mt-1">
              Monitorea la salud de la plataforma en tiempo real.
            </p>
          </div>
          <Button variant="hero" size="lg" className="gap-2 self-start sm:self-auto">
            <ArrowUpRight size={18} /> Generar reporte
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="border-l-4 border-l-secondary/60 hover:shadow-md transition">
            <CardContent className="p-3 md:p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${k.accent}`}>
                <k.icon size={18} />
              </div>
              <p className="text-xl md:text-2xl font-extrabold text-foreground leading-none">{k.value}</p>
              <div className="flex items-center justify-between mt-2">
                <p className="text-[11px] text-muted-foreground truncate">{k.label}</p>
                <span className="text-[10px] font-semibold text-success">{k.trend}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base md:text-lg">Ingresos y usuarios (6 meses)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueSeries}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(24 95% 53%)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(24 95% 53%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(220 56% 30%)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(220 56% 30%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 90%)" />
                <XAxis dataKey="mes" fontSize={12} stroke="hsl(220 10% 46%)" />
                <YAxis fontSize={12} stroke="hsl(220 10% 46%)" />
                <Tooltip />
                <Area type="monotone" dataKey="ingresos" stroke="hsl(24 95% 53%)" fill="url(#g1)" strokeWidth={2} />
                <Area type="monotone" dataKey="usuarios" stroke="hsl(220 56% 30%)" fill="url(#g2)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg">Avisos por categoría</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryDistribution} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={3}>
                  {categoryDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base md:text-lg">Actividad reciente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentActivity.map((a, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition">
              <div className="w-9 h-9 rounded-full bg-secondary/15 text-secondary flex items-center justify-center text-sm font-bold flex-shrink-0">
                {a.who.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{a.who}</span> {a.action} <span className="text-secondary font-medium">{a.target}</span>
                </p>
                <p className="text-xs text-muted-foreground">{a.time}</p>
              </div>
              <Badge variant="outline" className="hidden sm:inline-flex">Ver</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default AdminDashboard;
