// Validación de formularios: marcar el campo que falla y llevar al usuario hasta él.
//
// Por qué a mano y no con react-hook-form (que está en package.json): el
// formulario de publicar tiene el estado repartido en ~15 useState que se
// disparan entre sí (adicionales, anclaje de scroll, borrador en localStorage).
// Migrarlo sería reescribirlo entero. Esto son treinta líneas y resuelve lo que
// se pidió: que el campo se resalte y la pantalla vaya hasta él, en web y en el
// móvil.

export interface Regla {
  /** Identificador del campo; debe coincidir con el `data-campo` del DOM. */
  campo: string;
  /** true = el campo está bien. */
  ok: boolean;
  /** Qué decirle al usuario si falla. */
  mensaje: string;
}

/** Primera regla incumplida, en el orden en que se declararon (que es el orden visual). */
export function primerFallo(reglas: Regla[]): Regla | null {
  return reglas.find((r) => !r.ok) ?? null;
}

/** Todos los fallos, como mapa campo → mensaje, para pintarlos a la vez. */
export function fallos(reglas: Regla[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of reglas) if (!r.ok && !out[r.campo]) out[r.campo] = r.mensaje;
  return out;
}

/**
 * Lleva la pantalla hasta el campo y le da el foco.
 *
 * `block: "center"` no es un capricho: con "nearest" el campo queda pegado al
 * borde y en el WebView del APK el teclado que se abre justo después lo tapa.
 * El `focus` va con `preventScroll` para que no pelee con el desplazamiento
 * suave que acabamos de pedir.
 */
export function enfocarCampo(campo: string, raiz: ParentNode = document): void {
  const el = raiz.querySelector<HTMLElement>(`[data-campo="${campo}"]`);
  if (!el) return;
  try {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch {
    el.scrollIntoView(); // navegadores viejos sin opciones
  }
  const enfocable =
    el.matches("input, textarea, select, button")
      ? el
      : el.querySelector<HTMLElement>("input, textarea, select, button, [tabindex]");
  try {
    enfocable?.focus({ preventScroll: true });
  } catch {
    enfocable?.focus();
  }
}
