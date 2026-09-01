// Catálogo ÚNICO de la matriz "Roles y permisos". Es la fuente de verdad que
// consumen la pantalla de permisos (SuperRoles) y el menú del panel
// (AdminLayout), para que módulos, etiquetas y descripciones no se dupliquen.
//
// `id` es la clave EXACTA de la BD (role_permissions.module / has_perm /
// get_my_permissions). NO se cambia sin una migración de datos: el join de
// permisos es por texto exacto.
//
// Solo se declaran las acciones que tienen EFECTO REAL en cada módulo (ver el
// modelo de dos niveles): módulos "granulares" con acciones concretas, y módulos
// de "acceso" con un único toggle (view) porque acceder = usar la sección.
import type { LucideIcon } from "lucide-react";
import {
  ClipboardList, Users, Tags, DollarSign, Flag, FileBarChart, Send, ScrollText, Smartphone, BookOpen,
  Briefcase } from "lucide-react";

export type PermAction = "view" | "edit" | "approve" | "delete";

export interface PermActionDef {
  key: PermAction;
  label: string;       // verbo corto ("Moderar", "Verificar identidad"…)
  description: string; // qué desbloquea, en lenguaje humano
}

export interface PermModuleDef {
  id: string;          // clave exacta en la BD — no cambiar
  label: string;       // etiqueta amigable (misma que el menú)
  icon: LucideIcon;
  description: string;
  group: string;       // grupo del menú
  sub?: string;        // segmento de ruta del panel (/dashboard/{role}/{sub})
  superadminOnly?: boolean; // solo en el menú del superadmin; no editable en la matriz
  actions: PermActionDef[];
}

const A = {
  access: (what: string): PermActionDef => ({ key: "view", label: "Acceder", description: what }),
  see: (what: string): PermActionDef => ({ key: "view", label: "Ver", description: what }),
};

