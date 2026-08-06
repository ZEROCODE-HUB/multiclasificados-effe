// Clases de la fila de acciones del detalle de aviso (Guardar / Compartir /
// Reportar). Viven aparte de ListingDetail.tsx para que la prueba de layout
// (e2e/listingActionsRow.spec.ts) pueda medirlas en un navegador real sin
// arrastrar la página entera con todas sus dependencias.
//
// MOB-03: la fila era `flex flex-wrap` con un ancho mínimo puesto a ojo en
// "Guardar". Al marcar favorito el texto pasa a "Guardado", la fila crecía unos
// píxeles y en pantallas angostas (375px) "Reportar" saltaba a una segunda
// línea. Con tres columnas iguales el ancho de cada botón ya no depende del
// texto. De `sm` en adelante sobra el sitio y vuelve al flujo normal.
export const ACTION_ROW = "grid grid-cols-3 gap-2 pt-2 sm:flex sm:flex-wrap";

export const ACTION_BTN = "gap-1.5 px-2 rounded-full w-full min-w-0 sm:w-auto sm:gap-2 sm:px-3";

// El de favoritos conserva su ancho mínimo, pero solo a partir de `sm`, donde ya
// no hay grid: así "Guardar" y "Guardado" no bailan de tamaño en escritorio.
export const ACTION_BTN_SAVE = `${ACTION_BTN} sm:min-w-[116px]`;
