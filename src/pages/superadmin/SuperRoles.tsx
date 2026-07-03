import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, Crown, Gavel, LifeBuoy } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchRoleCounts, fetchRolePermissions, setRolePermission, type RolePermission } from "@/lib/admin";

const roleCards = [
  { key: "superadmin", name: "Superadministrador", color: "bg-gradient-to-br from-secondary to-primary text-white", icon: Crown, desc: "Acceso total. Define qué puede hacer cada rol." },
  { key: "admin", name: "Administrador", color: "bg-secondary text-secondary-foreground", icon: ShieldCheck, desc: "Opera la plataforma según los permisos otorgados." },
  { key: "moderador", name: "Moderador", color: "bg-warning/80 text-white", icon: Gavel, desc: "Revisa denuncias y modera contenido y usuarios." },
  { key: "soporte", name: "Soporte", color: "bg-primary/80 text-white", icon: LifeBuoy, desc: "Atiende consultas y gestiona casos de usuarios." },
];

// Módulos por defecto (se usan cuando aún no hay filas en la BD para el rol).
const MODULES = [
  "Gestión de avisos", "Gestión de usuarios", "Pagos y planes", "Configuración comercial",
  "Comunicaciones", "Conversaciones reportadas", "Reportes", "Auditoría y logs",
];
const defaultPerm = (role: string, module: string): RolePermission => ({
  role, module, can_view: true, can_edit: role !== "soporte", can_approve: role === "admin" || role === "moderador", can_delete: false,
});

const SuperRoles = () => {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [allPerms, setAllPerms] = useState<RolePermission[]>([]);
  const [editRole, setEditRole] = useState("admin");
  const [draft, setDraft] = useState<RolePermission[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRoleCounts().then(setCounts);
    fetchRolePermissions().then(({ data }) => setAllPerms(data));
  }, []);

  // Matriz del rol seleccionado: usa las filas reales o cae a un default por módulo.
  const rolePerms = useMemo(() => {
    const existing = allPerms.filter((p) => p.role === editRole);
    return MODULES.map(
      (m) => existing.find((p) => p.module === m) ?? defaultPerm(editRole, m),
    );
  }, [allPerms, editRole]);

  useEffect(() => { setDraft(rolePerms); }, [rolePerms]);

  const toggle = (module: string, field: keyof RolePermission) =>
    setDraft((d) => d.map((p) => (p.module === module ? { ...p, [field]: !p[field as keyof RolePermission] } : p)));

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all(draft.map((p) => setRolePermission(p)));
      // Refresca el cache local con lo guardado.
      setAllPerms((prev) => [...prev.filter((p) => p.role !== editRole), ...draft]);
      toast({ title: "Permisos actualizados", description: `Cambios aplicados al rol ${editRole}.` });
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e?.message ?? "Error", variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roleCards.map((r) => (
          <Card key={r.key}>
            <CardContent className="p-5 flex items-start gap-4">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${r.color}`}>
                <r.icon size={20} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-base">{r.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{counts[r.key] ?? 0} usuarios activos</p>
                <p className="text-sm text-muted-foreground mt-2">{r.desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base md:text-lg">Matriz de permisos</CardTitle>
              <p className="text-xs text-muted-foreground">
                Como Superadministrador, defines qué puede hacer cada rol en la plataforma.
              </p>
            </div>
            <Select value={editRole} onValueChange={setEditRole}>
              <SelectTrigger className="md:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="moderador">Moderador</SelectItem>
                <SelectItem value="soporte">Soporte</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
                {draft.map((p) => (
                  <TableRow key={p.module}>
                    <TableCell className="font-medium">{p.module}</TableCell>
                    <TableCell className="text-center"><Checkbox checked={p.can_view} onCheckedChange={() => toggle(p.module, "can_view")} /></TableCell>
                    <TableCell className="text-center"><Checkbox checked={p.can_edit} onCheckedChange={() => toggle(p.module, "can_edit")} /></TableCell>
                    <TableCell className="text-center"><Checkbox checked={p.can_approve} onCheckedChange={() => toggle(p.module, "can_approve")} /></TableCell>
                    <TableCell className="text-center"><Checkbox checked={p.can_delete} onCheckedChange={() => toggle(p.module, "can_delete")} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={save} disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default SuperRoles;
