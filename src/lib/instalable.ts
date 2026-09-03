/**
 * Cuándo ofrecer instalar la web, y de qué manera.
 *
 * Hay DOS mundos y no se parecen:
 *
 *  · Android/escritorio (Chrome, Edge): el navegador avisa con el evento
 *    `beforeinstallprompt`, se puede guardar y disparar cuando queramos. Un
 *    toque y se instala.
 *  · iPhone: Safari NUNCA ha implementado ese evento. Apple no permite que una
 *    web pida instalarse, así que lo único posible es EXPLICAR los dos toques
 *    (Compartir → Añadir a pantalla de inicio). No hay forma de automatizarlo,
 *    ni la habrá mientras Apple no cambie de idea.
 *
 * Todo esto vive fuera del componente para poder probarlo sin pintar nada: son
 * decisiones (a quién, cuándo, cuántas veces) y no interfaz.
 */

/** Cómo se le puede ofrecer la instalación a quien está mirando. */
export type ModoDeInstalacion =
  /** Chrome y compañía: hay evento, se instala con un toque. */
  | "automatico"
  /** Safari de iPhone o iPad: solo se puede explicar cómo se hace a mano. */
  | "ios-manual"
  /** No se puede o no se debe ofrecer nada. */
  | "ninguno";

const CLAVE_DESCARTE = "effe:instalar-descartado";
const CLAVE_VISITAS = "effe:visitas";

/** Cuánto se respeta un "ahora no". Dos meses: ni insistente ni para siempre. */
const DIAS_DE_SILENCIO = 60;

/** A partir de qué visita se ofrece. En la primera se viene a mirar, no a instalar. */
const VISITA_MINIMA = 2;

/**
 * `localStorage` puede LANZAR, no solo venir vacío: en el modo privado de
 * algunos navegadores y con las cookies de terceros bloqueadas, el simple
 * acceso revienta. Un cartel de instalación no puede tumbar la aplicación.
 */
function leer(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribir(clave: string, valor: string): void {
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    // Sin sitio donde recordarlo, el cartel volverá a salir. Es molesto, no roto.
  }
}

/** ¿Ya está instalada y la estamos viendo desde el icono? */
export function yaInstalada(): boolean {
  // `navigator.standalone` es la única señal en iOS: allí `display-mode` no
  // siempre responde, y es propiedad de Safari, así que TypeScript no la conoce.
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios) return true;
  try {
    return window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

/** iPhone o iPad. El iPad con iPadOS 13+ MIENTE y dice ser un Mac. */
export function esIOS(ua = navigator.userAgent): boolean {
  if (/iphone|ipod|ipad/i.test(ua)) return true;
  // Un Mac de verdad no tiene pantalla táctil; un iPad disfrazado sí. Sin esta
  // línea, el iPad se queda sin el único aviso que puede recibir.
  return /macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

/**
 * Safari de iOS, y no otro navegador del iPhone.
 *
 * Importa porque las instrucciones son distintas: en Chrome del iPhone el botón
 * de Compartir está en otro sitio. Antes que dar un paso a paso que no cuadra
 * con lo que la persona ve, se prefiere no decir nada.
 */
export function esSafariDeIOS(ua = navigator.userAgent): boolean {
  if (!esIOS(ua)) return false;
  // Todos los navegadores del iPhone usan WebKit por obligación, así que la
  // única forma de distinguirlos es su marca en el agente de usuario.
  return !/crios|fxios|edgios|opios|yabrowser|duckduckgo/i.test(ua);
}

/** ¿Se descartó hace poco? */
export function descartadoHacePoco(ahora = Date.now()): boolean {
  const guardado = Number(leer(CLAVE_DESCARTE));
  if (!Number.isFinite(guardado) || guardado <= 0) return false;
  return ahora - guardado < DIAS_DE_SILENCIO * 24 * 60 * 60 * 1000;
}

/** Recuerda el "ahora no". */
export function descartar(ahora = Date.now()): void {
  escribir(CLAVE_DESCARTE, String(ahora));
}

/**
 * Suma una visita y devuelve por cuál va.
 *
 * Se llama UNA vez por arranque de la aplicación. Sirve para no abordar a quien
 * acaba de llegar: en la primera visita se viene a mirar avisos, y un cartel
 * pidiendo instalar es exactamente lo que hace cerrar la pestaña.
 */
export function contarVisita(): number {
  const previas = Number(leer(CLAVE_VISITAS));
  const visita = (Number.isFinite(previas) && previas > 0 ? previas : 0) + 1;
  escribir(CLAVE_VISITAS, String(visita));
  return visita;
}

/**
 * La decisión completa: qué ofrecer, si es que hay algo que ofrecer.
 *
 * `hayEvento` es si el navegador ya nos dio el `beforeinstallprompt`. Sin él no
 * se puede instalar de un toque, y ofrecer un botón que no hace nada es peor
 * que no ofrecer nada.
 */
export function modoDeInstalacion(opciones: {
  nativa: boolean;
  hayEvento: boolean;
  visita: number;
  ua?: string;
  ahora?: number;
}): ModoDeInstalacion {
  const { nativa, hayEvento, visita, ua, ahora } = opciones;

  // Dentro del APK y del iPhone la aplicación YA está instalada, y por la
  // tienda. Ofrecer instalarla otra vez no tiene sentido.
  if (nativa) return "ninguno";
  if (yaInstalada()) return "ninguno";
  if (descartadoHacePoco(ahora)) return "ninguno";
  if (visita < VISITA_MINIMA) return "ninguno";

  // El automático manda: si el navegador nos deja instalar de un toque, eso es
  // siempre mejor que un instructivo.
  if (hayEvento) return "automatico";
  if (esSafariDeIOS(ua)) return "ios-manual";
  return "ninguno";
}
