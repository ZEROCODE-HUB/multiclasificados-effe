// Limpieza de una vez: recomprime las fotos de avisos YA subidas (las que
// entraron antes de que la app comprimiera al subir) y reemplaza las gigantes.
//
// Estrategia SEGURA (nueva ruta, no sobrescribe):
//   1. baja el original           2. lo recomprime a WebP ~1600px
//   3. sube a una ruta NUEVA .webp   4. apunta la BD a la nueva
//   5. borra la vieja
// Si algo se corta a medias, en el peor caso queda un archivo huérfano; nunca
// una imagen rota, porque la BD solo se actualiza cuando la nueva ya está arriba.
//
// USO:
//   Modo prueba (no escribe nada, solo informa) — funciona con la clave normal:
//     node scripts/migrate-images.mjs
//   Aplicar de verdad — necesita el SERVICE ROLE (Dashboard > Settings > API):
//     SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/migrate-images.mjs --apply
//
// Requiere Playwright (ya está en devDependencies) para comprimir con Chromium.
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const APPLY = process.argv.includes("--apply");
const MAX_EDGE = 1600, QUALITY = 0.82;
const SKIP_IF_UNDER = 260 * 1024; // ya optimizada: no vale la pena tocarla

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
const URL_ = pick("VITE_SUPABASE_URL");
const ANON = pick("VITE_SUPABASE_ANON_KEY") || pick("VITE_SUPABASE_PUBLISHABLE_KEY");
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const WRITE_KEY = SERVICE || ANON;

if (APPLY && !SERVICE) {
  console.error("✗ Para --apply necesitas SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  console.error("  Sin él la RLS solo deja tocar tus propias fotos, no las de todos.");
  process.exit(1);
}

const rest = (path, init = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, ...init.headers } });

// 1. Todas las filas de imágenes.
const rows = await (await rest("listing_images?select=id,storage_path,url")).json();
console.log(`${rows.length} imágenes en la base.\n`);

const browser = await chromium.launch();
const page = await browser.newPage();

let recomprimidas = 0, saltadas = 0, ahorroKB = 0, fallos = 0;

for (const row of rows) {
  const src = `${URL_}/storage/v1/object/public/listing-images/${row.storage_path}`;
  const res = await fetch(src);
  if (!res.ok) { console.log(`  ✗ no se pudo bajar: ${row.storage_path}`); fallos++; continue; }
  const buf = Buffer.from(await res.arrayBuffer());

  if (buf.length < SKIP_IF_UNDER && row.storage_path.endsWith(".webp")) { saltadas++; continue; }

  // Recomprime con Chromium (mismo criterio que compressImage del front).
  const out = await page.evaluate(async ({ b64, MAX_EDGE, QUALITY }) => {
    const bin = atob(b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([arr]));
    const s = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d"); ctx.imageSmoothingQuality = "high"; ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((r) => c.toBlob(r, "image/webp", QUALITY));
    const ab = await blob.arrayBuffer();
    let out = ""; const u = new Uint8Array(ab);
    for (let i = 0; i < u.length; i++) out += String.fromCharCode(u[i]);
    return { b64: btoa(out), w, h, size: blob.size };
  }, { b64: buf.toString("base64"), MAX_EDGE, QUALITY });

  if (out.size >= buf.length) { saltadas++; continue; }
  const saved = Math.round((buf.length - out.size) / 1024);
  ahorroKB += saved;

  if (!APPLY) {
    console.log(`  [prueba] ${row.storage_path.split("/").pop()}  ${Math.round(buf.length/1024)}→${Math.round(out.size/1024)} KB (-${saved})`);
    recomprimidas++;
    continue;
  }

  // 3. Sube a ruta nueva .webp
  const newPath = row.storage_path.replace(/\.[^.]+$/, "") + ".mig.webp";
  const body = Buffer.from(out.b64, "base64");
  const up = await fetch(`${URL_}/storage/v1/object/listing-images/${newPath}`, {
    method: "POST",
    headers: { apikey: WRITE_KEY, Authorization: `Bearer ${WRITE_KEY}`, "Content-Type": "image/webp", "x-upsert": "true" },
    body,
  });
  if (!up.ok) { console.log(`  ✗ subida falló: ${newPath} (${up.status})`); fallos++; continue; }
  const newUrl = `${URL_}/storage/v1/object/public/listing-images/${newPath}`;

  // 4. Apunta la BD a la nueva
  const upd = await rest(`listing_images?id=eq.${row.id}`, {
    method: "PATCH",
    headers: { apikey: WRITE_KEY, Authorization: `Bearer ${WRITE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ storage_path: newPath, url: newUrl }),
  });
  if (!upd.ok) { console.log(`  ✗ BD no actualizada: ${row.id}`); fallos++; continue; }

  // 5. Borra la vieja (ya nadie la referencia)
  await fetch(`${URL_}/storage/v1/object/listing-images/${row.storage_path}`, {
    method: "DELETE",
    headers: { apikey: WRITE_KEY, Authorization: `Bearer ${WRITE_KEY}` },
  });
  console.log(`  ✓ ${newPath.split("/").pop()}  -${saved} KB`);
  recomprimidas++;
}

await browser.close();
console.log(`\n${APPLY ? "APLICADO" : "PRUEBA (nada escrito)"}: ${recomprimidas} recomprimidas, ${saltadas} ya estaban bien, ${fallos} fallos.`);
console.log(`Ahorro total: ${(ahorroKB / 1024).toFixed(1)} MB.`);
if (!APPLY && recomprimidas) console.log(`\nPara aplicar de verdad:\n  SUPABASE_SERVICE_ROLE_KEY=<tu_clave> node scripts/migrate-images.mjs --apply`);
