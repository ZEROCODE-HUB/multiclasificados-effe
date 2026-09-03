import {
  COLORES, normalizar, type Color, type Fragmento, type TextoConFormato,
} from "@/lib/textoConFormato";

/**
 * El puente entre lo que hay en pantalla y lo que se guarda.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO, Y NO ESTÁ DENTRO DEL COMPONENTE. Aquí está lo
 * único del editor que tiene casos raros de verdad —leer el DOM que deja el
 * navegador tras dar formato— y separarlo permite probarlo sin montar React.
 *
 * CÓMO FUNCIONA EL EDITOR, en una frase: escribir lo maneja el navegador y
 * nosotros no tocamos nada mientras se teclea. Solo LEEMOS. Eso es lo que
 * elimina de raíz los problemas de cursor, autocorrección y teclado en iOS que
 * hunden a los editores caseros: para el navegador, es un campo de texto normal.
 *
 * El precio es que el navegador deja el DOM como quiere —`<b>`, `<strong>`,
 * `font-weight` en un estilo, `<font color>`, `<span style="color: rgb(...)">`—
 * y hay que entender todas esas formas. De eso va `leerDelDom`.
 */

/** `#162950` → `rgb(22, 41, 80)`, que es como el navegador devuelve un color. */
function hexARgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/** Todas las formas en que puede llegar cada color de la paleta. */
const PORCOLOR = new Map<string, Color | null>();
for (const c of COLORES) {
  PORCOLOR.set(c.hex.toLowerCase(), c.valor);
  PORCOLOR.set(hexARgb(c.hex), c.valor);
  // Sin espacios: algunos navegadores devuelven `rgb(22,41,80)`.
  PORCOLOR.set(hexARgb(c.hex).replace(/\s/g, ""), c.valor);
}

/**
 * Traduce un color del navegador a uno de la paleta.
 *
 * Lo que no reconoce se descarta: si alguien pega texto de otra web con su
 * propio color, se queda con el color normal en vez de colarse un tono que la
 * base rechazaría y que además nadie eligió.
 */
function colorDePaleta(valor: string | null | undefined): Color | null {
  if (!valor) return null;
  const v = valor.trim().toLowerCase();
  return PORCOLOR.get(v) ?? PORCOLOR.get(v.replace(/\s/g, "")) ?? null;
}

/** ¿Este elemento pone el texto en negrita? */
function esNegrita(el: HTMLElement): boolean {
  if (el.tagName === "B" || el.tagName === "STRONG") return true;
  const peso = el.style.fontWeight;
  if (!peso) return false;
  return peso === "bold" || peso === "bolder" || Number(peso) >= 600;
}

/** El color que impone este elemento, si impone alguno. */
function colorDe(el: HTMLElement): Color | null {
  // `style.color` cubre `styleWithCSS`; el atributo `color` cubre el `<font>`
  // que todavía produce Safari.
  return colorDePaleta(el.style.color) ?? colorDePaleta(el.getAttribute("color"));
}

/**
 * Lee el contenido del editor y lo convierte al modelo que se guarda.
 *
 * Recorre los nodos de texto y, para cada uno, mira sus ANCESTROS hasta la raíz:
 * las marcas se heredan, y el navegador puede anidarlas en cualquier orden
 * (`<b><span style="color">` o al revés) sin que eso signifique nada distinto.
 */
export function leerDelDom(raiz: HTMLElement): TextoConFormato {
  const partes: Fragmento[] = [];

  const recorrer = (nodo: Node, negrita: boolean, color: Color | null) => {
    if (nodo.nodeType === Node.TEXT_NODE) {
      const t = nodo.textContent ?? "";
      if (!t) return;
      const f: Fragmento = { t };
      if (negrita) f.b = true;
      if (color) f.c = color;
      partes.push(f);
      return;
    }
    if (nodo.nodeType !== Node.ELEMENT_NODE) return;

    const el = nodo as HTMLElement;

    // Un salto de línea es texto, no estructura: así el modelo guarda "\n" y la
    // ficha lo pinta con `whitespace-pre-line`, igual que la descripción de
    // siempre.
    if (el.tagName === "BR") { partes.push({ t: "\n" }); return; }

    // Los bloques que crea el navegador al pulsar Enter (`<div>`, `<p>`) también
    // son un salto, salvo el primero: si no, cada línea empezaría con uno de más.
    const esBloque = el.tagName === "DIV" || el.tagName === "P";
    if (esBloque && partes.length) partes.push({ t: "\n" });

    const n = negrita || esNegrita(el);
    const c = colorDe(el) ?? color;
    for (const hijo of Array.from(el.childNodes)) recorrer(hijo, n, c);
  };

  for (const hijo of Array.from(raiz.childNodes)) recorrer(hijo, false, null);
  return normalizar(partes);
}

/**
 * Construye el contenido del editor a partir del modelo.
 *
 * Solo se usa al ABRIR el editor —o al cargar un aviso para editarlo—, nunca
 * mientras se escribe: reconstruir el DOM con el cursor dentro lo movería de
 * sitio y borraría el deshacer del navegador.
 *
 * Se crean nodos con `createElement`/`createTextNode` y no con `innerHTML`. Es
 * la misma razón por la que no se guarda HTML: por esta función pasa texto de
 * usuarios, y con `innerHTML` una descripción podría traer una etiqueta.
 */
export function escribirEnDom(raiz: HTMLElement, formato: TextoConFormato): void {
  raiz.textContent = "";
  for (const p of formato) {
    // El texto se parte por saltos de línea para insertar `<br>`: dentro de un
    // `contenteditable`, un "\n" suelto no se ve.
    const lineas = p.t.split("\n");
    lineas.forEach((linea, i) => {
      if (i > 0) raiz.appendChild(document.createElement("br"));
      if (!linea) return;
      const texto = document.createTextNode(linea);
      if (!p.b && !p.c) { raiz.appendChild(texto); return; }
      const span = document.createElement("span");
      if (p.b) span.style.fontWeight = "700";
      if (p.c) span.style.color = COLORES.find((c) => c.valor === p.c)?.hex ?? "";
      span.appendChild(texto);
      raiz.appendChild(span);
    });
  }
}

/**
 * ¿Está el cursor (o la selección) dentro de este editor?
 *
 * Antes de dar formato hay que asegurarse: si el foco se fue a otra parte, el
 * comando del navegador se aplicaría donde no debe.
 */
export function seleccionDentro(raiz: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  return raiz.contains(sel.getRangeAt(0).commonAncestorContainer);
}

/** Longitud del texto, que es lo que cuenta para el límite de caracteres. */
export function largoDelDom(raiz: HTMLElement): number {
  return leerDelDom(raiz).reduce((n, p) => n + p.t.length, 0);
}
