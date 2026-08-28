// Poner un número de horas en palabras.
//
// Lo pidió el cliente para las alertas de vencimiento: "en las alertas y correos
// colocamos el tiempo transcurrido y lo que le queda". En horas y no en días
// porque los planes cortos se pierden en el redondeo — a un aviso de 3 días le
// quedan "0 días" durante sus últimas veintitrés horas.
export function enPalabras(horas: number | null | undefined): string {
  const h = Math.max(0, Math.round(Number(horas)));
  if (!Number.isFinite(h)) return "";
  if (h < 1) return "menos de una hora";
  if (h < 24) return `${h} ${h === 1 ? "hora" : "horas"}`;

  const dias = Math.floor(h / 24);
  const resto = h % 24;
  const parteDias = `${dias} ${dias === 1 ? "día" : "días"}`;
  return resto === 0 ? parteDias : `${parteDias} y ${resto} ${resto === 1 ? "hora" : "horas"}`;
}

/**
 * La frase completa del vencimiento a partir de lo que trae la notificación.
 * Devuelve "" si el aviso es de los antiguos y no lleva las horas: entonces
 * quien la use se queda con su texto de siempre, en vez de escribir una frase
 * a medias.
 */
export function tiempoDelAviso(
  transcurridas: unknown,
  restantes: unknown,
): string {
  // `Number(null)` y `Number("")` valen CERO, no NaN, así que comprobar solo
  // que sea finito dejaba pasar la ausencia de dato: la alerta acababa
  // diciendo "le quedan menos de una hora" a un aviso recién publicado.
  const cifra = (v: unknown) =>
    v === null || v === undefined || v === "" ? Number.NaN : Number(v);
  const t = cifra(transcurridas);
  const r = cifra(restantes);
  if (!Number.isFinite(t) || !Number.isFinite(r)) return "";
  return `Lleva ${enPalabras(t)} publicado y le ${r === 1 ? "queda" : "quedan"} ${enPalabras(r)}.`;
}
