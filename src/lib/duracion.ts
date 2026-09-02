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

// `tiempoDelAviso` vivía aquí y decía "Lleva N publicado y le quedan M.".
// Se retiró al unificar los textos de las notificaciones: la frase entera se
// arma ahora en `src/lib/textoDeNotificacion.ts`, que es el único sitio donde
// se decide qué dice cada aviso en la campana, el correo y el push. Quedaba sin
// usar, y una función así se vuelve a llamar por error años después.
