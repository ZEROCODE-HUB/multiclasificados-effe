import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Crown, Gavel, LifeBuoy, Check, Info } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchRoleCounts, fetchRolePermissions, setRolePermission, type RolePermission } from "@/lib/admin";
import { MATRIX_MODULES, actionsFor, capabilitiesFor, type PermAction } from "@/lib/permissions";

const roleCards = [
  { key: "superadmin", name: "Superadministrador", color: "bg-gradient-to-br from-secondary to-primary text-white", icon: Crown, desc: "Acceso total. Define qué puede hacer cada rol." },
  { key: "admin", name: "Administrador", color: "bg-secondary text-secondary-foreground", icon: ShieldCheck, desc: "Opera la plataforma según los permisos otorgados." },
  { key: "moderador", name: "Moderador", color: "bg-warning/80 text-white", icon: Gavel, desc: "Revisa reclamos y modera contenido y usuarios." },
  { key: "soporte", name: "Soporte", color: "bg-primary/80 text-white", icon: LifeBuoy, desc: "Atiende consultas y gestiona casos de usuarios." },
];

const emptyRow = (role: string, module: string): RolePermission => ({
  role, module, can_view: false, can_edit: false, can_approve: false, can_delete: false,
});

const SuperRoles = () => {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [allPerms, setAllPerms] = useState<RolePermission[]>([]);
  const [editRole, setEditRole] = useState("admin");
  // Borrador del rol en edición: una fila por módulo, indexado por id de módulo.
  const [draft, setDraft] = useState<Record<string, RolePermission>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRoleCounts().then(setCounts);
    fetchRolePermissions().then(({ data }) => setAllPerms(data));
  }, []);

  // Reconstruye el borrador desde las filas reales de la BD (o filas vacías).
  useEffect(() => {
    const byModule: Record<string, RolePermission> = {};
    for (const m of MATRIX_MODULES) {
      const existing = allPerms.find((p) => p.role === editRole && p.module === m.id);
      byModule[m.id] = existing ? { ...existing } : emptyRow(editRole, m.id);
    }
    setDraft(byModule);
  }, [allPerms, editRole]);

  const toggle = (moduleId: string, action: PermAction) =>
    setDraft((d) => {
      const row = d[moduleId];
      const key = `can_${action}` as keyof RolePermission;
      return { ...d, [moduleId]: { ...row, [key]: !(row[key] as boolean) } };
    });

  const caps = useMemo(() => capabilitiesFor(draft), [draft]);
  const roleName = roleCards.find((r) => r.key === editRole)?.name ?? editRole;

  const save = async () => {
    setSaving(true);
    try {
      // Guarda solo las acciones declaradas por módulo; el resto se fuerza a false
      // (los módulos de "acceso" solo usan `view`).
      const rows: RolePermission[] = MATRIX_MODULES.map((m) => {
        const keys = new Set(actionsFor(m.id).map((a) => a.key));
        const d = draft[m.id];
        return {
          role: editRole, module: m.id,
          can_view: keys.has("view") && d.can_view,
          can_edit: keys.has("edit") && d.can_edit,
          can_approve: keys.has("approve") && d.can_approve,
          can_delete: keys.has("delete") && d.can_delete,
        };
      });
      await Promise.all(rows.map(setRolePermission));
      setAllPerms((prev) => [...prev.filter((p) => p.role !== editRole), ...rows]);
      toast({ title: "Permisos actualizados", description: `Cambios aplicados al rol ${roleName}.` });
    } catch (e) {
      toast({ title: "No se pudo guardar", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
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
              <CardTitle className="text-base md:text-lg">Permisos del rol</CardTitle>
              <p className="text-xs text-muted-foreground">
                Elige un rol y activa lo que puede hacer. Cada permiso indica exactamente qué desbloquea.
                El <b>Superadministrador</b> siempre tiene acceso total.
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
        <CardContent className="space-y-4">
          {/* Resumen en vivo de lo que el rol podrá hacer */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Info size={13} /> El rol {roleName} podrá:
            </p>
            {caps.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-2">
                Nada aún. Sin permisos, este rol no verá ninguna sección del panel.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {caps.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs bg-secondary/15 text-secondary border border-secondary/25 rounded-full px-2 py-0.5">
                    <Check size={11} /> {c.module}: {c.action}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Secciones por módulo */}
          <div className="space-y-3">
            {MATRIX_MODULES.map((m) => {
              const row = draft[m.id];
              if (!row) return null;
              return (
                <div key={m.id} className="rounded-lg border p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                      <m.icon size={17} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">{m.label}</p>
                      <p className="text-xs text-muted-foreground">{m.description}</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2 sm:pl-12">
                    {m.actions.map((a) => (
                      <label key={a.key} className="flex items-start justify-between gap-4 cursor-pointer py-1">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{a.label}</p>
                          <p className="text-xs text-muted-foreground">{a.description}</p>
                        </div>
                        <Switch
                          className="mt-0.5 shrink-0"
                          checked={Boolean(row[`can_${a.key}` as keyof RolePermission])}
                          onCheckedChange={() => toggle(m.id, a.key)}
                          aria-label={`${m.label}: ${a.label}`}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default SuperRoles;
