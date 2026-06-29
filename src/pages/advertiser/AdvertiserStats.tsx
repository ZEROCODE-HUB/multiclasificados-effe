import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, MousePointerClick, MessageSquare, Users } from "lucide-react";
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
import { fetchAdvertiserStats, type AdvertiserStatsData } from "@/lib/stats";
import { LoadingState } from "@/components/LoadingState";

const fmtDay = (iso: string) => {
  // "2026-06-24" -> "24 jun"
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
};

const AdvertiserStats = () => {
  const [data, setData] = useState<AdvertiserStatsData | null>(null);

  useEffect(() => {
    fetchAdvertiserStats().then(setData);
  }, []);

  const t = data?.totals ?? { views: 0, contacts: 0, messages: 0, applications: 0 };

  const statCards = [
    { label: "Vistas totales", value: t.views, icon: Eye, color: "text-primary", bg: "bg-primary/10" },
    { label: "Clics en contacto", value: t.contacts, icon: MousePointerClick, color: "text-secondary", bg: "bg-secondary/10" },
    { label: "Mensajes recibidos", value: t.messages, icon: MessageSquare, color: "text-success", bg: "bg-success/10" },
    { label: "Postulaciones", value: t.applications, icon: Users, color: "text-warning", bg: "bg-warning/10" },
  ];

  const trendData = useMemo(
    () => (data?.trend ?? []).map((d) => ({ day: fmtDay(d.day), vistas: d.vistas, contactos: d.contactos })),
    [data],
  );

  const barData = useMemo(
    () =>
      (data?.listings ?? []).map((l) => ({
        name: l.title.length > 16 ? l.title.slice(0, 14) + "…" : l.title,
        Vistas: l.views,
        Contactos: l.contacts,
      })),
    [data],
  );

  const tableRows = useMemo(
    () =>
      (data?.listings ?? []).map((l) => ({
        title: l.title,
        views: l.views,
        contacts: l.contacts,
        conversion: l.views > 0 ? `${((l.contacts / l.views) * 100).toFixed(1)}%` : "—",
      })),
    [data],
  );

  const loading = data === null;
  const noData = !loading && t.views === 0 && t.contacts === 0 && (data?.listings.length ?? 0) === 0;

  return (
    <DashboardLayout role="anunciante">
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Estadísticas</h1>
          <p className="text-muted-foreground">Rendimiento de tus avisos en los últimos 30 días.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {statCards.map((stat) => (
            <Card key={stat.label} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${stat.bg} ${stat.color}`}>
                    <stat.icon size={18} />
                  </div>
                </div>
                <p className="text-2xl font-extrabold text-foreground leading-none">
                  {loading ? "…" : stat.value.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {loading ? (
          <Card>
            <CardContent className="p-0">
              <LoadingState label="Cargando estadísticas…" />
            </CardContent>
          </Card>
        ) : noData ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              Aún no hay actividad en tus avisos. Cuando reciban vistas y contactos, verás aquí sus estadísticas.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tendencia de vistas y contactos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  {trendData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      Sin actividad en los últimos 30 días.
                    </div>
                  ) : (
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
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                        />
                        <Area type="monotone" dataKey="vistas" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorVistas)" strokeWidth={2} />
                        <Area type="monotone" dataKey="contactos" stroke="hsl(var(--secondary))" fillOpacity={1} fill="url(#colorContactos)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Comparativa por aviso</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  {barData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      Sin avisos con actividad todavía.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Vistas" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="Contactos" fill="hsl(var(--secondary))" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
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
                      {tableRows.map((l, i) => (
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
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdvertiserStats;
