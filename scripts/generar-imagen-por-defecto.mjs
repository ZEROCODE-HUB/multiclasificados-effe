// Genera public/aviso-sin-imagen.jpg — la imagen que lleva un aviso publicado
// sin foto.
//
//   node scripts/generar-imagen-por-defecto.mjs
//
// Por qué hace falta un script y no vale el archivo original
// ─────────────────────────────────────────────────────────
// El original (scripts/fuente-aviso-sin-imagen.jpg, 924x495) trae el logo
// pegado a los cuatro bordes, y todos los huecos donde se pinta una imagen de
// aviso usan `object-cover`, que RECORTA para llenar. En una tarjeta 4:3 eso se
// come los lados: desaparecen la "E" y el globo terráqueo.
//
// La regla de este script: el logo nunca ocupa más del MARGEN_SEGURO del ancho
// ni del alto. Con 75% sobrevive entero a cualquier recorte entre 1:1 y 16:9,
// que cubre todos los huecos de la app (tarjeta 4:3, miniatura de la lista 4:3,
// galería del detalle 4:3 y, en pantallas anchas, alto libre).
//
//   · recorte a 1:1  → se conservan 900 de 1200 px de ancho (75%)
//   · recorte a 16:9 → se conservan 675 de 900 px de alto  (75%)
//
// Se dibuja con el navegador (Playwright, ya instalado para las pruebas) porque
// el proyecto no tiene ninguna librería de imagen y no merece la pena añadirla
// para generar un archivo que cambia una vez cada dos años.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FUENTE = path.join(RAIZ, "scripts/fuente-aviso-sin-imagen.jpg");
const SALIDA = path.join(RAIZ, "public/aviso-sin-imagen.jpg");

// 4:3, la proporción de todos los huecos de imagen de la app.
const ANCHO = 1200;
const ALTO = 900;
// Techo que garantiza que ningún recorte entre 1:1 y 16:9 toque el logo.
const MARGEN_SEGURO = 0.75;
// Tamaño al que se dibuja, por debajo del techo. Se queda en 65% y no en el 75%
// máximo por las insignias de la tarjeta ("URGENTE", "VERIFICADO", el corazón),
// que se pintan encima de la imagen en las esquinas: al 75% el logo les pasaba
// por debajo y se le comían la primera letra.
const TAMANO_LOGO = 0.65;

const b64 = fs.readFileSync(FUENTE).toString("base64");

const navegador = await chromium.launch();
const pagina = await navegador.newPage({
  viewport: { width: ANCHO, height: ALTO },
  deviceScaleFactor: 1,
});

await pagina.setContent(`
  <style>
    html, body { margin: 0; padding: 0; background: #fff; }
    body {
      width: ${ANCHO}px; height: ${ALTO}px;
      display: flex; align-items: center; justify-content: center;
    }
    img {
      max-width: ${TAMANO_LOGO * 100}%;
      max-height: ${TAMANO_LOGO * 100}%;
      object-fit: contain;
    }
  </style>
  <img src="data:image/jpeg;base64,${b64}">
`);
await pagina.waitForFunction(() => {
  const i = document.querySelector("img");
  return i && i.complete && i.naturalWidth > 0;
});

// Comprobación antes de escribir: si el logo se saliera del margen seguro, el
// recorte volvería a comérselo y el archivo generado no serviría de nada.
const caja = await pagina.locator("img").boundingBox();
const ocupaAncho = caja.width / ANCHO;
const ocupaAlto = caja.height / ALTO;
if (ocupaAncho > MARGEN_SEGURO + 0.001 || ocupaAlto > MARGEN_SEGURO + 0.001) {
  console.error(
    `✖ El logo ocupa ${(ocupaAncho * 100).toFixed(1)}% x ${(ocupaAlto * 100).toFixed(1)}%, ` +
    `por encima del ${MARGEN_SEGURO * 100}% seguro. No se ha escrito nada.`,
  );
  process.exit(1);
}

await pagina.screenshot({ path: SALIDA, type: "jpeg", quality: 88 });
await navegador.close();

const kb = (fs.statSync(SALIDA).size / 1024).toFixed(0);
console.log(`✔ ${path.relative(RAIZ, SALIDA)} — ${ANCHO}x${ALTO}, ${kb} KB`);
console.log(`  el logo ocupa ${(ocupaAncho * 100).toFixed(1)}% del ancho y ${(ocupaAlto * 100).toFixed(1)}% del alto`);
console.log(`  margen libre: ${Math.round((ANCHO - caja.width) / 2)} px a los lados, ${Math.round((ALTO - caja.height) / 2)} px arriba y abajo`);
