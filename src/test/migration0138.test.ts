// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * 0138 — los privilegios que Supabase concede solos.
 *
 * OJO, Y ES TODO EL PUNTO DE ESTE ARCHIVO: **PGlite no reproduce los
 * `alter default privileges` de Supabase**, así que aquí NO se puede comprobar
 * el efecto de la migración levantando una base. Una prueba que hiciera
 * `has_table_privilege` en PGlite pasaría igual sin la migración, que es
 * exactamente el error que dejó `careers` abierta en producción hasta la 0137.
 *
 * Lo que sí se puede vigilar es que las revocaciones sigan escritas. Comprobado
 * a mano contra el proyecto real el 1-sep-2026, después de aplicarla:
 *
 *   invoice_series → anon: select/update/delete = false · authenticated: delete = false
 *   reports        → anon: select/update/delete = false · authenticated: delete = false
 *   reports        → authenticated: insert/select/update = true  (lo que usa la app)
 *
 * Y que la emisión sigue funcionando: `next_invoice_number` es SECURITY DEFINER
 * y de `postgres`, así que no depende de estos permisos. Verificado creando una
 * función definer equivalente y llamándola con `set role authenticated`.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0138_privilegios_que_sobran.sql"),
  "utf8",
);

const sinComentarios = MIG.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

describe("el correlativo de SUNAT", () => {
  it("deja de estar al alcance de la llave anónima", () => {
    // Era la única tabla de `public` SIN RLS, y `anon` tenía select, insert,
    // update y delete. Sin RLS debajo eso no es un cinturón de más que falta:
    // es la puerta. Con la llave anónima —que viaja en el paquete de la web—
    // se podía retroceder el correlativo de una serie ya declarada a SUNAT.
    expect(sinComentarios).toMatch(
      /revoke\s+all\s+on\s+public\.invoice_series\s+from\s+anon,\s*authenticated/i,
    );
  });

  it("y no se le vuelve a conceder nada", () => {
    // Nadie la toca desde el cliente: solo `next_invoice_number` y
    // `next_credit_note_number`, que son SECURITY DEFINER.
    expect(sinComentarios).not.toMatch(/grant[^;]*\bon\s+public\.invoice_series\b/i);
  });
});

describe("los reportes, que desde la 0136 llevan DNI", () => {
  it("se revoca todo antes de volver a conceder", () => {
    // Un `grant` explícito no quita lo que ya estaba dado: hay que revocar.
    expect(sinComentarios).toMatch(
      /revoke\s+all\s+on\s+public\.reports\s+from\s+anon,\s*authenticated/i,
    );
  });

  it("queda exactamente lo que usa la aplicación", () => {
    expect(sinComentarios).toMatch(/grant\s+insert\s+on\s+public\.reports\s+to\s+authenticated/i);
    expect(sinComentarios).toMatch(/grant\s+select,\s*update\s+on\s+public\.reports\s+to\s+authenticated/i);
  });

  it("anon no recupera el INSERT, porque nunca le sirvió", () => {
    // La policy `reports_insert_auth` exige `auth.uid() is not null`, así que el
    // INSERT que Supabase le había dado a `anon` no llegaba a ejecutarse jamás.
    const grants = sinComentarios.match(/grant[^;]*\bon\s+public\.reports\b[^;]*/gi) ?? [];
    expect(grants.length).toBeGreaterThan(0);
    expect(grants.some((g) => /\banon\b/.test(g))).toBe(false);
  });

  it("nadie puede borrar una denuncia", () => {
    // Se resuelve, no se destruye: quien la cierra hoy puede tener que explicar
    // mañana por qué.
    const grants = sinComentarios.match(/grant[^;]*\bon\s+public\.reports\b[^;]*/gi) ?? [];
    expect(grants.some((g) => /\bdelete\b|\ball\b/i.test(g))).toBe(false);
  });
});

describe("lo que la migración deja dicho", () => {
  it("las dos tablas quedan documentadas", () => {
    expect(sinComentarios).toMatch(/comment on table public\.invoice_series/i);
    expect(sinComentarios).toMatch(/comment on table public\.reports/i);
  });

  it("y anota que las otras 32 tablas siguen pendientes", () => {
    // No es un olvido: un revoke de más en `listings` o `profiles` apaga la web
    // pública, así que no se hace en bloque. Si alguien borra el aviso, esto
    // salta.
    expect(MIG).toMatch(/32 tablas/i);
  });
});
