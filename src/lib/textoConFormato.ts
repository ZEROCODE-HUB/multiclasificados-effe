/**
 * Descripción con negrita y color.
 *
 * EL MODELO. Una lista de fragmentos de texto, cada uno con dos marcas
 * opcionales. Nada más:
 *
 *     [{ t: "Depa " }, { t: "amoblado", b: true }, { t: " en Lima", c: "rojo" }]
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
 * Los colores que se ofrecen. `null` es el color normal del texto.
 *
 * El `hex` no es decorativo: el editor pinta con color en línea —es lo que
 * produce el navegador al dar formato— y al guardar se traduce de vuelta a este
 * nombre. Por eso tiene que ser EXACTAMENTE el mismo tono que la clase, o lo que
 * se escribe se vería distinto de lo que se publica.
 *
 * Los dos primeros salen de la marca (`--primary` y `--secondary` de index.css);
 * los otros dos son los semáforos de siempre. Cuatro más el normal: suficiente
 * para destacar sin convertir el listado en un semáforo.
 */
export const COLORES = [
  { valor: null, nombre: "Normal", clase: "text-foreground/85", hex: "#29303d" },
  { valor: "azul", nombre: "Azul", clase: "text-primary", hex: "#162950" },
  { valor: "naranja", nombre: "Naranja", clase: "text-secondary", hex: "#bd4e05" },
  { valor: "verde", nombre: "Verde", clase: "text-emerald-600", hex: "#059669" },
  { valor: "rojo", nombre: "Rojo", clase: "text-red-600", hex: "#dc2626" },
] as const;

export type Color = "azul" | "naranja" | "verde" | "rojo";

/** El tono exacto con el que el editor pinta cada color. */
export function hexDeColor(c: Color | null | undefined): string {
  return COLORES.find((x) => x.valor === (c ?? null))?.hex ?? COLORES[0].hex;
}

/** Los valores admitidos, para validar sin repetir la lista a mano. */
const VALIDOS = new Set<string>(
  COLORES.map((c) => c.valor).filter((v): v is Color => v !== null),
);

/** La clase de Tailwind de cada color. El renderizador no decide colores. */
export function claseDeColor(c: Color | null | undefined): string {
  return COLORES.find((x) => x.valor === (c ?? null))?.clase ?? COLORES[0].clase;
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
    if ("c" in e && (typeof e.c !== "string" || !VALIDOS.has(e.c))) return null;
    const f: Fragmento = { t: e.t };
    if (e.b === true) f.b = true;
    if (typeof e.c === "string") f.c = e.c as Color;
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
