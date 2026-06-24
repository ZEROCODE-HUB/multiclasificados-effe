import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout, AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, ClipboardList, CheckCircle2, XCircle, DollarSign, ArrowUpRight, Flag } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import {
  fetchAdminStats, fetchGrowthSeries, fetchCategoryDistribution,
  fetchAdminListings, fetchRecentActivity,
  type AdminStats, type AdminListingRow, type ActivityItem,
} from "@/lib/admin";

const COLORS = ["hsl(220 56% 20%)", "hsl(24 95% 53%)", "hsl(166 60% 45%)", "hsl(220 56% 45%)", "hsl(40 95% 55%)", "hsl(220 14% 60%)"];

interface Props { role: AdminRole }

const AdminDashboard = ({ role }: Props) => {
  const navigate = useNavigate();
  const [catFilter, setCatFilter] = useState<string>("all");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [series, setSeries] = useState<{ mes: string; ingresos: number; usuarios: number }[]>([]);
  const [catDist, setCatDist] = useState<{ name: string; value: number }[]>([]);
  const [listings, setListings] = useState<AdminListingRow[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  // Datos reales de Supabase (con fallback a mock dentro de la capa admin).
  useEffect(() => {
    fetchAdminStats().then(({ data }) => setStats(data));
    fetchGrowthSeries().then(setSeries);
    fetchCategoryDistribution().then(setCatDist);
    fetchAdminListings().then(({ data }) => setListings(data));
    fetchRecentActivity().then(({ data }) => setActivity(data));
  }, []);

  const allCats = useMemo(
    () => Array.from(new Set(listings.map((l) => l.category_id))).filter(Boolean),
    [listings],
  );
  const filteredListings = useMemo(
    () => listings.filter((l) => catFilter === "all" || l.category_id === catFilter),
    [listings, catFilter],
  );
  // KPIs: usan los agregados reales (admin_stats); 0 hasta que carguen.
  const soldCount = stats ? stats.sold_listings : 0;
  const activeCount = stats ? stats.active_listings : 0;
  const notSold = Math.max(0, activeCount - soldCount);

  const kpis = [
    { label: "Avisos publicados", value: activeCount.toLocaleString(), icon: ClipboardList, trend: "+3.2%", accent: "bg-secondary/15 text-secondary" },
    { label: "Vendidos", value: soldCount.toLocaleString(), icon: CheckCircle2, trend: "", accent: "bg-success/15 text-success" },
    { label: "No vendidos", value: notSold.toLocaleString(), icon: XCircle, trend: "", accent: "bg-warning/15 text-warning" },
    { label: "Reportados", value: (stats ? stats.reports_open : 0).toLocaleString(), icon: Flag, trend: "", accent: "bg-destructive/15 text-destructive" },
    { label: "Usuarios", value: (stats ? stats.users : 0).toLocaleString(), icon: Users, trend: "+8.4%", accent: "bg-primary/10 text-primary" },
    { label: "Ingresos (S/)", value: (stats ? stats.revenue : 0).toLocaleString(), icon: DollarSign, trend: "+14.1%", accent: "bg-success/15 text-success" },
  ];

  // Ruta destino del botón "Ver" según el tipo de entidad de la actividad.
  const activityHref = (a: ActivityItem): string | null => {
    switch (a.entityType) {
      case "listing": return a.entityId ? `/aviso/${a.entityId}` : null;
      case "user":    return `/dashboard/${role}/usuarios`;
      case "report":  return `/dashboard/${role}/conversaciones`;
      case "setting": return `/dashboard/${role}/comercial`;
      case "role":    return `/dashboard/superadmin/roles`;
      default:        return null;
    }
  };


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

      {/* Category filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Filtrar por categoría:</span>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {allCats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
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
              <AreaChart data={series}>
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
                <Pie data={catDist} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={3}>
                  {catDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detalle por aviso (vendido / no vendido) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base md:text-lg">Detalle por aviso</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Aviso</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Estado venta</TableHead>
                <TableHead>Comprador</TableHead>
                <TableHead>Vendedor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredListings.slice(0, 10).map((l) => {
                const isSold = l.status === "sold";
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.id.slice(0, 8)}</TableCell>
                    <TableCell className="text-sm font-medium">{l.title}</TableCell>
                    <TableCell><Badge variant="outline">{l.category_id}</Badge></TableCell>
                    <TableCell>
                      {isSold ? (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/30">Vendido</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">No vendido</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">—</TableCell>
                    <TableCell className="text-xs">{l.advertiser || "—"}</TableCell>
                  </TableRow>
                );
              })}
              {filteredListings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    No hay avisos para mostrar.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base md:text-lg">Actividad reciente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {activity.map((a, i) => {
            const href = activityHref(a);
            return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition">
                <div className="w-9 h-9 rounded-full bg-secondary/15 text-secondary flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {(a.who || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">{a.who}</span> {a.action} <span className="text-secondary font-medium">{a.target}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{a.time}</p>
                </div>
                {href && (
                  <button
                    onClick={() => navigate(href)}
                    className="hidden sm:inline-flex"
                    aria-label={`Ver ${a.target}`}
                  >
                    <Badge variant="outline" className="cursor-pointer hover:bg-secondary/10 hover:text-secondary hover:border-secondary/40 transition-colors">Ver</Badge>
                  </button>
                )}
              </div>
            );
          })}
          {activity.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Sin actividad reciente.</p>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default AdminDashboard;
