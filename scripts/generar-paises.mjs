// Genera `src/data/paises.ts` con los 249 países de la ISO 3166-1.
//
// Se ejecuta A MANO (`node scripts/generar-paises.mjs`) y su resultado se
// commitea: no entra en el build. Los nombres salen de `Intl.DisplayNames` en
// español, que es quien sabe que RO es "Rumanía" y CI "Côte d'Ivoire", así que
// no hay 249 nombres tecleados a mano que se puedan escribir mal.
//
// Los países que ya tenían zona horaria y centro del mapa CONSERVAN esos datos:
// son los que hacen funcionar la deducción por zona horaria y el recentrado.
import { writeFileSync, readFileSync } from "node:fs";

// Lista oficial ISO 3166-1 alpha-2 (los 249 códigos asignados).
const ISO = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT
JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ
UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(/\s+/).filter(Boolean);

const RUTA = "src/data/paises.ts";
const actual = readFileSync(RUTA, "utf8");

// Rescata `zonas` y `centro` de los países que ya estaban en el catálogo.
const previos = new Map();
for (const m of actual.matchAll(/\{ code: "(\w\w)", nombre: "[^"]*",\s*(zonas: \[[^\]]*\])(?:,\s*(centro: \{[^}]*\}))? \}/g)) {
  previos.set(m[1], { zonas: m[2], centro: m[3] ?? null });
}

const dn = new Intl.DisplayNames(["es"], { type: "region" });
const nombre = (c) => {
  const n = dn.of(c);
  if (!n || n === c) throw new Error(`Sin nombre para ${c}`);
  return n;
};

const cmp = new Intl.Collator("es").compare;
const resto = ISO.filter((c) => c !== "PE").sort((a, b) => cmp(nombre(a), nombre(b)));

const linea = (c) => {
  const p = previos.get(c);
  const partes = [`code: "${c}"`, `nombre: ${JSON.stringify(nombre(c))}`];
  if (p) {
    partes.push(p.zonas);
    if (p.centro) partes.push(p.centro);
  }
  return `  { ${partes.join(", ")} },`;
};

const cabecera = actual.slice(0, actual.indexOf("export const PAISES"));
const salida = cabecera +
  `// Perú primero (es el país de la plataforma); el resto, alfabético en español.\n` +
  `export const PAISES: Pais[] = [\n` +
  [ "PE", ...resto ].map(linea).join("\n") +
  `\n];\n`;

writeFileSync(RUTA, salida);
console.log(`${ISO.length} países; con zona horaria: ${previos.size}`);
