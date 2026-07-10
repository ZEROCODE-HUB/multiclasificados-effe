// Traducción al español de los registros técnicos de `audit_logs`.
// Fuente única para la pantalla "Auditoría y registros" y para "Actividad
// reciente" del dashboard: la misma acción debe leerse igual en toda la
// plataforma.

// Acciones que registra `log_audit(...)` en las migraciones y en la Edge
// Function `admin-reset-password`.
const ACTION_LABELS: Record<string, string> = {
  delete_user: "Eliminó usuario",
  set_user_status: "Cambió estado del usuario",
  verify_user: "Verificó usuario",
  reset_password: "Restableció contraseña",
  set_user_role: "Cambió rol del usuario",
  assign_role: "Asignó rol",
  remove_role: "Quitó rol",
  set_role_permission: "Cambió permisos del rol",
  set_listing_status: "Cambió estado del aviso",
  toggle_featured: "Cambió aviso destacado",
  assign_report: "Asignó reporte",
  resolve_report: "Resolvió reporte",
  set_setting: "Cambió configuración",
  send_message: "Envió mensaje",
  broadcast: "Envió comunicado masivo",
  grant_credits: "Otorgó créditos",
};

const ENTITY_LABELS: Record<string, string> = {
  user: "Usuario",
  listing: "Aviso",
  report: "Reporte",
  role: "Rol",
  setting: "Configuración",
  audience: "Audiencia",
};

// Segmento de un comunicado masivo (`entity_type = 'audience'`).
const AUDIENCE_LABELS: Record<string, string> = {
  all: "Todos",
  anunciante: "Anunciantes",
  buscador: "Buscadores",
};

// Roles del staff y de los usuarios (`entity_type = 'role'`).
const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadministrador",
  admin: "Administrador",
  moderador: "Moderador",
  soporte: "Soporte",
  anunciante: "Anunciante",
  buscador: "Buscador",
};

// Una acción sin traducción no debe llegar al admin como `set_role_permission`.
// Al menos se muestra como texto y no como identificador de función.
const humanize = (raw: string) =>
  raw.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());

export function auditActionLabel(action: string | null): string {
  if (!action) return "—";
  return ACTION_LABELS[action] ?? humanize(action);
}

export function auditEntityLabel(type: string | null): string {
  if (!type) return "—";
  return ENTITY_LABELS[type] ?? humanize(type);
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? humanize(role);
}

// Nombres ya resueltos desde la BD (los IDs por sí solos no dicen nada).
export interface EntityNames {
  users?: Map<string, string>;
  listings?: Map<string, string>;
}

// Nombre legible de la entidad afectada, sin el tipo delante.
// Ej.: "Soporte", "ana@correo.com", "Toyota Yaris 2019".
export function auditEntityName(
  type: string | null,
  id: string | null,
  names: EntityNames = {},
): string {
  if (!id) return "";
  switch (type) {
    case "user": return names.users?.get(id) ?? id.slice(0, 8);
    case "listing": return names.listings?.get(id) ?? id.slice(0, 8);
    case "report": return id.slice(0, 8);
    case "role": return roleLabel(id);
    case "audience": return AUDIENCE_LABELS[id] ?? id;
    default: return id;
  }
}

// Entidad con su tipo delante, para la columna "Elemento afectado".
// Ej.: "Rol: Soporte".
export function auditEntityDescription(
  type: string | null,
  id: string | null,
  names: EntityNames = {},
): string {
  const label = auditEntityLabel(type);
  const name = auditEntityName(type, id, names);
  return name ? `${label}: ${name}` : label;
}

// La acción encabeza su propia columna en Auditoría ("Cambió permisos del rol")
// pero va dentro de una frase en Actividad reciente ("admin@effe.com cambió
// permisos del rol Soporte").
export function lowercaseFirst(text: string): string {
  return text.replace(/^./, (c) => c.toLowerCase());
}
