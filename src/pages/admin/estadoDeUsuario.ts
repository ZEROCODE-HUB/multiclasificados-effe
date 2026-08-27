// Cómo se enseña el estado de una cuenta en el panel.
//
// Vive aparte de AdminUsers.tsx por dos motivos: se puede probar sin montar la
// página entera, y un archivo que exporta componentes no puede exportar además
// constantes sin romper el refresco en caliente de Vite.

/** Estado real de la BD -> etiqueta y color del diseño existente. */
export const statusMeta: Record<string, { label: string; color: string }> = {
  active:    { label: "Activo",     color: "bg-success/15 text-success border-success/30" },
  pending:   { label: "Pendiente",  color: "bg-warning/15 text-warning border-warning/30" },
  suspended: { label: "Suspendido", color: "bg-destructive/15 text-destructive border-destructive/30" },
  // "banned" heredado se muestra también como Suspendido (unificamos el bloqueo).
  banned:    { label: "Suspendido", color: "bg-destructive/15 text-destructive border-destructive/30" },
  // FALTABA, y por eso dar de baja parecía no hacer nada: el estado lo introdujo
  // la migración 0127 (a quien ya contrató no se le borra, se le da de baja) y
  // este mapa no se actualizó. Al no encontrarlo, el fallback de abajo lo
  // pintaba como "Activo": la baja se guardaba bien en la base y la tabla decía
  // lo contrario.
  //
  // En gris y no en rojo a propósito: suspender es una sanción y dar de baja es
  // cerrar una cuenta. Pintarlas igual mezclaría dos cosas que administración
  // necesita poder distinguir de un vistazo.
  inactive:  { label: "Inactivo",   color: "bg-muted text-muted-foreground border-border" },
};

const NEUTRO = "bg-muted text-muted-foreground border-border";

/**
 * Etiqueta y color de un estado.
 *
 * ANTE UNO DESCONOCIDO NO SE DICE "ACTIVO". Ese era el fallback anterior y es
 * exactamente lo que escondió el fallo de `inactive`: en vez de notarse que
 * había un estado sin contemplar, se afirmaba lo contrario de lo que pasaba.
 * Enseñar el valor crudo es más feo y muchísimo más honesto: salta a la vista y
 * se corrige.
 */
export function metaFor(s: string): { label: string; color: string } {
  return statusMeta[s] ?? { label: s || "—", color: NEUTRO };
}
