import { AdminLayout, AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { revenueSeries } from "@/data/adminMockData";
import { toast } from "@/hooks/use-toast";

const AdminReports = ({ role }: { role: AdminRole }) => {
  const exp = (f: string) => toast({ title: "Exportando reporte", description: f });
  return (
    <AdminLayout role={role} title="Reportes" breadcrumb={["Operación", "Reportes"]}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base md:text-lg">Generación de reportes</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="usuarios">
            <TabsList className="w-full overflow-x-auto justify-start no-scrollbar">
              <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
              <TabsTrigger value="avisos">Avisos</TabsTrigger>
              <TabsTrigger value="pagos">Pagos</TabsTrigger>
              <TabsTrigger value="postulaciones">Postulaciones</TabsTrigger>
            </TabsList>

            {["usuarios", "avisos", "pagos", "postulaciones"].map((tab) => (
              <TabsContent value={tab} key={tab} className="pt-4 space-y-4">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 90%)" />
                      <XAxis dataKey="mes" fontSize={12} stroke="hsl(220 10% 46%)" />
                      <YAxis fontSize={12} stroke="hsl(220 10% 46%)" />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="ingresos" fill="hsl(24 95% 53%)" radius={[6,6,0,0]} />
                      <Bar dataKey="usuarios" fill="hsl(220 56% 30%)" radius={[6,6,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button variant="outline" className="gap-2" onClick={() => exp(`${tab}.csv`)}><FileSpreadsheet size={16} /> Exportar CSV</Button>
                  <Button variant="outline" className="gap-2" onClick={() => exp(`${tab}.xlsx`)}><FileSpreadsheet size={16} /> Exportar Excel</Button>
                  <Button variant="outline" className="gap-2" onClick={() => exp(`${tab}.pdf`)}><FileText size={16} /> Exportar PDF</Button>
                  <Button className="gap-2 sm:ml-auto" onClick={() => exp(tab)}><Download size={16} /> Descargar todo</Button>
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
