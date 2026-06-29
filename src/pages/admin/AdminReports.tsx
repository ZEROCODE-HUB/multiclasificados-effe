import { useEffect, useState } from "react";
import { AdminLayout, AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileSpreadsheet, FileText, Activity } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { toast } from "@/hooks/use-toast";
import { categories } from "@/data/mockData";
import {
  fetchCategoryDistribution, fetchCategoryRevenue, fetchRegionDistribution,
  fetchClaimsSummary, fetchGrowthSeries, type ClaimsSummary,
} from "@/lib/admin";
import { exportRows } from "@/lib/exportReport";

const COLORS = ["hsl(24 95% 53%)", "hsl(220 56% 30%)", "hsl(160 64% 40%)", "hsl(280 65% 55%)", "hsl(40 90% 50%)", "hsl(200 70% 50%)"];

interface Filters { from: string; to: string; cat: string; region: string }

// ===== Filtros reutilizables (controlados) =====
function ReportFilters({ filters, setFilters, regions, onExport }: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  regions: string[];
  onExport: (f: string) => void;
}) {
  const upd = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:items-end justify-between border-b pb-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 flex-1">
        <div>
          <Label className="text-xs">Desde</Label>
          <Input type="date" className="h-9 mt-1" value={filters.from} onChange={(e) => upd("from", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Hasta</Label>
          <Input type="date" className="h-9 mt-1" value={filters.to} onChange={(e) => upd("to", e.target.value)} />
        </div>
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
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onExport("csv")}><FileSpreadsheet size={14} /> CSV</Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onExport("xlsx")}><FileSpreadsheet size={14} /> Excel</Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onExport("pdf")}><FileText size={14} /> PDF</Button>
      </div>
    </div>
  );
}

const AdminReports = ({ role }: { role: AdminRole }) => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [filters, setFilters] = useState<Filters>({ from: "", to: "", cat: "all", region: "all" });

  // ===== Datos reales (se llenan a medida que haya más actividad) =====
  const [allCategory, setAllCategory] = useState<{ cat: string; avisos: number; monto: number }[]>([]);
  const [allRegion, setAllRegion] = useState<{ reg: string; avisos: number; monto: number }[]>([]);
  const [claims, setClaims] = useState<ClaimsSummary>({ recibidos: 0, pendientes: 0, solucionados: 0, trend: [] });
  const [revenueSeries, setRevenueSeries] = useState<{ mes: string; ingresos: number; usuarios: number }[]>([]);

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

  // Nombre de categoría para el id seleccionado en el filtro.
  const selCatName = filters.cat === "all" ? null : categories.find((c) => c.id === filters.cat)?.name ?? null;
  const matchCat = (cat: string) => !selCatName || cat === selCatName;
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
    } else {
      title = `Reporte de ${activeTab}`;
      rows = revenueSeries.map((r) => ({ Mes: r.mes, "Ingresos S/": r.ingresos, "Usuarios nuevos": r.usuarios }));
    }
    exportRows(format, `reporte-${activeTab}`, `${title}${stamp}`, rows);
    toast({ title: "Reporte exportado", description: `${activeTab}.${format}` });
  };

  return (
    <AdminLayout role={role} title="Reportes" breadcrumb={["Operación", "Reportes"]}>
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
            </TabsList>

            {/* DASHBOARD EN TIEMPO REAL */}
            <TabsContent value="dashboard" className="pt-4 space-y-5">
              <ReportFilters filters={filters} setFilters={setFilters} regions={regionNames} onExport={exp} />

              <div className="flex items-center gap-2 text-xs text-success">
                <Activity size={14} /> Indicadores actualizados al minuto
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Gratuitos por categoría */}
                <Card>
                  <CardHeader><CardTitle className="text-sm">Avisos gratuitos por categoría</CardTitle></CardHeader>
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
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="avisos" fill="hsl(24 95% 53%)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="monto" fill="hsl(220 56% 30%)" radius={[4, 4, 0, 0]} name="S/ cobrado" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Gratuitos por región */}
                <Card>
                  <CardHeader><CardTitle className="text-sm">Avisos gratuitos por región</CardTitle></CardHeader>
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
                        <Tooltip />
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
              <ReportFilters filters={filters} setFilters={setFilters} regions={regionNames} onExport={exp} />
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

            {/* Resto de tabs filtrables/exportables */}
            {["pagos", "avisos", "usuarios", "postulaciones"].map((tab) => (
              <TabsContent value={tab} key={tab} className="pt-4 space-y-5">
                <ReportFilters filters={filters} setFilters={setFilters} regions={regionNames} onExport={exp} />
                <Card>
                  <CardHeader><CardTitle className="text-sm capitalize">Reporte de {tab}</CardTitle></CardHeader>
                  <CardContent className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 90%)" />
                        <XAxis dataKey="mes" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="ingresos" fill="hsl(24 95% 53%)" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="usuarios" fill="hsl(220 56% 30%)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <div className="flex justify-end">
                  <Button className="gap-2" onClick={() => exp("xlsx")}><Download size={16} /> Descargar todo</Button>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default AdminReports;
