// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0125 — «Reintentar» daba UN intento, no ocho.
 *
 * La emisión automática se rinde a los 8 intentos y marca el comprobante como
 * `vencido`. El reintento manual devolvía el estado a `pendiente` pero no tocaba
 * el contador, así que uno que ya llevaba 8 volvía a la cola con 8: al primer
 * fallo cruzaba otra vez el umbral y regresaba a `vencido`.
 *
 * Lo caro no es el botón que promete de más, es cuándo se usa: el caso normal es
 * que el problema de fondo YA esté resuelto —se dio de alta el RUC en Factiliza,
 * por ejemplo— y entonces el comprobante se da por perdido sin haber usado su
 * margen. En producción había dos con 57 y 60 intentos acumulados de pulsar una
 * y otra vez, cada tanda de uno.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0125_reintentar_empieza_de_cero.sql"),
  "utf8",
);

const ID = "11111111-1111-4111-8111-111111111111";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);

type Fila = {
  sunat_status: string; sunat_attempts: number;
  email_status: string; email_attempts: number;
  needs_review: boolean;
};
const leer = async () =>
  (await q<Fila>(`select sunat_status, sunat_attempts, email_status, email_attempts, needs_review
                    from public.invoices where id = '${ID}'`))[0];

const sembrar = (estado: string, intentos: number, email = "pendiente", emailIntentos = 0) =>
  db.exec(`
    delete from public.invoices;
    insert into public.invoices (id, sunat_status, sunat_attempts, email_status, email_attempts, needs_review)
    values ('${ID}', '${estado}', ${intentos}, '${email}', ${emailIntentos}, true);
  `);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role service_role;

    create table public.invoices (
      id uuid primary key,
      sunat_status text not null,
      sunat_attempts int not null default 0,
      sunat_next_try_at timestamptz,
      sunat_claim_id uuid,
      email_status text not null default 'pendiente',
      email_attempts int not null default 0,
      email_next_try_at timestamptz,
      email_claim_id uuid,
      needs_review boolean not null default false
    );

    -- Permiso y emisión activados: lo que se prueba aquí es el contador.
    create function public.has_perm(_m text, _a text) returns boolean
      language sql stable as $$ select true $$;
    create function public.invoice_emission_enabled() returns boolean
      language sql stable as $$ select true $$;
    create function public.dispatch_invoice_emission(p uuid) returns void
      language sql as $$ select null::void $$;
  `);
  await db.exec(MIG);
});

beforeEach(() => sembrar("vencido", 8));

describe("el contador vuelve a cero", () => {
  it("un comprobante agotado recupera sus ocho intentos", async () => {
    await q(`select public.retry_invoice_emission('${ID}')`);
    const f = await leer();
    expect(f.sunat_status).toBe("pendiente");
    expect(f.sunat_attempts).toBe(0);
  });

  it("y deja de estar marcado para revisión", async () => {
    await q(`select public.retry_invoice_emission('${ID}')`);
    expect((await leer()).needs_review).toBe(false);
  });

  it("lo mismo para un rechazado", async () => {
    await sembrar("rechazado", 3);
    await q(`select public.retry_invoice_emission('${ID}')`);
    const f = await leer();
    expect(f.sunat_status).toBe("pendiente");
    expect(f.sunat_attempts).toBe(0);
  });

  it("el contador del correo también, si vuelve a la cola", async () => {
    await sembrar("vencido", 8, "error", 5);
    await q(`select public.retry_invoice_emission('${ID}')`);
    const f = await leer();
    expect(f.email_status).toBe("pendiente");
    expect(f.email_attempts).toBe(0);
  });
});

describe("lo que NO puede tocar", () => {
  it("un comprobante ACEPTADO no vuelve a la cola ni pierde su historial", async () => {
    // Reintentar sobre uno ya aceptado no debe reabrirlo: está emitido y
    // declarado. Y borrarle el contador de intentos sería borrar su historia.
    await sembrar("aceptado", 4);
    await q(`select public.retry_invoice_emission('${ID}')`);
    const f = await leer();
    expect(f.sunat_status).toBe("aceptado");
    expect(f.sunat_attempts).toBe(4);
  });

  it("ni el contador del correo si ya se envió", async () => {
    await sembrar("aceptado", 1, "sent", 2);
    await q(`select public.retry_invoice_emission('${ID}')`);
    const f = await leer();
    expect(f.email_status).toBe("sent");
    expect(f.email_attempts).toBe(2);
  });
});

describe("la migración se puede volver a aplicar", () => {
  it("dos veces seguidas y sigue funcionando", async () => {
    await db.exec(MIG);
    await db.exec(MIG);
    await sembrar("vencido", 8);
    await q(`select public.retry_invoice_emission('${ID}')`);
    expect((await leer()).sunat_attempts).toBe(0);
  });
});
