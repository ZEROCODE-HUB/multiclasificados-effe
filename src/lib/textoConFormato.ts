/**
 * Descripción con negrita y color.
 *
 * EL MODELO. Una lista de fragmentos de texto, cada uno con dos marcas
 * opcionales. Nada más:
 *
 *     [{ t: "Depa " }, { t: "amoblado", b: true }, { t: " en Lima", c: "#dc2626" }]
 *
 * NO se guarda HTML, y es la decisión de diseño más importante de este módulo.
 * Guardar HTML de usuarios obliga a sanearlo, y un solo fallo en el saneado es
 * XSS almacenado servido a todos los visitantes. Con esta estructura el
 * renderizador construye elementos de React y nunca usa `dangerouslySetInnerHTML`,
 * así que un anunciante NO PUEDE producir una etiqueta ni queriendo.
 *
 * Todo lo que hay aquí es lógica pura, sin React ni DOM, para poder probarlo a
 * fondo: es donde están los casos raros (fusionar, partir, recortar rangos).
 */

/**
 * EL COLOR SE GUARDA COMO EL TONO, NO COMO UN NOMBRE.
 *
 * Antes solo se admitían cuatro colores y `c` guardaba su nombre («rojo»). El
 * cliente pidió poder elegir CUALQUIERA, así que ahora `c` guarda el tono
 * directamente, en `#rrggbb` y en minúsculas.
 *
 * Que sea SIEMPRE esa forma no es cosmético, es la frontera de seguridad. Este
 * valor acaba en un `style` de la ficha que abre cualquier visitante, así que
 * antes de pintarlo se comprueba contra la expresión de abajo y lo que no encaja
 * se descarta. Nunca se copia tal cual lo que venga en el dato: eso permitiría
 * cerrar la propiedad y añadir otras.
 */
export type Color = string;

/** Seis dígitos hexadecimales en minúsculas. Nada más pasa. */
const RE_COLOR = /^#[0-9a-f]{6}$/;

/** ¿Es un tono que se puede pintar sin miedo? */
export function esColorValido(c: unknown): c is Color {
  return typeof c === "string" && RE_COLOR.test(c);
}

/**
 * El color del texto cuando no se ha elegido ninguno (`--foreground`).
 *
 * Hace de «sin color»: elegirlo en el editor equivale a quitar el color, porque
 * es exactamente el tono que el texto tendría sin marca. Quien elija justo este
 * tono a mano obtiene lo mismo que ve, así que no hay sorpresa posible.
 */
export const COLOR_NORMAL = "#29303d";

/**
 * Atajos a los colores de la casa. NO son un límite: al lado va el selector
 * libre. Están porque acertar el azul de la marca con una rueda de color es
 * imposible, y porque son los que se van a usar el 90 % de las veces.
 *
 * Los dos primeros salen de `--primary` y `--secondary` de index.css; los otros
 * dos son los semáforos de siempre.
 */
export const COLORES = [
  { nombre: "Azul", hex: "#162950" },
  { nombre: "Naranja", hex: "#bd4e05" },
  { nombre: "Verde", hex: "#059669" },
  { nombre: "Rojo", hex: "#dc2626" },
] as const;

/**
 * Traduce a `#rrggbb` lo que devuelva el navegador.
 *
 * Hace falta porque cada uno contesta a su manera: al leer un estilo dan
 * `rgb(22, 41, 80)`, un `<font color>` pegado de otra web puede traer `#abc`, y
 * `queryCommandValue` devuelve unas veces una cosa y otras la otra.
 *
 * Lo que no reconoce devuelve `null` —y entonces el trozo se queda sin color—
 * en vez de inventarse un tono.
 */
