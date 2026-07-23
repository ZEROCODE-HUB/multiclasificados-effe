import { useEffect, useState } from "react";
import { AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileSpreadsheet, FileText, Activity, Search, ChevronLeft, ChevronRight } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { toast } from "@/hooks/use-toast";
import { useCategories } from "@/hooks/useCategories";
import { usePermissions } from "@/hooks/usePermissions";
import {
  fetchCategoryDistribution, fetchCategoryRevenue, fetchRegionDistribution,
  fetchClaimsSummary, fetchGrowthSeries, fetchAdminCreditTransactions,
  CREDIT_TX_PAGE_SIZE, type ClaimsSummary, type GrowthPoint, type AdminCreditTx,
} from "@/lib/admin";
import { exportRows } from "@/lib/exportReport";
import { formatCredits } from "@/lib/pricing";

const COLORS = ["hsl(24 95% 53%)", "hsl(220 56% 30%)", "hsl(160 64% 40%)", "hsl(280 65% 55%)", "hsl(40 90% 50%)", "hsl(200 70% 50%)"];

// Formato de dinero para tooltips/valores de los reportes: siempre con "S/".
const soles = (v: number | string) => `S/ ${Number(v).toLocaleString("es-PE")}`;

// Cada pestaña de reporte por tipo grafica SU métrica de la serie de crecimiento
// (EFFE-044/059/060). Antes las 4 mostraban ingresos+usuarios (el mismo gráfico).
// `money` marca las que son dinero (se muestran con "S/" en el tooltip).
const SERIES_TABS: { value: string; dataKey: keyof GrowthPoint; barLabel: string; color: string; money?: boolean }[] = [
  { value: "pagos", dataKey: "ingresos", barLabel: "Ingresos (S/)", color: "hsl(24 95% 53%)", money: true },
  { value: "avisos", dataKey: "avisos", barLabel: "Avisos creados", color: "hsl(220 56% 30%)" },
  { value: "usuarios", dataKey: "usuarios", barLabel: "Usuarios nuevos", color: "hsl(160 64% 40%)" },
  { value: "postulaciones", dataKey: "postulaciones", barLabel: "Postulaciones", color: "hsl(280 65% 55%)" },
];

interface Filters { from: string; to: string; cat: string; region: string }

