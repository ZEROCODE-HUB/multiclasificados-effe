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
const ventanaY = (): number =>
  (typeof window !== "undefined" && (window.scrollY ?? window.pageYOffset)) || 0;

/** ¿El elemento está dentro de la parte visible de la pantalla? */
function estaALaVista(el: HTMLElement): boolean {
  const alto = typeof window !== "undefined" ? window.innerHeight : 0;
  if (!alto) return false; // sin ventana medible no se puede afirmar que se vea
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.top < alto;
}

export function enfocarCampo(campo: string, raiz: ParentNode = document): void {
  const el = raiz.querySelector<HTMLElement>(`[data-campo="${campo}"]`);
  if (!el) return;
  // El desplazamiento suave es un adorno, y hay sitios donde el navegador
  // simplemente lo ignora (pestaña en segundo plano, WebView, "reducir
  // movimiento" activado). Comprobado en producción: con `behavior:"smooth"` la
  // página no se movía ni un píxel, y sin él sí. Como lo que importa es que el
  // campo se VEA, se pide el suave y, si no pasó nada, se remata sin animación.
  const dondeEstaba = ventanaY();
  try {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch {
    el.scrollIntoView(); // navegadores viejos sin opciones
  }
  setTimeout(() => {
    if (!estaALaVista(el) && ventanaY() === dondeEstaba) {
      try {
        el.scrollIntoView({ block: "center" });
      } catch {
        el.scrollIntoView();
      }
    }
  }, 350);
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