export function normalizarColor(valor: string | null | undefined): Color | null {
  if (!valor) return null;
  const v = valor.trim().toLowerCase();

  if (RE_COLOR.test(v)) return v;

  // La forma corta: `#abc` es `#aabbcc`.
  const corto = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (corto) return `#${corto[1]}${corto[1]}${corto[2]}${corto[2]}${corto[3]}${corto[3]}`;

  // `rgb(...)` y `rgba(...)`, con espacios o sin ellos. La transparencia se
  // ignora: el modelo no la guarda y un texto medio transparente no se lee.
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,[^)]*)?\)$/.exec(v);
  if (rgb) {
    const n = [1, 2, 3].map((i) => Number(rgb[i]));
    if (n.some((x) => x > 255)) return null;
    return `#${n.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  }

  return null;
}

/** El tono con el que se pinta un color. Ante la duda, el normal. */
export function hexDeColor(c: Color | null | undefined): string {
  return esColorValido(c) ? c : COLOR_NORMAL;
}

/** Un trozo de texto con sus marcas. */
export interface Fragmento {
  t: string;
  /** Negrita. Solo se guarda cuando es `true`: `false` ocuparía sitio sin decir nada. */
  b?: true;
  c?: Color;
}

export type TextoConFormato = Fragmento[];

/** Tope de fragmentos. El mismo que la migración 0146. */
export const MAX_FRAGMENTOS = 300;

/** ¿Las dos marcas son iguales? Decide si dos fragmentos se pueden fusionar. */
const mismasMarcas = (a: Fragmento, b: Fragmento) =>
  !!a.b === !!b.b && (a.c ?? null) === (b.c ?? null);

/**
 * Deja la lista en su forma mínima: sin vacíos y sin vecinos que digan lo mismo.
 *
 * Importa más de lo que parece. Sin esto, escribir una palabra en negrita letra
 * a letra generaría un fragmento POR LETRA, y con el tope de 300 una descripción
 * normal dejaría de poder guardarse.
 */
export function normalizar(partes: Fragmento[]): TextoConFormato {
  const out: Fragmento[] = [];
  for (const p of partes) {
    if (!p.t) continue;
    const ultimo = out[out.length - 1];
    if (ultimo && mismasMarcas(ultimo, p)) {
      ultimo.t += p.t;
      continue;
    }
    // Copia explícita, y solo con las marcas que valen: así nunca se cuela una
    // clave de más ni un `b: false` que la base rechazaría.
    const nuevo: Fragmento = { t: p.t };
    if (p.b) nuevo.b = true;
    if (p.c) nuevo.c = p.c;
    out.push(nuevo);
  }
  return out;
}

/** El texto sin marcas. Es lo que se guarda en `description` y lo que se busca. */
export function aTextoPlano(f: TextoConFormato | null | undefined): string {
  return (f ?? []).map((p) => p.t).join("");
}

/** ¿Tiene alguna marca, o es texto plano disfrazado? */
export function tieneFormato(f: TextoConFormato | null | undefined): boolean {
  return (f ?? []).some((p) => p.b || p.c);
}

/** Texto plano → estructura. Para empezar a editar una descripción de siempre. */
export function desdeTextoPlano(texto: string): TextoConFormato {
  return texto ? [{ t: texto }] : [];
}

/**
 * Valida lo que llega de fuera.
 *
 * Se usa al leer de la base: una fila puede venir de una versión anterior, de
 * una importación o de alguien que escribió por la API. Ante cualquier duda se
 * devuelve `null` y la ficha pinta el texto plano — degradar a lo simple es
 * siempre mejor que pintar algo roto.
 */
export function validar(dato: unknown): TextoConFormato | null {
  if (!Array.isArray(dato) || dato.length === 0 || dato.length > MAX_FRAGMENTOS) return null;
  const out: Fragmento[] = [];
  for (const bruto of dato) {
    if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
    const e = bruto as Record<string, unknown>;
    for (const k of Object.keys(e)) if (k !== "t" && k !== "b" && k !== "c") return null;
    if (typeof e.t !== "string") return null;
    if ("b" in e && e.b !== true) return null;
    if ("c" in e && !esColorValido(e.c)) return null;
    const f: Fragmento = { t: e.t };
    if (e.b === true) f.b = true;
    if (esColorValido(e.c)) f.c = e.c;
    out.push(f);
  }
  const limpio = normalizar(out);
  return limpio.length ? limpio : null;
}

/** Un rango de la selección, en posiciones del TEXTO PLANO. */
export interface Rango {
  desde: number;
  hasta: number;
}

/**
 * Aplica un cambio de marca al trozo seleccionado.
 *
 * Trabaja sobre posiciones del texto plano y no sobre índices de fragmentos: es
 * lo que se puede obtener de una selección del navegador sin depender de cómo
 * esté troceado el contenido por dentro.
 *
 * `marca` a `null` en `c` quita el color; `b` a `false` quita la negrita.
 */
export function aplicarMarca(
  f: TextoConFormato,
  rango: Rango,
  marca: { b?: boolean } | { c?: Color | null },
): TextoConFormato {
  const desde = Math.max(0, Math.min(rango.desde, rango.hasta));
  const hasta = Math.max(rango.desde, rango.hasta);
  if (desde === hasta) return f;

  const out: Fragmento[] = [];
  let pos = 0;

  for (const parte of f) {
    const ini = pos;
    const fin = pos + parte.t.length;
    pos = fin;

    // Fuera del rango: intacto.
    if (fin <= desde || ini >= hasta) { out.push(parte); continue; }

    // El trozo de ESTE fragmento que cae dentro de la selección. Los otros dos
    // (antes y después) conservan sus marcas: seleccionar media palabra no puede
    // cambiar la otra mitad.
    const cortaIni = Math.max(desde, ini) - ini;
    const cortaFin = Math.min(hasta, fin) - ini;

    if (cortaIni > 0) out.push({ ...parte, t: parte.t.slice(0, cortaIni) });

    const medio: Fragmento = { ...parte, t: parte.t.slice(cortaIni, cortaFin) };
    if ("b" in marca) {
      if (marca.b) medio.b = true; else delete medio.b;
    } else if ("c" in marca) {
      if (marca.c) medio.c = marca.c; else delete medio.c;
    }
    out.push(medio);

    if (cortaFin < parte.t.length) out.push({ ...parte, t: parte.t.slice(cortaFin) });
  }

  return normalizar(out);
}

/**
 * ¿Cómo está marcado lo que hay seleccionado?
 *
 * Sirve para que los botones se vean pulsados. `b` solo es `true` si TODO lo
 * seleccionado está en negrita: con media selección en negrita, el botón apagado
 * es lo correcto, porque pulsarlo va a poner en negrita el resto.
 */
export function marcasDelRango(
  f: TextoConFormato,
  rango: Rango,
): { b: boolean; c: Color | null } {
  const desde = Math.min(rango.desde, rango.hasta);
  const hasta = Math.max(rango.desde, rango.hasta);
  let pos = 0;
  const dentro: Fragmento[] = [];

  for (const parte of f) {
    const ini = pos;
    const fin = pos + parte.t.length;
    pos = fin;
    if (fin <= desde || ini >= hasta) continue;
    dentro.push(parte);
  }

  if (!dentro.length) return { b: false, c: null };
  const b = dentro.every((p) => !!p.b);
  const primero = dentro[0].c ?? null;
  const c = dentro.every((p) => (p.c ?? null) === primero) ? primero : null;
  return { b, c };
}