// ===== Filtros reutilizables (controlados) =====
// `show` decide qué controles se muestran, para NO exhibir filtros que no
// aplican a la pestaña (el rango de fechas y categoría/región solo afectan a los
// datos que sí se filtran; en las series globales no se muestran).
function ReportFilters({ filters, setFilters, regions, onExport, show = { dates: true, catRegion: true } }: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  regions: string[];
  onExport: (f: string) => void;
  show?: { dates?: boolean; catRegion?: boolean };
}) {
  const categories = useCategories();
  const upd = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const anyFilter = show.dates || show.catRegion;
  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:items-end justify-between border-b pb-4">
      {anyFilter ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 flex-1">
          {show.dates && (
            <>
              <div>
                <Label className="text-xs">Desde</Label>
                <Input type="date" className="h-9 mt-1" value={filters.from} onChange={(e) => upd("from", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Hasta</Label>
                <Input type="date" className="h-9 mt-1" value={filters.to} onChange={(e) => upd("to", e.target.value)} />
              </div>
            </>
          )}
          {show.catRegion && (
            <>
              <div>
                <Label className="text-xs">Categoría</Label>
                <Select value={filters.cat} onValueChange={(v) => upd("cat", v)}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Región</Label>
                <Select value={filters.region} onValueChange={(v) => upd("region", v)}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {regions.map((r) => <SelectItem key={r} value={r.toLowerCase()}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground flex-1 self-center">Serie global de la plataforma. Usa el <b>Dashboard en tiempo real</b> para filtrar por fecha, categoría o región.</p>
      )}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onExport("csv")}><FileSpreadsheet size={14} /> CSV</Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onExport("xlsx")}><FileSpreadsheet size={14} /> Excel</Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onExport("pdf")}><FileText size={14} /> PDF</Button>
      </div>
    </div>
  );
}

const AdminReports = ({ role }: { role: AdminRole }) => {
  const categories = useCategories();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [filters, setFilters] = useState<Filters>({ from: "", to: "", cat: "all", region: "all" });

  // ===== Datos reales (se llenan a medida que haya más actividad) =====
  const [allCategory, setAllCategory] = useState<{ cat: string; avisos: number; monto: number }[]>([]);
  const [allRegion, setAllRegion] = useState<{ reg: string; avisos: number; monto: number }[]>([]);
  const [claims, setClaims] = useState<ClaimsSummary>({ recibidos: 0, pendientes: 0, solucionados: 0, trend: [] });
  const [revenueSeries, setRevenueSeries] = useState<GrowthPoint[]>([]);

  // Permisos: la pestaña "Transacciones" (dato financiero) exige el toggle
  // 'Reportes'/'edit' (EFFE-054). El superadmin no está sujeto a la matriz.
  const { can } = usePermissions(role === "admin");
  const canTx = can("Reportes", "edit");
  const [txSearch, setTxSearch] = useState("");
  const [txType, setTxType] = useState<"all" | "purchase" | "spend">("all");
  const [txPage, setTxPage] = useState(1);
  const [tx, setTx] = useState<{ data: AdminCreditTx[]; total: number }>({ data: [], total: 0 });
  const [txLoading, setTxLoading] = useState(false);

  // El rango de fechas filtra en el servidor (escalable); categoría/región filtran en el cliente.
  useEffect(() => {
    const range = { from: filters.from || null, to: filters.to || null };
    fetchCategoryRevenue(range).then(setAllCategory);
    fetchRegionDistribution(range).then(setAllRegion);
    fetchClaimsSummary(range).then(setClaims);
  }, [filters.from, filters.to]);

  useEffect(() => {
    fetchGrowthSeries().then(setRevenueSeries);
    // Pre-carga distribución por categoría (no usada directamente, pero deja el RPC "caliente").
    fetchCategoryDistribution().then(() => {});
  }, []);

  // Historial de transacciones: se carga solo al abrir la pestaña y con permiso.
  // Debounce de 300 ms para la búsqueda por usuario.
  useEffect(() => {
    if (activeTab !== "transacciones" || !canTx) return;
    setTxLoading(true);
    const t = setTimeout(() => {
      fetchAdminCreditTransactions({
        search: txSearch || undefined,
        type: txType === "all" ? undefined : txType,
        from: filters.from || undefined,
        to: filters.to || undefined,
        page: txPage,
      }).then(setTx).finally(() => setTxLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [activeTab, canTx, txSearch, txType, filters.from, filters.to, txPage]);

  // Al cambiar la búsqueda, el tipo o las fechas, vuelve a la primera página.
  useEffect(() => { setTxPage(1); }, [txSearch, txType, filters.from, filters.to]);

  // Coincidencia de categoría robusta: acepta que el backend devuelva el NOMBRE
  // o el id/slug, sin distinguir mayúsculas/acentos de más.
  const matchCat = (cat: string) => {
    if (filters.cat === "all") return true;
    const name = categories.find((c) => c.id === filters.cat)?.name ?? filters.cat;
    const target = cat.trim().toLowerCase();
    return target === name.trim().toLowerCase() || target === filters.cat.trim().toLowerCase();
  };
  const matchRegion = (reg: string) => filters.region === "all" || reg.toLowerCase() === filters.region;

  // Arrays filtrados (categoría/región) que alimentan los gráficos, respetando el diseño.
  const visibilityByCategory = allCategory.filter((r) => matchCat(r.cat));
  const freeByCategory = visibilityByCategory.map((r) => ({ cat: r.cat, value: r.avisos }));
  const visibilityByRegion = allRegion.filter((r) => matchRegion(r.reg));
  const freeByRegion = visibilityByRegion.map((r) => ({ reg: r.reg, value: r.avisos }));
  const claimsTrend = claims.trend;
  const regionNames = allRegion.map((r) => r.reg);

  // Exportación: arma las filas según la pestaña activa y descarga en el formato elegido.
  const exp = (format: string) => {
    const stamp = filters.from || filters.to ? ` (${filters.from || "inicio"} a ${filters.to || "hoy"})` : "";
    let rows: Record<string, string | number>[] = [];
    let title = "Reporte";
    if (activeTab === "dashboard") {
      title = "Avisos por categoría";
      rows = visibilityByCategory.map((r) => ({ Categoría: r.cat, Avisos: r.avisos, "Monto S/": Number(r.monto.toFixed(2)) }));
    } else if (activeTab === "reclamos") {
      title = "Reclamos";
      rows = [
        { Indicador: "Recibidos", Valor: claims.recibidos },
        { Indicador: "Pendientes", Valor: claims.pendientes },
        { Indicador: "Solucionados", Valor: claims.solucionados },
        ...claimsTrend.map((t) => ({ Indicador: `Mes ${t.mes}`, Valor: `${t.recibidos} recibidos / ${t.solucionados} resueltos` })),
      ];
    } else if (activeTab === "transacciones") {
      title = "Transacciones de crédito";
      rows = tx.data.map((r) => ({
        Usuario: r.full_name,
        Correo: r.email,
        Tipo: r.type === "purchase" ? "Compra" : "Gasto",
        "Monto (S/)": `${r.credits >= 0 ? "+" : "−"}${formatCredits(Math.abs(r.credits))}`,
        Detalle: r.description ?? (r.listing_title ? `Aviso: ${r.listing_title}` : ""),
        Fecha: r.created_at.slice(0, 19).replace("T", " "),
      }));
    } else {
      const cfg = SERIES_TABS.find((x) => x.value === activeTab);
      title = `Reporte de ${activeTab}`;
      rows = revenueSeries.map((r) => ({ Mes: r.mes, [cfg?.barLabel ?? "Valor"]: cfg ? Number(r[cfg.dataKey]) : 0 }));
    }
    try {
      // Las transacciones tienen muchas columnas → PDF apaisado (no se truncan).
      exportRows(format, `reporte-${activeTab}`, `${title}${stamp}`, rows, { landscape: activeTab === "transacciones" });
    } catch {
      toast({ title: "No se pudo exportar el reporte", variant: "destructive" });
      return;
    }
    toast({ title: "Reporte exportado", description: `${activeTab}.${format}` });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base md:text-lg">Generación de reportes</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="dashboard" onValueChange={setActiveTab}>
            <TabsList className="w-full overflow-x-auto justify-start no-scrollbar">
              <TabsTrigger value="dashboard">Dashboard en tiempo real</TabsTrigger>
              <TabsTrigger value="reclamos">Reclamos</TabsTrigger>
              <TabsTrigger value="pagos">Pagos</TabsTrigger>
              <TabsTrigger value="avisos">Avisos</TabsTrigger>
              <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
              <TabsTrigger value="postulaciones">Postulaciones</TabsTrigger>
              {canTx && <TabsTrigger value="transacciones">Transacciones</TabsTrigger>}
            </TabsList>

            {/* DASHBOARD EN TIEMPO REAL */}
            <TabsContent value="dashboard" className="pt-4 space-y-5">
              <ReportFilters filters={filters} setFilters={setFilters} regions={regionNames} onExport={exp} show={{ dates: true, catRegion: true }} />

              <div className="flex items-center gap-2 text-xs text-success">
                <Activity size={14} /> Indicadores actualizados al minuto
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Gratuitos por categoría */}
                <Card>
                  <CardHeader><CardTitle className="text-sm">Avisos por categoría</CardTitle></CardHeader>
                  <CardContent className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={freeByCategory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 90%)" />
                        <XAxis dataKey="cat" fontSize={11} />
                        <YAxis fontSize={11} />
                        <Tooltip />
                        <Bar dataKey="value" fill="hsl(220 56% 30%)" name="Avisos" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Con visibilidad por categoría + importes */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Avisos con visibilidad por categoría</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Total cobrado: <b className="text-secondary">S/ {visibilityByCategory.reduce((a, b) => a + b.monto, 0).toLocaleString()}</b>
                    </p>
                  </CardHeader>
                  <CardContent className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={visibilityByCategory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 90%)" />
                        <XAxis dataKey="cat" fontSize={11} />
                        <YAxis fontSize={11} />
                        <Tooltip formatter={(value, name) => (name === "S/ cobrado" ? [soles(value as number), name] : [value, name])} />
                        <Legend />
                        <Bar dataKey="avisos" fill="hsl(24 95% 53%)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="monto" fill="hsl(220 56% 30%)" radius={[4, 4, 0, 0]} name="S/ cobrado" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Gratuitos por región */}
                <Card>
                  <CardHeader><CardTitle className="text-sm">Avisos por región</CardTitle></CardHeader>
                  <CardContent className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={freeByRegion} dataKey="value" nameKey="reg" outerRadius={90} label>
                          {freeByRegion.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Con visibilidad por región + importes */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Avisos con visibilidad por región</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Total cobrado: <b className="text-secondary">S/ {visibilityByRegion.reduce((a, b) => a + b.monto, 0).toLocaleString()}</b>
                    </p>
                  </CardHeader>
                  <CardContent className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={visibilityByRegion} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 90%)" />
                        <XAxis type="number" fontSize={11} />
                        <YAxis dataKey="reg" type="category" fontSize={11} width={80} />
                        <Tooltip formatter={(value, name) => (name === "S/ cobrado" ? [soles(value as number), name] : [value, name])} />
                        <Legend />
                        <Bar dataKey="avisos" fill="hsl(24 95% 53%)" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="monto" fill="hsl(220 56% 30%)" radius={[0, 4, 4, 0]} name="S/ cobrado" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* RECLAMOS */}
            <TabsContent value="reclamos" className="pt-4 space-y-5">
              <ReportFilters filters={filters} setFilters={setFilters} regions={regionNames} onExport={exp} show={{ dates: true, catRegion: false }} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Recibidos</p><p className="text-3xl font-extrabold">{claims.recibidos}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Pendientes de solución</p><p className="text-3xl font-extrabold text-warning">{claims.pendientes}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Solucionados con conformidad</p><p className="text-3xl font-extrabold text-success">{claims.solucionados}</p></CardContent></Card>
              </div>
              <Card>
                <CardHeader><CardTitle className="text-sm">Tendencia de reclamos</CardTitle></CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={claimsTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 90%)" />
                      <XAxis dataKey="mes" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="recibidos" fill="hsl(0 70% 55%)" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="solucionados" fill="hsl(160 64% 40%)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Un reporte por tipo, cada uno con SU métrica real (EFFE-044/059/060). */}
            {SERIES_TABS.map((t) => (
              <TabsContent value={t.value} key={t.value} className="pt-4 space-y-5">
                <ReportFilters filters={filters} setFilters={setFilters} regions={regionNames} onExport={exp} show={{ dates: false, catRegion: false }} />
                <Card>
                  <CardHeader><CardTitle className="text-sm">{t.barLabel} por período</CardTitle></CardHeader>
                  <CardContent className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 90%)" />
                        <XAxis dataKey="mes" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip formatter={t.money ? ((value) => soles(value as number)) : undefined} />
                        <Legend />
                        <Bar dataKey={t.dataKey} name={t.barLabel} fill={t.color} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <div className="flex justify-end">
                  <Button className="gap-2" onClick={() => exp("xlsx")}><Download size={16} /> Descargar todo</Button>
                </div>
              </TabsContent>
            ))}

            {/* Historial de transacciones de crédito (EFFE-054). Solo con el
                permiso 'Reportes'/'edit' (dato financiero). */}
            {canTx && (
              <TabsContent value="transacciones" className="pt-4 space-y-4">
                <ReportFilters filters={filters} setFilters={setFilters} regions={regionNames} onExport={exp} show={{ dates: true, catRegion: false }} />
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center bg-muted/50 border border-border h-9 flex-1 min-w-[180px] max-w-sm">
                    <Search size={14} className="ml-3 text-muted-foreground shrink-0" />
                    <input
                      value={txSearch}
                      onChange={(e) => setTxSearch(e.target.value)}
                      placeholder="Buscar por usuario o correo…"
                      className="flex-1 min-w-0 bg-transparent px-2 text-sm outline-none"
                    />
                  </div>
                  <Select value={txType} onValueChange={(v) => setTxType(v as "all" | "purchase" | "spend")}>
                    <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los tipos</SelectItem>
                      <SelectItem value="purchase">Compras</SelectItem>
                      <SelectItem value="spend">Gastos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                          <th className="px-4 py-2.5 font-semibold">Usuario</th>
                          <th className="px-4 py-2.5 font-semibold">Tipo</th>
                          <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Monto (S/)</th>
                          <th className="px-4 py-2.5 font-semibold">Descripción</th>
                          <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Fecha</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {txLoading ? (
                          <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Cargando…</td></tr>
                        ) : tx.data.length === 0 ? (
                          <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No hay transacciones con estos filtros.</td></tr>
                        ) : (
                          tx.data.map((r) => (
                            <tr key={r.id} className="hover:bg-muted/30">
                              <td className="px-4 py-2.5">
                                <p className="font-medium text-foreground">{r.full_name}</p>
                                <p className="text-[11px] text-muted-foreground">{r.email}</p>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${r.type === "purchase" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                                  {r.type === "purchase" ? "Compra" : "Gasto"}
                                </span>
                              </td>
                              <td className={`px-4 py-2.5 text-right font-bold tabular-nums whitespace-nowrap ${r.credits >= 0 ? "text-success" : "text-destructive"}`}>
                                {r.credits >= 0 ? "+" : "−"}{formatCredits(Math.abs(r.credits))}
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground max-w-[280px] truncate" title={r.description ?? undefined}>
                                {r.description ?? (r.listing_title ? `Aviso: ${r.listing_title}` : "—")}
                              </td>
                              <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                                {new Date(r.created_at).toLocaleString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
                {tx.total > CREDIT_TX_PAGE_SIZE && (
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-xs text-muted-foreground">
                      {tx.total.toLocaleString()} transacciones · página {txPage} de {Math.max(1, Math.ceil(tx.total / CREDIT_TX_PAGE_SIZE))}
                    </p>
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" className="gap-1" disabled={txPage <= 1} onClick={() => setTxPage((p) => Math.max(1, p - 1))}>
                        <ChevronLeft size={14} /> Anterior
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1" disabled={txPage >= Math.ceil(tx.total / CREDIT_TX_PAGE_SIZE)} onClick={() => setTxPage((p) => p + 1)}>
                        Siguiente <ChevronRight size={14} />
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
};

export default AdminReports;
