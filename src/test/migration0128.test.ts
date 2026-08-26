// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0128 — B-09: responder un reclamo deja constancia.
 *
 * El Reglamento del Libro de Reclamaciones obliga a responder en treinta días
 * Y A PODER ACREDITARLO. Un correo enviado desde la bandeja de alguien no es un
 * registro: si esa persona se va, o borra el hilo, la constancia se va con ella.
 *
 * Por eso la respuesta se guarda ANTES de enviarse, y el envío va aparte. Si el
 * correo falla, el expediente está completo y se reintenta; al revés dejaría un
 * consumidor respondido y un registro vacío.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0128_responder_reclamos.sql"),
  "utf8",
);

const STAFF = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID = "11111111-1111-4111-8111-111111111111";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const responder = (texto: string, estado = "resuelto") =>
  q<{ responder_reclamo: Record<string, unknown> }>(
    `select public.responder_reclamo('${ID}', '${texto}', '${estado}') as responder_reclamo`);
const leer = async () =>
  (await q<{ respuesta: string; status: string; respondida_at: string | null; respondida_por: string | null }>(
    `select respuesta, status, respondida_at, respondida_por from public.complaints where id = '${ID}'`))[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key);
    insert into auth.users values ('${STAFF}');

    create table public.complaints (
      id uuid primary key,
      code bigint, kind text, full_name text, email text,
      status text not null default 'pendiente',
      created_at timestamptz default now()
    );

    create function auth.uid() returns uuid language sql stable as $$ select '${STAFF}'::uuid $$;
    create function public.has_perm(_m text, _a text) returns boolean language sql stable as $$ select true $$;
    create function public.is_staff(_u uuid) returns boolean language sql stable as $$ select true $$;
    create table public.auditoria (accion text, objeto text);
    create function public.log_audit(a text, t text, o text, d jsonb) returns void
      language sql as $$ insert into public.auditoria values (a, o) $$;
  `);
  await db.exec(MIG);
});

beforeEach(() => db.exec(`
  delete from public.auditoria; delete from public.complaints;
  insert into public.complaints (id, code, kind, full_name, email)
  values ('${ID}', 7, 'reclamo', 'Ana Quispe', 'ana@ejemplo.pe');
`));

describe("la respuesta queda registrada", () => {
  it("con su texto, su fecha y quien la dio", async () => {
    await responder("Se repuso el servicio.");
    const f = await leer();
    expect(f.respuesta).toBe("Se repuso el servicio.");
    expect(f.respondida_at).not.toBeNull();
    expect(f.respondida_por).toBe(STAFF);
  });

  it("y el reclamo pasa a resuelto", async () => {
    await responder("Listo.");
    expect((await leer()).status).toBe("resuelto");
  });

  it("se puede responder sin cerrarlo, si aún falta gestión", async () => {
    await responder("Estamos revisándolo.", "en_proceso");
    expect((await leer()).status).toBe("en_proceso");
  });

  it("queda en auditoría: hay que poder decir quién respondió qué", async () => {
    await responder("Listo.");
    const a = await q<{ accion: string }>(`select accion from public.auditoria`);
    expect(a[0].accion).toBe("answer_complaint");
  });
});

describe("devuelve los datos para el correo", () => {
  it("el destinatario y el número de hoja, sin volver a consultar", async () => {
    const r = (await responder("Listo."))[0].responder_reclamo;
    expect(r.email).toBe("ana@ejemplo.pe");
    expect(Number(r.code)).toBe(7);
    expect(r.full_name).toBe("Ana Quispe");
  });
});

describe("lo que no deja pasar", () => {
  it("una respuesta vacía: el expediente quedaría con un hueco", async () => {
    await expect(responder("   ")).rejects.toThrow(/vacía/i);
  });

  it("un estado inventado", async () => {
    await expect(responder("Listo.", "archivado")).rejects.toThrow(/no válido/i);
  });

  it("responder a un reclamo que no existe", async () => {
    await db.exec(`delete from public.complaints;`);
    await expect(responder("Listo.")).rejects.toThrow(/no encontrado/i);
  });
});

describe("el envío se marca aparte", () => {
  it("para poder reintentarlo sin reescribir la respuesta", async () => {
    // El texto ya está guardado: si el correo falla, no se pierde nada.
    await responder("Listo.");
    await q(`select public.marcar_envio_respuesta('${ID}', 'error', 'Resend cayó')`);
    const f = (await q<{ s: string; e: string }>(
      `select respuesta_email_status as s, respuesta_email_error as e
         from public.complaints where id = '${ID}'`))[0];
    expect(f.s).toBe("error");
    expect(f.e).toBe("Resend cayó");
    expect((await leer()).respuesta).toBe("Listo.");
  });
});
