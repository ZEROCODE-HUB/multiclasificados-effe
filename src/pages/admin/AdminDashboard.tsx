import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, ClipboardList, CheckCircle2, XCircle, DollarSign, ArrowUpRight, Flag, AlertTriangle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import {
  fetchAdminStats, fetchGrowthSeries, fetchCategoryDistribution,
  fetchAdminListings, fetchRecentActivity, GROWTH_RANGES,
  variacionPct, formatVariacion, STATS_WINDOW_DAYS,
  type AdminStats, type AdminListingRow, type ActivityItem, type GrowthRange,
  contarComprobantesConProblema,
} from "@/lib/admin";
import { auditEntityLabel, lowercaseFirst } from "@/lib/auditLabels";

// Los colores viven en `@/lib/coloresGrafico`: los usa más de un gráfico del
// panel, y exportarlos desde aquí rompería la recarga rápida de Vite.

import { colorDeTrozo } from "@/lib/coloresGrafico";
interface Props { role: AdminRole }

// Fecha completa (la lista solo muestra el tiempo relativo, ej. "hace 2 h").
function fullDate(at: string): string {
  if (!at) return "";
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-PE");
}

const AdminDashboard = ({ role }: Props) => {
  const navigate = useNavigate();
  const [catFilter, setCatFilter] = useState<string>("all");
  const [rangeFilter, setRangeFilter] = useState<GrowthRange>("6m");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [series, setSeries] = useState<{ mes: string; ingresos: number; usuarios: number }[]>([]);
  const [catDist, setCatDist] = useState<{ name: string; value: number }[]>([]);
  // De mayor a menor. Sin esto el donut sale en el orden que devuelva la
  // consulta y hay que recorrer quince líneas para encontrar la categoría
  // grande, que es justo el dato por el que se abre este gráfico. También fija
  // el color de cada trozo: el más grande siempre lleva el azul de la marca.
  const catOrdenadas = useMemo(
    () => [...catDist].sort((a, b) => b.value - a.value),
    [catDist],
  );
  const [listings, setListings] = useState<AdminListingRow[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  // Actividad abierta en el cuadro de detalle (solo lectura).
  const [detail, setDetail] = useState<ActivityItem | null>(null);
  // Comprobantes que se quedaron a medias. El panel comercial ya los enseñaba
  // —con su motivo y su botón de reintentar— pero paginado de 20 en 20: un
  // rechazo de hace tres semanas esta en la pagina 4 y nadie lo ve. Una boleta
  // que SUNAT rechazo y nadie mira es un problema tributario esperando.
  const [porRevisar, setPorRevisar] = useState(0);
  useEffect(() => {
    let vivo = true;
    void contarComprobantesConProblema().then((n) => { if (vivo) setPorRevisar(n); });
    return () => { vivo = false; };
  }, []);

  // Datos reales de Supabase (con fallback a mock dentro de la capa admin).
  useEffect(() => {
    fetchAdminStats().then(({ data }) => setStats(data));
    fetchCategoryDistribution().then(setCatDist);
    fetchAdminListings().then(({ data }) => setListings(data));
    fetchRecentActivity().then(({ data }) => setActivity(data));
  }, []);

  // La serie se recarga al cambiar el rango. El flag descarta la respuesta si
  // el rango cambió otra vez mientras la anterior seguía en vuelo (si no, una
  // respuesta lenta puede pisar a la del rango ya elegido).
  useEffect(() => {
    let cancelled = false;
    fetchGrowthSeries(rangeFilter).then((s) => { if (!cancelled) setSeries(s); });
    return () => { cancelled = true; };
  }, [rangeFilter]);

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

  // Valores de hace 30 días (migración 0097). Con ellos se calcula la variación
  // de cada tarjeta: hasta ahora eran porcentajes escritos a mano que no se
  // movían nunca por más avisos que se publicaran.
  const soldPrev = stats?.sold_listings_prev ?? null;
  const activePrev = stats?.active_listings_prev ?? null;
  const notSoldPrev = activePrev === null || soldPrev === null
    ? null
    : Math.max(0, activePrev - soldPrev);
  const ventana = stats?.window_days ?? STATS_WINDOW_DAYS;

  const kpis = [
    { label: "Avisos publicados", value: activeCount, prev: activePrev, icon: ClipboardList, accent: "bg-secondary/15 text-secondary" },
    { label: "Vendidos", value: soldCount, prev: soldPrev, icon: CheckCircle2, accent: "bg-success/15 text-success" },
    // En estas dos, subir es mala noticia: el color de la variación se invierte
    // para que un aumento de reportes no se pinte en verde.
    { label: "No vendidos", value: notSold, prev: notSoldPrev, icon: XCircle, accent: "bg-warning/15 text-warning", subirEsMalo: true },
    { label: "Reportados", value: stats ? stats.reports_open : 0, prev: stats?.reports_open_prev ?? null, icon: Flag, accent: "bg-destructive/15 text-destructive", subirEsMalo: true },
    { label: "Usuarios", value: stats ? stats.users : 0, prev: stats?.users_prev ?? null, icon: Users, accent: "bg-primary/10 text-primary" },
    { label: "Ingresos (S/)", value: stats ? stats.revenue : 0, prev: stats?.revenue_prev ?? null, icon: DollarSign, accent: "bg-success/15 text-success" },
  ].map((k) => {
    const pct = variacionPct(k.value, k.prev);
    return {
      ...k,
      value: k.value.toLocaleString(),
      pct,
      // Sin variación calculable pero con dato nuevo donde antes no había nada,
      // "nuevo" dice la verdad; "+∞%" no.
      trend: pct === null
        ? (k.prev === 0 && k.value > 0 ? "nuevo" : "")
        : formatVariacion(pct),
      color: pct === null || pct === 0
        ? "text-muted-foreground"
        : (pct > 0) !== !!k.subirEsMalo
          ? "text-success"
          : "text-destructive",
    };
  });

  return (
    <>
      {/* Lo unico que interrumpe: algo se quedo a medias y hay que atenderlo a
          mano. Va ARRIBA DEL TODO y no como una tarjeta mas entre las metricas,
          porque el resto de esta pantalla se mira cuando uno quiere y esto hay
          que verlo aunque no lo estuvieras buscando. */}
      {porRevisar > 0 && (
        <button
          type="button"
          onClick={() => navigate("/dashboard/admin/comercial?atencion=1")}
          className="w-full mb-3 flex items-center gap-3 rounded-2xl border-2 border-warning/50 bg-warning/10
                     px-4 py-3 text-left transition-colors hover:bg-warning/20"
        >
          <AlertTriangle size={18} className="text-warning shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-foreground">
              {porRevisar === 1
                ? "1 comprobante necesita revisión"
                : `${porRevisar} comprobantes necesitan revisión`}
            </span>
            <span className="block text-xs text-muted-foreground">
              SUNAT los rechazó o no salió el correo. Se pueden reintentar desde Comercial.
            </span>
          </span>
          <ArrowUpRight size={16} className="text-warning shrink-0" />
        </button>
      )}

      {/* Greeting */}
      <div className="relative overflow-hidden rounded-2xl gradient-hero text-primary-foreground p-4 md:p-5">
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-secondary/30 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-secondary font-bold mb-0.5">Bienvenido</p>
            <h2 className="text-lg md:text-2xl font-extrabold">Hola, {role === "superadmin" ? "Super Admin" : "Administrador"}</h2>
            <p className="text-primary-foreground/70 text-sm mt-0.5">
              Monitorea la salud de la plataforma en tiempo real.
            </p>
          </div>
          {/* Lleva a la página de Reportes (donde se exporta a PDF/Excel).
              Antes el botón no tenía handler y no hacía nada (IT2-040). */}
          <Button
            variant="hero"
            className="gap-2 self-start sm:self-auto"
            onClick={() => navigate(`/dashboard/${role}/reportes`)}
          >
            <ArrowUpRight size={18} /> Generar reporte
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          {kpis.map((k) => (
            <Card key={k.label} className="border-l-4 border-l-secondary/60 hover:shadow-md transition">
              <CardContent className="p-3 md:p-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${k.accent}`}>
                  <k.icon size={16} />
                </div>
                <p className="text-xl md:text-2xl font-extrabold text-foreground leading-none">{k.value}</p>
                <div className="flex items-center justify-between gap-1 mt-1.5">
                  <p className="text-[11px] text-muted-foreground truncate">{k.label}</p>
                  {/* El color sigue al signo: antes estaba fijo en verde, así que
                      una caída se habría pintado como buena noticia. */}
                  <span
                    className={`text-[10px] font-semibold shrink-0 ${k.color}`}
                    title={k.pct === null ? undefined : `Hace ${ventana} días: ${(k.prev ?? 0).toLocaleString()}`}
                  >
                    {k.trend}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Sin esta línea el porcentaje no dice contra qué se compara. */}
        <p className="text-[11px] text-muted-foreground mt-2">
          La variación compara con hace {ventana} días.
        </p>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base md:text-lg">Ingresos y usuarios</CardTitle>
              <Select value={rangeFilter} onValueChange={(v) => setRangeFilter(v as GrowthRange)}>
                <SelectTrigger className="w-44 h-9" aria-label="Rango del gráfico">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROWTH_RANGES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base md:text-lg">Avisos por categoría</CardTitle>
          </CardHeader>
          {/* La leyenda es NUESTRA, no la de Recharts.
              Con quince categorías de nombres largos, la suya ocupaba dos
              tercios de la tarjeta y dejaba el donut del tamaño de una moneda,
              descolocándose además en cada ancho de pantalla. Y solo decía el
              color: aquí cada categoría lleva su número, que es el dato por el
              que se mira este gráfico. */}
          <CardContent className="p-4 pt-0">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={catOrdenadas} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={3}>
                    {catOrdenadas.map((_, i) => <Cell key={i} fill={colorDeTrozo(i)} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [`${v} aviso${v === 1 ? "" : "s"}`, ""]}
                    contentStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Una columna en móvil y dos en cuanto hay sitio. Con tope de alto
                y scroll propio: así la tarjeta mide lo mismo tenga cinco
                categorías o treinta, y no empuja lo que viene debajo. */}
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 max-h-32 overflow-y-auto pr-1">
              {catOrdenadas.map((c, i) => (
                <li key={c.name} className="flex items-center gap-2 text-xs min-w-0">
                  <span
                    className="w-2.5 h-2.5 shrink-0 rounded-sm"
                    style={{ background: colorDeTrozo(i) }}
                    aria-hidden
                  />
                  {/* `truncate` + `title`: "Equipos y Maquinaria Pesada,
                      Industrial y Herramientas" no cabe en ningún ancho, y
                      partirlo en tres líneas descuadraba la rejilla entera. */}
                  <span className="truncate flex-1 min-w-0 text-muted-foreground" title={c.name}>
                    {c.name}
                  </span>
                  <span className="font-bold tabular-nums shrink-0">{c.value}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Detalle por aviso (vendido / no vendido) — con filtro por categoría */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base md:text-lg">Detalle por aviso</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Categoría:</span>
              <Select value={catFilter} onValueChange={setCatFilter}>
                <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {allCats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
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
          {activity.map((a, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition">
              <div className="w-9 h-9 rounded-full bg-secondary/15 text-secondary flex items-center justify-center text-sm font-bold flex-shrink-0">
                {(a.who || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{a.who}</span> {lowercaseFirst(a.action)} <span className="text-secondary font-medium">{a.target}</span>
                </p>
                <p className="text-xs text-muted-foreground">{a.time}</p>
              </div>
              {/* Solo abre el detalle de la actividad; el admin no entra al panel
                  del usuario ni a la vista pública del aviso. */}
              <button
                onClick={() => setDetail(a)}
                className="hidden sm:inline-flex"
                aria-label={`Ver detalle de la actividad de ${a.who}`}
              >
                <Badge variant="outline" className="cursor-pointer hover:bg-secondary/10 hover:text-secondary hover:border-secondary/40 transition-colors">Ver</Badge>
              </button>
            </div>
          ))}
          {activity.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Sin actividad reciente.</p>
          )}
        </CardContent>
      </Card>

      {/* Detalle de la actividad — solo lectura, sin navegación a otros paneles. */}
      <Dialog open={detail !== null} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle de la actividad</DialogTitle>
            <DialogDescription>Información de solo lectura del registro seleccionado.</DialogDescription>
          </DialogHeader>

          {detail && (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Responsable</dt>
                <dd className="text-foreground font-medium">{detail.who || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Acción</dt>
                <dd className="text-foreground">{detail.action || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Objetivo</dt>
                <dd className="text-foreground break-words">{detail.target || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Fecha</dt>
                <dd className="text-foreground">
                  {fullDate(detail.at) || detail.time || "—"}
                  {fullDate(detail.at) && detail.time && (
                    <span className="text-muted-foreground"> · {detail.time}</span>
                  )}
                </dd>
              </div>
              {detail.entityType && (
                <div>
                  <dt className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Tipo</dt>
                  <dd><Badge variant="outline">{auditEntityLabel(detail.entityType)}</Badge></dd>
                </div>
              )}
              {detail.entityId && (
                <div>
                  <dt className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Identificador</dt>
                  <dd className="font-mono text-xs text-foreground break-all">{detail.entityId}</dd>
                </div>
              )}
            </dl>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetail(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminDashboard;
