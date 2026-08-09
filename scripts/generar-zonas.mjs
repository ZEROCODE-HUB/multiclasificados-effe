// Genera src/data/zonas.ts: el catálogo de zonas del Perú que se usa al publicar
// un aviso y al buscar por cercanía.
//
//   node scripts/generar-zonas.mjs
//
// Entran los 1.874 DISTRITOS del país, cada uno con las coordenadas de su
// capital. Se probó primero con las provincias (196) y los distritos solo de
// Lima y Callao, pero dejaba a cada ciudad de provincia como un punto único:
// en Arequipa, que tiene 29 distritos, alguien en Cayma veía un aviso de
// Socabaya como si estuviera en su esquina. Al ser un archivo y no una consulta,
// tenerlo completo no cuesta más que tenerlo a medias.
//
// Va en formato compacto (una línea por distrito, campos separados por "|") y se
// interpreta al vuelo la primera vez que se usa: como lista de objetos ocupaba
// más del triple.
//
// Fuentes (dominio público):
//   · Nombres oficiales — github.com/ernestorivero/Ubigeo-Peru (INEI 2016)
//   · Coordenadas       — github.com/jmcastagnetto/ubigeo-peru-aumentado
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(RAIZ, "src", "data", "zonas.ts");

const NOMBRES = "https://raw.githubusercontent.com/ernestorivero/Ubigeo-Peru/master/json";
const COORDS =
  "https://raw.githubusercontent.com/jmcastagnetto/ubigeo-peru-aumentado/main/ubigeo_distrito.csv";

const bajarJson = async (nombre) => {
  const res = await fetch(`${NOMBRES}/ubigeo_peru_2016_${nombre}.json`);
  if (!res.ok) throw new Error(`No se pudo bajar ${nombre}: ${res.status}`);
  return res.json();
};

// El CSV trae comas dentro de algunos campos; se parte respetando comillas.
function filasCsv(texto) {
  const lineas = texto.trim().split(/\r?\n/);
  const cabecera = lineas[0].split(",");
  return lineas.slice(1).map((linea) => {
    const celdas = linea.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, ""));
    return Object.fromEntries(cabecera.map((k, i) => [k, celdas[i]]));
  });
}

// Algunos nombres del origen traen espacios de sobra ("Bellavista ").
const limpiar = (filas) => filas.map((f) => ({ ...f, name: f.name.trim() }));

const departamentos = limpiar(await bajarJson("departamentos"));
const provincias = limpiar(await bajarJson("provincias"));
const distritos = limpiar(await bajarJson("distritos"));
const csv = filasCsv(await (await fetch(COORDS)).text());

// ubigeo del distrito → coordenadas de su capital.
const puntoDe = new Map(
  csv.map((f) => [f.inei, { lat: Number(f.latitude), lng: Number(f.longitude) }]),
);
const nombreDepto = new Map(departamentos.map((d) => [d.id, d.name]));

const nombreProv = new Map(provincias.map((p) => [p.id, p.name]));

const valido = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const zonas = [];
for (const dist of distritos) {
  let punto = puntoDe.get(dist.id);
  if (!valido(punto)) {
    // Un par de distritos vienen sin coordenadas en el origen. Antes que
    // dejarlos fuera del catálogo —y que su gente no pueda elegir su distrito—
    // se les da el punto de la capital de su provincia: en la codificación del
    // INEI, el distrito 01 de cada provincia.
    punto = puntoDe.get(`${dist.province_id}01`);
    if (!valido(punto)) {
      console.warn(`Sin coordenadas ni propias ni de su provincia: ${dist.name} (${dist.id}); se omite.`);
      continue;
    }
    console.warn(`${dist.name} (${dist.id}) no trae coordenadas; se usa la capital de su provincia.`);
  }
  const provincia = nombreProv.get(dist.province_id) ?? "";
  const departamento = nombreDepto.get(dist.department_id) ?? "";
  // El origen escribe el mismo lugar de dos formas según la tabla: el distrito
  // capital de Huánuco viene como "Huanuco" y su provincia como "Huánuco". Sin
  // unificarlo, la etiqueta salía "Huanuco, Huánuco" — el mismo nombre repetido
  // y encima mal escrito. Cuando coinciden salvo tildes, manda la forma de
  // arriba, que es la que trae la ortografía oficial.
  const igual = (a, b) => a && b && sinTildes(a) === sinTildes(b);
  const nombre = igual(dist.name, provincia) ? provincia : dist.name;

  zonas.push({
    id: dist.id,
    nombre,
    provincia: igual(provincia, departamento) ? departamento : provincia,
    departamento,
    ...punto,
  });
}

// Cómo se nombra cada zona. Se encadenan distrito → provincia → departamento
// quitando las repeticiones, porque el distrito capital suele llamarse igual que
// su provincia y "Arequipa, Arequipa" no dice nada:
//   Miraflores / Lima / Lima      → "Miraflores, Lima"
//   Arequipa / Arequipa / Arequipa → "Arequipa"
//   Cayma / Arequipa / Arequipa    → "Cayma, Arequipa"
// Si aun así dos zonas coincidieran, se les añade el siguiente nivel: la
// etiqueta identifica la zona dentro del texto del aviso, así que no puede
// repetirse o al editar no se sabría cuál era.
const partesDe = (z) => [...new Set([z.nombre, z.provincia, z.departamento].filter(Boolean))];
const etiquetaDe = (z, niveles = 2) => partesDe(z).slice(0, niveles).join(", ");

