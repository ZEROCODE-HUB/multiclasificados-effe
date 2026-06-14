import { useState } from "react";
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
import { revenueSeries } from "@/data/adminMockData";
import { toast } from "@/hooks/use-toast";

// ===== Datos mock dashboard tiempo real =====
const freeByCategory = [
  { cat: "Inmuebles", value: 320 },
  { cat: "Vehículos", value: 245 },
  { cat: "Empleos", value: 410 },
  { cat: "Tecnología", value: 180 },
  { cat: "Servicios", value: 290 },
  { cat: "Educación", value: 120 },
];

const visibilityByCategory = [
  { cat: "Inmuebles", avisos: 142, monto: 21300 },
  { cat: "Vehículos", avisos: 98, monto: 14700 },
  { cat: "Empleos", avisos: 76, monto: 9120 },
  { cat: "Tecnología", avisos: 64, monto: 7680 },
  { cat: "Servicios", avisos: 51, monto: 6120 },
];

const freeByRegion = [
  { reg: "Lima", value: 720 },
  { reg: "Arequipa", value: 210 },
  { reg: "Trujillo", value: 178 },
  { reg: "Cusco", value: 140 },
  { reg: "Piura", value: 122 },
  { reg: "Chiclayo", value: 95 },
];

const visibilityByRegion = [
  { reg: "Lima", avisos: 240, monto: 38400 },
  { reg: "Arequipa", avisos: 82, monto: 12300 },
  { reg: "Trujillo", avisos: 64, monto: 9600 },
  { reg: "Cusco", avisos: 51, monto: 7650 },
  { reg: "Piura", avisos: 38, monto: 5700 },
];

const claims = { recibidos: 142, pendientes: 38, solucionados: 96 };
const claimsTrend = [
  { mes: "Ene", recibidos: 18, solucionados: 14 },
  { mes: "Feb", recibidos: 22, solucionados: 19 },
  { mes: "Mar", recibidos: 28, solucionados: 24 },
  { mes: "Abr", recibidos: 25, solucionados: 21 },
  { mes: "May", recibidos: 24, solucionados: 18 },
];

const COLORS = ["hsl(24 95% 53%)", "hsl(220 56% 30%)", "hsl(160 64% 40%)", "hsl(280 65% 55%)", "hsl(40 90% 50%)", "hsl(200 70% 50%)"];

// ===== Filtros reutilizables =====
function ReportFilters({ onExport }: { onExport: (f: string) => void }) {
  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:items-end justify-between border-b pb-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 flex-1">
        <div>
          <Label className="text-xs">Desde</Label>
          <Input type="date" className="h-9 mt-1" />
        </div>
        <div>
          <Label className="text-xs">Hasta</Label>
          <Input type="date" className="h-9 mt-1" />
        </div>
        <div>
          <Label className="text-xs">Categoría</Label>
          <Select defaultValue="all">
            <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="inmuebles">Inmuebles</SelectItem>
              <SelectItem value="vehiculos">Vehículos</SelectItem>
              <SelectItem value="empleos">Empleos</SelectItem>
              <SelectItem value="tecnologia">Tecnología</SelectItem>
              <SelectItem value="servicios">Servicios</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Región</Label>
          <Select defaultValue="all">
            <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="lima">Lima</SelectItem>
              <SelectItem value="arequipa">Arequipa</SelectItem>
              <SelectItem value="trujillo">Trujillo</SelectItem>
              <SelectItem value="cusco">Cusco</SelectItem>
              <SelectItem value="piura">Piura</SelectItem>
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
  const exp = (f: string) => toast({ title: "Exportando reporte", description: f });
  const [, setTick] = useState(0);

  return (
    <AdminLayout role={role} title="Reportes" breadcrumb={["Operación", "Reportes"]}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base md:text-lg">Generación de reportes</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="dashboard" onValueChange={() => setTick((t) => t + 1)}>
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
              <ReportFilters onExport={exp} />

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
              <ReportFilters onExport={exp} />
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
                <ReportFilters onExport={(f) => exp(`${tab}.${f}`)} />
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
                  <Button className="gap-2" onClick={() => exp(tab)}><Download size={16} /> Descargar todo</Button>
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
