import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, ShieldCheck } from "lucide-react";

const roles = [
  { name: "Super Admin", users: 2, color: "bg-gradient-to-br from-secondary to-primary text-white" },
  { name: "Administrador", users: 6, color: "bg-secondary text-secondary-foreground" },
  { name: "Moderador", users: 14, color: "bg-primary text-primary-foreground" },
  { name: "Soporte", users: 8, color: "bg-accent text-accent-foreground" },
];

const permissions = [
  { module: "Avisos", view: true, edit: true, approve: true, delete: true },
  { module: "Usuarios", view: true, edit: true, approve: true, delete: true },
  { module: "Pagos", view: true, edit: true, approve: false, delete: false },
  { module: "Configuración", view: true, edit: false, approve: false, delete: false },
  { module: "Auditoría", view: true, edit: false, approve: false, delete: false },
];

const SuperRoles = () => (
  <AdminLayout role="superadmin" title="Roles y permisos" breadcrumb={["Plataforma", "Roles"]}>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {roles.map((r) => (
        <Card key={r.name} className="card-lift">
          <CardContent className="p-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${r.color}`}>
              <ShieldCheck size={18} />
            </div>
            <p className="font-semibold text-sm">{r.name}</p>
            <p className="text-xs text-muted-foreground">{r.users} usuarios</p>
          </CardContent>
        </Card>
      ))}
    </div>

    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base md:text-lg">Matriz de permisos · Moderador</CardTitle>
        <Button size="sm" className="gap-2"><Plus size={14} /> Crear rol</Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Módulo</TableHead>
                <TableHead className="text-center">Ver</TableHead>
                <TableHead className="text-center">Editar</TableHead>
                <TableHead className="text-center">Aprobar</TableHead>
                <TableHead className="text-center">Eliminar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {permissions.map((p) => (
                <TableRow key={p.module}>
                  <TableCell className="font-medium">{p.module}</TableCell>
                  <TableCell className="text-center"><Checkbox defaultChecked={p.view} /></TableCell>
                  <TableCell className="text-center"><Checkbox defaultChecked={p.edit} /></TableCell>
                  <TableCell className="text-center"><Checkbox defaultChecked={p.approve} /></TableCell>
                  <TableCell className="text-center"><Checkbox defaultChecked={p.delete} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex justify-end mt-4">
          <Button>Guardar cambios</Button>
        </div>
      </CardContent>
    </Card>
  </AdminLayout>
);

export default SuperRoles;