// Orden = orden del menú.
export const PERM_MODULES: PermModuleDef[] = [
  {
    id: "Gestión de avisos", label: "Gestión de avisos", icon: ClipboardList, group: "Operación", sub: "avisos",
    description: "Revisión y moderación de los avisos publicados.",
    actions: [
      A.access("Ver la lista de avisos y su detalle."),
      { key: "edit", label: "Moderar", description: "Deshabilitar, rehabilitar y destacar avisos." },
    ],
  },
  {
    id: "Gestión de usuarios", label: "Gestión de usuarios", icon: Users, group: "Operación", sub: "usuarios",
    description: "Cuentas de la plataforma.",
    actions: [
      A.access("Ver la lista de usuarios y su actividad."),
      { key: "edit", label: "Gestionar", description: "Suspender/reactivar cuentas, restablecer contraseña y otorgar saldo." },
      { key: "approve", label: "Verificar identidad", description: "Marcar o quitar el sello de cuenta verificada." },
      { key: "delete", label: "Eliminar cuentas", description: "Borrar usuarios de forma permanente." },
    ],
  },
  {
    id: "Configuración comercial", label: "Config. comercial", icon: Tags, group: "Operación", sub: "comercial",
    description: "Categorías y ajustes del catálogo.",
    actions: [
      A.access("Ver categorías, subcategorías y ajustes del catálogo."),
      { key: "edit", label: "Editar", description: "Crear, editar, reordenar y eliminar categorías y subcategorías." },
    ],
  },
  {
    id: "Pagos y planes", label: "Tarifas y descuentos", icon: DollarSign, group: "Operación", sub: "tarifas",
    description: "Precios, promociones y paquetes de créditos.",
    actions: [
      A.access("Ver tarifas, promociones y paquetes de saldo."),
      { key: "edit", label: "Editar", description: "Guardar tarifas y gestionar promociones y paquetes de saldo." },
    ],
  },
  {
    id: "Pagos Yape/Plin", label: "Pagos Yape/Plin", icon: Smartphone, group: "Operación", sub: "yape-plin",
    description: "Pagos por billetera que aprueba una persona.",
    actions: [
      A.access("Ver la bandeja de pagos por Yape y Plin."),
      // Aprobar acredita dinero real y publica avisos: va aparte de "ver".
      { key: "approve", label: "Aprobar o rechazar", description: "Confirmar un pago (acredita saldo, emite boleta y publica el aviso) o rechazarlo." },
    ],
  },
  {
    // El Libro que exige Indecopi, no las denuncias entre usuarios: son cosas
    // distintas y por eso van en módulos distintos. Este trae datos personales
    // del consumidor (documento, domicilio) y plazos legales; quien modera un
    // chat no tiene por qué verlos.
    id: "Libro de Reclamaciones", label: "Libro de Reclamaciones", icon: BookOpen,
    group: "Operación", sub: "reclamaciones",
    description: "Reclamos y quejas del Libro de Reclamaciones, con su respuesta.",
    actions: [
      A.access("Consultar los reclamos registrados y su hoja."),
      { key: "edit", label: "Responder", description: "Responder al consumidor y cerrar el reclamo. Compromete a la empresa en un plazo legal." },
    ],
  },
  {
    // Postulaciones espontáneas de trabajo EN eFFe (B-18). Nada que ver con las
    // postulaciones a los avisos de empleo de los anunciantes: aquellas van
    // dirigidas a un cliente y este módulo no las toca. Trae documento, correo
    // y teléfono de terceros, así que va por permiso y no por "es del staff".
    id: "Trabaje con nosotros", label: "Trabaje con nosotros", icon: Briefcase,
    group: "Operación", sub: "postulaciones",
    description: "Postulaciones de trabajo recibidas desde la web.",
    actions: [
      A.access("Consultar las postulaciones recibidas y sus datos."),
      { key: "edit", label: "Gestionar", description: "Marcar el estado de una postulación y dejar una nota interna." },
    ],
  },
  {
    // El `id` es la clave en la BD y NO se toca. La etiqueta sí: "Reclamos"
    // chocaba con "Libro de Reclamaciones", que es la pantalla legal de
    // Indecopi y no tiene nada que ver con moderar a un usuario.
    id: "Conversaciones reportadas", label: "Usuarios reportados", icon: Flag, group: "Operación", sub: "conversaciones",
    description: "Denuncias entre usuarios y su moderación.",
    actions: [
      A.access("Ver los reclamos y la conversación reportada."),
      { key: "edit", label: "Resolver", description: "Asignar, advertir y suspender según el reclamo." },
    ],
  },
  {
    id: "Reportes", label: "Reportes", icon: FileBarChart, group: "Operación", sub: "reportes",
    description: "Reportería y métricas comerciales.",
    actions: [
      A.see("Ver la reportería y las métricas."),
      // EFFE-054: toggle aparte para el historial de transacciones de crédito
      // (dato financiero). Sin este permiso, la pestaña "Transacciones" no se ve
      // y el RPC no devuelve datos. El superadmin siempre lo tiene.
      { key: "edit", label: "Ver transacciones", description: "Ver el historial de transacciones de crédito de todos los usuarios (dato financiero)." },
    ],
  },
  {
    id: "Comunicaciones", label: "Comunicaciones", icon: Send, group: "Comunicaciones", sub: "comunicaciones",
    description: "Mensajes y difusiones a los usuarios.",
    actions: [
      A.access("Ver el centro de mensajes y el conteo de audiencia."),
      { key: "edit", label: "Enviar", description: "Enviar mensajes individuales y difusiones a usuarios." },
    ],
  },
  {
    id: "Auditoría y logs", label: "Auditoría y logs", icon: ScrollText, group: "Plataforma", sub: "auditoria",
    description: "Bitácora de acciones del equipo.",
    superadminOnly: true,
    actions: [A.see("Ver la bitácora de auditoría.")],
  },
];

// Módulos editables en la matriz (los superadmin-only no aplican a admin/moderador/soporte).
export const MATRIX_MODULES = PERM_MODULES.filter((m) => !m.superadminOnly);

// Sub-ruta → id de módulo, para filtrar el menú y bloquear el acceso por URL.
export const MODULE_BY_SUB: Record<string, string> = Object.fromEntries(
  PERM_MODULES.filter((m) => m.sub).map((m) => [m.sub as string, m.id]),
);

export function actionsFor(moduleId: string): PermActionDef[] {
  return PERM_MODULES.find((m) => m.id === moduleId)?.actions ?? [];
}

// Fila de permisos (mismas columnas que role_permissions).
interface PermRow { can_view: boolean; can_edit: boolean; can_approve: boolean; can_delete: boolean; }
const has = (row: PermRow | undefined, action: PermAction) =>
  Boolean(row?.[`can_${action}` as keyof PermRow]);

// Resumen en lenguaje humano de lo que un rol podrá hacer, según su borrador de
// permisos (una fila por módulo). Devuelve líneas "Módulo — Acción".
export function capabilitiesFor(rowsByModule: Record<string, PermRow>): { module: string; action: string }[] {
  const out: { module: string; action: string }[] = [];
  for (const m of MATRIX_MODULES) {
    const row = rowsByModule[m.id];
    for (const a of m.actions) {
      if (has(row, a.key)) out.push({ module: m.label, action: a.label });
    }
  }
  return out;
}
