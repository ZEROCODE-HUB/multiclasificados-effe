import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Download } from "lucide-react";
import { auditLogs } from "@/data/adminMockData";

const SuperAudit = () => (
  <AdminLayout role="superadmin" title="Auditoría y logs" breadcrumb={["Plataforma", "Auditoría"]}>
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <CardTitle className="text-base md:text-lg">Historial de acciones críticas</CardTitle>
          <Button size="sm" variant="outline" className="gap-2"><Download size={14} /> Exportar logs</Button>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Filtrar por actor, acción o entidad..." className="pl-9" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Entidad</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{l.id}</TableCell>
                  <TableCell>{l.actor}</TableCell>
                  <TableCell><Badge variant="outline">{l.action}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{l.entity}</TableCell>
                  <TableCell className="font-mono text-xs">{l.ip}</TableCell>
                  <TableCell className="text-muted-foreground">{l.time}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden space-y-3">
          {auditLogs.map((l) => (
            <div key={l.id} className="border rounded-xl p-4 bg-card">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-[10px] font-mono text-muted-foreground">{l.id}</p>
                  <p className="font-semibold text-sm">{l.actor}</p>
                </div>
                <Badge variant="outline">{l.action}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{l.entity}</p>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-2 pt-2 border-t">
                <span className="font-mono">{l.ip}</span>
                <span>{l.time}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  </AdminLayout>
);

export default SuperAudit;
