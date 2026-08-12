// El mensaje legible de algo que se atrapó en un `catch`.
//
// En un `catch`, TypeScript tipa lo atrapado como `unknown`, porque en
// JavaScript se puede lanzar cualquier cosa: un Error, un texto, un objeto de
// la librería de turno o hasta `undefined`. El repo lo resolvía escribiendo
// `catch (e: any)` y leyendo `e?.message` — que funciona, pero apaga el
// comprobador de tipos justo donde menos se sabe qué hay.
//
// Esto lo mira de verdad y siempre devuelve algo que se le puede enseñar a una
// persona.
export function mensajeDeError(e: unknown, porDefecto = "Error"): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  // Supabase y varias librerías lanzan objetos planos con `message`, que no
  // heredan de Error.
  if (e && typeof e === "object" && "message" in e) {
    const mensaje = (e as { message?: unknown }).message;
    if (typeof mensaje === "string" && mensaje) return mensaje;
  }
  return porDefecto;
}
