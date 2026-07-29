/* Promueve el preload de Montserrat a stylesheet SIN esperar al bundle.
 *
 * El <link id="montserrat-font"> del index.html es un `preload as=style`: la
 * hoja se descarga, pero no se aplica hasta que alguien le cambia el `rel`. Eso
 * lo hacía main.tsx, así que la petición a fonts.googleapis.com (y de ahí los
 * woff2 de fonts.gstatic.com) no arrancaba hasta descargar, parsear y ejecutar
 * ~425 KB de JS. Lighthouse lo veía como un preconnect a gstatic "sin usar"
 * (IT3-008) y el texto tardaba de más en tomar la tipografía real.
 *
 * Es un script externo de 'self' —y no un `onload` en línea— porque la CSP tiene
 * `script-src` sin unsafe-inline. Mismo patrón que public/boot-watchdog.js.
 * main.tsx sigue haciendo lo mismo como red de seguridad: poner `rel` dos veces
 * no tiene ningún efecto.
 */
(function () {
  var l = document.getElementById("montserrat-font");
  if (l && l.rel !== "stylesheet") l.rel = "stylesheet";
})();
