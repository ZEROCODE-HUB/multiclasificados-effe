// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * 0103 — cerrar los RPC internos que cualquiera podía llamar.
 *
 * Esta prueba no monta un Postgres: comprueba una CORRESPONDENCIA que ninguna
 * base de datos puede verificar por sí sola —qué llama el código frente a qué
 * permite la base—, y que es justo donde está el riesgo de esta migración.
 *
 * Cierra las dos formas de equivocarse:
 *
 *   · Revocar algo que el navegador sí llama → la aplicación deja de funcionar
 *     para todo el mundo, y no se nota hasta que alguien usa esa pantalla.
 *   · Revocar algo que llama una Edge Function sin devolverle el permiso a
 *     `service_role` → al quitar el de PUBLIC lo pierde también, y el cobro o
 *     la emisión se caen en producción.
 *
 * Y sigue vigilando en el futuro: si alguien añade un `supabase.rpc(...)` a una
 * función revocada, esto falla antes de llegar a producción.
 */

const raiz = path.resolve(__dirname, "../..");
const migracion = fs.readFileSync(
  path.join(raiz, "supabase/migrations/0103_rpc_solo_para_quien_debe.sql"),
  "utf8",
);

/** Nombres que aparecen en un `revoke execute on function public.X(...)`. */
function nombresDe(sql: string, verbo: "revoke" | "grant"): Set<string> {
  const re = new RegExp(`${verbo}\\s+execute\\s+on\\s+function\\s+public\\.([a-z_0-9]+)\\s*\\(`, "gi");
  const out = new Set<string>();
  for (const m of sql.matchAll(re)) out.add(m[1].toLowerCase());
  return out;
}

const REVOCADAS = nombresDe(migracion, "revoke");
const CONCEDIDAS = nombresDe(migracion, "grant");

/** Recorre un directorio y devuelve el contenido de los ficheros que interesan. */
function leerTodo(dir: string, extensiones: string[]): string {
  const trozos: string[] = [];
  const andar = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "test") continue;
        andar(p);
      } else if (extensiones.some((x) => e.name.endsWith(x))) {
        trozos.push(fs.readFileSync(p, "utf8"));
      }
    }
  };
  andar(dir);
  return trozos.join("\n");
}

/** Los nombres pasados a `supabase.rpc("...")` / `.rpc('...')`. */
function rpcsDe(codigo: string): Set<string> {
  const out = new Set<string>();
  for (const m of codigo.matchAll(/\.rpc\(\s*["'`]([a-z_0-9]+)["'`]/gi)) {
    out.add(m[1].toLowerCase());
  }
  return out;
}

const DEL_NAVEGADOR = rpcsDe(leerTodo(path.join(raiz, "src"), [".ts", ".tsx"]));
const DE_LAS_FUNCIONES = rpcsDe(leerTodo(path.join(raiz, "supabase/functions"), [".ts"]));

describe("0103 · qué se cierra y qué no", () => {
  it("cierra las que no tenían ninguna guarda", () => {
    // Las cuatro comprobadas contra producción: el secreto del worker se podía
    // LEER sin sesión, y notify_user llegaba a escribir en la campana ajena.
    for (const f of [
      "invoice_worker_secret",
      "next_invoice_number",
      "notify_user",
      "dispatch_invoice_emission",
      "run_saved_search_alerts",
      "expire_listings",
    ]) {
      expect(REVOCADAS, `${f} tiene que quedar cerrada`).toContain(f);
    }
  });

  it("revoca de PUBLIC, de anon y de authenticated, no solo de uno", () => {
    // Revocar solo de `anon` dejaría el agujero abierto para cualquiera que se
    // registre, que es gratis y automático.
    // Solo las revocaciones sobre una función concreta; la de privilegios por
    // defecto del final tiene otra forma y se comprueba aparte.
    const revocaciones = migracion.match(/revoke\s+execute\s+on\s+function\s+public\.[\s\S]*?;/gi) ?? [];
    expect(revocaciones.length).toBeGreaterThan(15);
    for (const r of revocaciones) {
      expect(r).toMatch(/from\s+public,\s*anon,\s*authenticated/i);
    }
  });

  it("NO cierra ninguna de las que llama el navegador", () => {
    const rotas = [...REVOCADAS].filter((f) => DEL_NAVEGADOR.has(f));
    expect(rotas, `el front llama a: ${rotas.join(", ")}`).toEqual([]);
  });

  it("deja abiertas las tres que usan las políticas RLS", () => {
    // categories, subcategories, pricing_settings, promotions y
    // invoice_emission_attempts tienen políticas que invocan has_perm. Una
    // política se evalúa con los permisos de quien consulta: sin EXECUTE, el
    // panel entero deja de poder escribir.
    for (const f of ["has_perm", "is_staff", "has_role"]) {
      expect(REVOCADAS, `${f} NO se puede cerrar: la usan políticas RLS`).not.toContain(f);
    }
  });

  it("a lo que llaman las Edge Functions le devuelve el permiso a service_role", () => {
    // Al revocar de PUBLIC, service_role también lo pierde: no es superusuario,
    // solo se salta la RLS.
    const huerfanas = [...REVOCADAS].filter(
      (f) => DE_LAS_FUNCIONES.has(f) && !CONCEDIDAS.has(f),
    );
    expect(huerfanas, `sin grant a service_role: ${huerfanas.join(", ")}`).toEqual([]);
  });

  it("effe_listing_cost sigue siendo llamable por create-payment", () => {
    // Es el caso concreto del punto anterior: sin este grant, "pagar y
    // publicar" deja de poder calcular lo que falta cobrar.
    expect(DE_LAS_FUNCIONES).toContain("effe_listing_cost");
    expect(REVOCADAS).toContain("effe_listing_cost");
    expect(CONCEDIDAS).toContain("effe_listing_cost");
  });

  it("las funciones de disparador quedan fuera de la API", () => {
    for (const f of ["handle_new_user", "on_new_message", "recalc_user_rating"]) {
      expect(REVOCADAS).toContain(f);
    }
  });

});

describe("0104 · que las próximas nazcan cerradas", () => {
  const m104 = fs.readFileSync(
    path.join(raiz, "supabase/migrations/0104_privilegios_por_defecto.sql"),
    "utf8",
  );
  // Solo las sentencias, sin el encabezado: los comentarios explican el intento
  // fallido de la 0103 y contienen texto que confundiría a las expresiones.
  const sentencias = m104
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

  it("revoca en los DOS niveles, que es lo que falló en la 0103", () => {
    // El del esquema por sí solo no quita nada: PostgreSQL rellena el nivel
    // global ausente con acldefault(), que vuelve a meter a PUBLIC.
    const plano = sentencias.replace(/\s+/g, " ");
    expect(plano, "falta la revocación GLOBAL (sin 'in schema')")
      .toMatch(/alter default privileges for role %I revoke execute on functions/i);
    expect(plano, "falta la revocación del ESQUEMA")
      .toMatch(/alter default privileges for role %I in schema public/i);
  });

  it("cierra a anon y a authenticated, no solo a PUBLIC", () => {
    expect(sentencias.replace(/\s+/g, " ")).toMatch(
      /revoke execute on functions from public, anon, authenticated/i,
    );
  });

  it("NO se lo quita a service_role: las Edge Functions entran con ese rol", () => {
    expect(sentencias).not.toMatch(/revoke[^;]*service_role/i);
  });

  it("avisa en voz alta si no se pudo aplicar", () => {
    // Dar por hecha una protección que no está fue justo el error de la 0103.
    expect(m104).toMatch(/raise warning/i);
  });
});
