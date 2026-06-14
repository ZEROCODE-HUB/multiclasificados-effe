import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, Crown } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const roles = [
  {
    name: "Superadministrador",
    users: 2,
    color: "bg-gradient-to-br from-secondary to-primary text-white",
    icon: Crown,
    desc: "Acceso total. Define qué puede hacer cada administrador.",
  },
  {
    name: "Administrador",
    users: 6,
    color: "bg-secondary text-secondary-foreground",
    icon: ShieldCheck,
    desc: "Opera la plataforma según los permisos otorgados por el superadministrador.",
  },
];

const permissions = [
  { module: "Gestión de avisos", view: true, edit: true, approve: true, delete: false },
  { module: "Gestión de usuarios", view: true, edit: true, approve: true, delete: false },
  { module: "Pagos y planes", view: true, edit: false, approve: false, delete: false },
  { module: "Configuración comercial", view: true, edit: true, approve: false, delete: false },
  { module: "Comunicaciones", view: true, edit: true, approve: false, delete: false },
  { module: "Conversaciones reportadas", view: true, edit: true, approve: true, delete: false },
  { module: "Reportes", view: true, edit: false, approve: false, delete: false },
  { module: "Auditoría y logs", view: true, edit: false, approve: false, delete: false },
];

const SuperRoles = () => (
  <AdminLayout role="superadmin" title="Roles y permisos" breadcrumb={["Plataforma", "Roles"]}>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {roles.map((r) => (
        <Card key={r.name}>
          <CardContent className="p-5 flex items-start gap-4">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${r.color}`}>
              <r.icon size={20} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-base">{r.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{r.users} usuarios activos</p>
              <p className="text-sm text-muted-foreground mt-2">{r.desc}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>

    <Card>
      <CardHeader>
        <CardTitle className="text-base md:text-lg">Permisos del rol Administrador</CardTitle>
        <p className="text-xs text-muted-foreground">
          Como Superadministrador, defines qué puede hacer cada administrador en la plataforma.
        </p>
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
          <Button onClick={() => toast({ title: "Permisos actualizados", description: "Los cambios se aplicaron al rol Administrador." })}>
            Guardar cambios
          </Button>
        </div>
      </CardContent>
    </Card>
  </AdminLayout>
);

export default SuperRoles;
