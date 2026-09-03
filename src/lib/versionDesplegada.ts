/**
 * ¿Lo que hay desplegado sigue siendo lo que estoy ejecutando?
 *
 * EL FALLO QUE ESTO ARREGLA, y que costó una queja del cliente. Se corrigió el
 * formulario de «Trabaje con nosotros», se desplegó, y horas después seguía
 * dando el mismo error: la pestaña llevaba abierta desde antes y seguía
 * ejecutando el JavaScript viejo.
 *
 * Había DOS mecanismos y ninguno cubría este caso:
 *
 *   · `cargaDiferida` recarga cuando un trozo del build NO SE PUEDE DESCARGAR.
 *     Pero Vercel conserva los ficheros de los despliegues anteriores, así que
 *     no falla nada: el código viejo sigue funcionando tan ricamente, para
 *     siempre, hablando con una base de datos que ya cambió.
 *   · `UpdateGate` compara versiones… pero sale antes de hacer nada si no está
 *     en la app nativa. En web NO HACE NADA.
 *
 * Así que la web no tenía forma de enterarse de que estaba obsoleta. Ahora
 * pregunta por `version.json`, que el build escribe en cada despliegue
 * (ver el plugin `effe-version-json` en vite.config.ts).
 */

/** Identificador del build que se está ejecutando. Lo inyecta Vite. */
declare const __BUILD_ID__: string;

/**
 * El del bundle en ejecución. Vacío si no lo hay (modo desarrollo, o las
 * pruebas, donde no se aplica el `define` de Vite).
 *
 * Se lee AL LLAMAR y no una vez al cargar el módulo: guardarlo en una constante
 * de módulo hizo que tres pruebas pasaran por el motivo equivocado —el valor se
 * congelaba antes de que la prueba lo definiera, la comprobación salía sin
 * hacer nada y el "no avisa" salía verde estuviera roto o no.
 */
export function buildEnCurso(): string {
  return typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "";
}

export interface VersionPublicada {
  version: string;
  buildId: string;
}

/**
 * Lee `version.json` del servidor.
 *
 * `cache: "no-store"` no es opcional: el sentido de esto es enterarse de un
 * cambio, y una respuesta servida desde la caché del navegador diría siempre
 * que todo sigue igual. `null` si no se puede saber — sin conexión, un 404 en
 * un despliegue antiguo o una respuesta que no es JSON.
 */
export async function versionDesplegada(): Promise<VersionPublicada | null> {
  try {
    const res = await fetch("/version.json", { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as Partial<VersionPublicada>;
    if (!j || typeof j.buildId !== "string" || !j.buildId) return null;
    return { version: String(j.version ?? ""), buildId: j.buildId };
  } catch {
    return null;
  }
}

/**
 * ¿Hay una versión más nueva ahí fuera?
 *
 * Se compara el `buildId` y no la versión: cambia en CADA build, así que el
 * aviso no depende de que nadie olvide subir `APP_VERSION`. Un aviso que
 * necesita que alguien se acuerde de algo no es un aviso.
 *
 * Ante la duda, `false`. Enseñar "hay una versión nueva" a quien ya está en la
 * última —o a quien simplemente se quedó sin cobertura un momento— es peor que
 * no enseñar nada.
 */
export async function hayVersionNueva(): Promise<VersionPublicada | null> {
  // Sin identificador no hay con qué comparar (modo desarrollo, o las pruebas).
  const enCurso = buildEnCurso();
  if (!enCurso) return null;
  const publicada = await versionDesplegada();
  if (!publicada) return null;
  return publicada.buildId !== enCurso ? publicada : null;
}
