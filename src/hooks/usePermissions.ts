import { useEffect, useState } from "react";
import { getMyPermissions, type MyPermission } from "@/lib/admin";

export type PermAction = "view" | "edit" | "approve" | "delete";
export type Can = (module: string | undefined, action?: PermAction) => boolean;

// Aplica la matriz de "Roles y permisos" (get_my_permissions).
//   enforce=false  -> acceso total (superadmin: define la matriz, no está sujeto a ella).
//   enforce=true   -> lee los permisos del usuario y decide por (módulo, acción).
//
// Reglas de seguridad para NO dejar a nadie fuera por accidente:
//   - mientras carga            -> permisivo (evita parpadeo/lockout).
//   - módulo sin fila en la BD  -> permisivo (aún no configurado por el superadmin).
export function usePermissions(enforce: boolean): { can: Can; ready: boolean } {
  const [perms, setPerms] = useState<Record<string, MyPermission> | null>(null);

  useEffect(() => {
    if (!enforce) { setPerms(null); return; }
    let active = true;
    getMyPermissions().then((p) => { if (active) setPerms(p); });
    return () => { active = false; };
  }, [enforce]);

  const can: Can = (module, action = "view") => {
    if (!enforce) return true;
    if (!module) return true;
    if (perms === null) return true;        // cargando
    const row = perms[module];
    if (!row) return true;                  // módulo no configurado
    return Boolean(row[`can_${action}` as keyof MyPermission]);
  };

  return { can, ready: !enforce || perms !== null };
}
