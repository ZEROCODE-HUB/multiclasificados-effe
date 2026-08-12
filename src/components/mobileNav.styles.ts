// Geometría de la barra de navegación inferior del móvil.
//
// Vive aparte por el mismo motivo que listingActions.styles.ts: para que una
// prueba de layout en un navegador real (e2e/shareFab.spec.ts) pueda medir las
// clases REALES sin montar la barra entera con su sesión, su router y su
// contador de mensajes. Si aquí cambia el alto, la prueba del botón flotante lo
// nota; con las clases copiadas a mano en la prueba, no.
export const MOBILE_NAV = "lg:hidden fixed bottom-0 inset-x-0 z-40 pb-safe bg-primary text-primary-foreground border-t border-primary/40 shadow-[0_-8px_24px_-6px_rgba(0,0,0,0.25)]";

// El `h-16` (4rem) es lo que la variable `--nav-bottom` de src/index.css da por
// supuesto. Si uno cambia, el otro también.
export const MOBILE_NAV_INNER = "grid grid-cols-5 h-16";