const porEtiqueta = new Map();
for (const z of zonas) {
  const lista = porEtiqueta.get(etiquetaDe(z)) ?? [];
  lista.push(z);
  porEtiqueta.set(etiquetaDe(z), lista);
}
for (const [, lista] of porEtiqueta) {
  if (lista.length > 1) for (const z of lista) z.niveles = 3;
}

const etiquetas = new Set();
for (const z of zonas) {
  const etiqueta = etiquetaDe(z, z.niveles ?? 2);
  if (etiquetas.has(etiqueta)) throw new Error(`Etiqueta repetida sin forma de distinguirla: "${etiqueta}"`);
  etiquetas.add(etiqueta);
}

// Controles antes de escribir nada. Los datos vienen de terceros y ya han
// llegado sucios más de una vez (espacios de sobra, el mismo sitio escrito con y
// sin tilde según la tabla, distritos sin coordenadas). Cualquiera de estos
// fallos se vería como una zona rara en el selector o como un aviso colocado en
// otra región, así que el generador se planta aquí en vez de escribir el archivo.
const problemas = [];
const PERU = { latMin: -18.4, latMax: -0.03, lngMin: -81.4, lngMax: -68.6 };

for (const z of zonas) {
  const donde = `${z.nombre} (${z.id})`;
  for (const [campo, valor] of [["nombre", z.nombre], ["provincia", z.provincia], ["departamento", z.departamento]]) {
    if (!valor) problemas.push(`${donde}: sin ${campo}`);
    else if (valor !== valor.trim()) problemas.push(`${donde}: ${campo} con espacios de sobra ("${valor}")`);
  }
  if (!/^\d{6}$/.test(z.id)) problemas.push(`${donde}: el ubigeo no tiene 6 dígitos`);
  if (!Number.isFinite(z.lat) || !Number.isFinite(z.lng)) problemas.push(`${donde}: coordenadas no numéricas`);
  else if (z.lat < PERU.latMin || z.lat > PERU.latMax || z.lng < PERU.lngMin || z.lng > PERU.lngMax) {
    problemas.push(`${donde}: coordenadas fuera del Perú (${z.lat}, ${z.lng})`);
  }
  // El separador del formato compacto no puede aparecer en los datos.
  if ([z.nombre, z.provincia, z.departamento].some((v) => v.includes("|"))) {
    problemas.push(`${donde}: contiene el carácter "|", que separa los campos`);
  }
}

const ids = new Set();
for (const z of zonas) {
  if (ids.has(z.id)) problemas.push(`ubigeo repetido: ${z.id}`);
  ids.add(z.id);
}

if (zonas.length < 1800) problemas.push(`solo ${zonas.length} zonas: el país tiene 1.874 distritos`);

if (problemas.length) {
  console.error(`\nEl catálogo no se escribió, hay ${problemas.length} problema(s):`);
  for (const p of problemas.slice(0, 20)) console.error(`  · ${p}`);
  if (problemas.length > 20) console.error(`  … y ${problemas.length - 20} más`);
  process.exit(1);
}

zonas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

// id|nombre|provincia|departamento|lat|lng — y un "3" al final cuando la
// etiqueta necesita los tres niveles para no repetirse.
const filas = zonas
  .map((z) =>
    [z.id, z.nombre, z.provincia, z.departamento, z.lat.toFixed(5), z.lng.toFixed(5), z.niveles === 3 ? "3" : ""]
      .join("|")
      .replace(/\|+$/, ""),
  )
  .join("\n");

await fs.writeFile(
  SALIDA,
  `// GENERADO por scripts/generar-zonas.mjs — no editar a mano.
//
// Los ${zonas.length} distritos del Perú con las coordenadas de su capital. Es lo que
// permite que un aviso tenga siempre ubicación y que quien no da permiso de
// GPS pueda igual ver lo que tiene cerca.
//
// Fuentes: nombres oficiales del INEI 2016 y coordenadas de las capitales.
//
// Formato compacto (id|nombre|provincia|departamento|lat|lng[|3]) que se
// interpreta la primera vez que se usa: como lista de objetos ocupaba más del
// triple. El "3" final marca las pocas zonas que necesitan los tres niveles en
// su etiqueta para no confundirse con otra.

export interface Zona {
  /** Código de ubigeo del INEI (6 dígitos). */
  id: string;
  nombre: string;
  provincia: string;
  departamento: string;
  lat: number;
  lng: number;
  /** Cuántos niveles lleva su etiqueta: 2 (lo normal) o 3 si hace falta. */
  niveles: 2 | 3;
}

const CRUDO = \`${filas}\`;

let cache: Zona[] | null = null;

/** Los distritos del país. Se interpretan una sola vez, al primer uso. */
export function zonas(): Zona[] {
  if (cache) return cache;
  cache = CRUDO.split("\\n").map((linea) => {
    const [id, nombre, provincia, departamento, lat, lng, niveles] = linea.split("|");
    return {
      id,
      nombre,
      provincia,
      departamento,
      lat: Number(lat),
      lng: Number(lng),
      niveles: niveles === "3" ? 3 : 2,
    } as Zona;
  });
  return cache;
}
`,
  "utf8",
);

console.log(`${zonas.length} zonas escritas en src/data/zonas.ts`);
