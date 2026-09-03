// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0145 — postular sin poder leer a los demás.
 *
 * LO QUE REPORTÓ EL CLIENTE, desde /trabaje-con-nosotros:
 *
 *     new row violates row-level security policy for table "careers"
 *     No se pudo registrar tu postulación
 *
 * El formulario público no funcionaba PARA NADIE: la tabla tenía 0 filas.
 *
 * La causa: `submitCareer` hacía `insert(...).select("code, created_at")`, o sea
 * un INSERT ... RETURNING, y para devolver la fila hay que poder LEERLA. Esta
 * tabla no se puede leer —guarda documento, correo y teléfono de terceros— así
 * que el propio insert se bloqueaba.
 *
 * POR QUÉ NINGUNA PRUEBA LO VIO. Las que había miraban la tabla desde el usuario
 * de la migración, que puede todo, y la de la pantalla tenía `submitCareer`
 * simulado. Nadie ejercitaba el camino real. Esta prueba usa `set role`, que es
 * lo único que reproduce el fallo.
 */
const MIG_0135 = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0135_trabaje_con_nosotros.sql"),
  "utf8",
);
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0145_postular_sin_poder_leer_a_los_demas.sql"),
  "utf8",
);

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);

/** Ejecuta algo COMO ese rol, y vuelve a dejarlo como estaba. */
async function como<T>(rol: "anon" | "authenticated", sql: string): Promise<T[]> {
  await db.exec(`set role ${rol};`);
  try {
    return await q<T>(sql);
  } finally {
    await db.exec("reset role;");
  }
}

/** Lo que hacía el código antes: insertar pidiendo la fila de vuelta. */
const COMO_ERA_ANTES = `
  insert into public.careers
    (apellido_paterno, apellido_materno, nombres, doc_type, doc_number,
     email, grado, puesto, descripcion)
  values ('Perez','Ruiz','Ana','DNI','44556677','ana@correo.com','tecnico','Cajera','Experiencia')
  returning code, created_at;
`;

/** Lo que hace ahora: pedirle a la base que inserte y devuelva solo lo justo. */
const postular = (correo = "ana@correo.com", doc = "44556677") => `
  select public.postular_a_la_empresa(
    'Perez','Ruiz','Ana','DNI','${doc}','${correo}',null,'tecnico','Cajera','Experiencia'
  ) as r;
`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated;");
  await db.exec(`
    create schema if not exists auth;
    create function auth.uid() returns uuid language sql stable as 'select null::uuid';
    -- Quien postula NO es personal: es la condición del fallo.
    create function public.has_perm(p_modulo text, p_accion text) returns boolean
      language sql stable as 'select false';

    create table public.profiles (id uuid primary key);
    create table public.user_roles (user_id uuid, role text);
    create table public.notifications (
      id uuid primary key default gen_random_uuid(), user_id uuid, type text,
      title text, payload jsonb, created_at timestamptz default now()
    );
  `);

  // La tabla, tal y como quedó tras la 0135 y la 0137. Los permisos se escriben
  // a mano porque PGlite NO reproduce los `alter default privileges` de Supabase
  // (es la lección de la 0137): aquí se declara el estado REAL comprobado en
  // producción — anon solo INSERT, authenticated INSERT/SELECT/UPDATE.
  const tabla = MIG_0135.slice(
    MIG_0135.indexOf("create table if not exists public.careers"),
    MIG_0135.indexOf("-- ---------------------------------------------------------------------\n-- El aviso"),
  );
  await db.exec(tabla);
  await db.exec(`
    alter table public.careers enable row level security;
    drop policy if exists careers_public_insert on public.careers;
    create policy careers_public_insert on public.careers
      for insert to anon, authenticated with check (true);
    drop policy if exists careers_staff_select on public.careers;
    create policy careers_staff_select on public.careers
      for select using (public.has_perm('Trabaje con nosotros', 'view'));

    revoke all on public.careers from anon, authenticated;
    grant insert on public.careers to anon, authenticated;
    grant select, update on public.careers to authenticated;
    grant usage, select on all sequences in schema public to anon, authenticated;
  `);
  await db.exec(MIG);
});

beforeEach(() => db.exec("delete from public.careers;"));

describe("el fallo que se reportó", () => {
  it("SIN sesión, el insert de antes daba «permission denied»", async () => {
    // `anon` se quedó sin SELECT con la 0137, y el RETURNING lo necesita.
    await expect(como("anon", COMO_ERA_ANTES)).rejects.toThrow(/permission denied/i);
  });

  it("CON sesión, daba el mensaje EXACTO que reportó el cliente", async () => {
    // `authenticated` sí tiene el privilegio, pero la policy de lectura pide ser
    // personal. Postgres aplica las policies de SELECT al RETURNING como si
    // fueran WITH CHECK, y por eso el mensaje habla de "new row".
    await expect(como("authenticated", COMO_ERA_ANTES))
      .rejects.toThrow(/new row violates row-level security policy/i);
  });
});

describe("con la función, se puede postular", () => {
  it("sin sesión", async () => {
    const [{ r }] = await como<{ r: { code: number; created_at: string } }>("anon", postular());
    expect(r.code).toBeGreaterThan(0);
    expect(r.created_at).toBeTruthy();
  });

  it("y con sesión iniciada", async () => {
    const [{ r }] = await como<{ r: { code: number } }>("authenticated", postular());
    expect(r.code).toBeGreaterThan(0);
  });

  it("la postulación queda guardada entera", async () => {
    await como("anon", postular());
    const [fila] = await q<{ nombres: string; email: string; status: string }>(
      "select nombres, email, status from public.careers",
    );
    expect(fila).toMatchObject({ nombres: "Ana", email: "ana@correo.com", status: "nueva" });
  });

  it("devuelve SOLO el número y la fecha", async () => {
    // Lo que necesita quien postula para referirse a lo suyo por teléfono. Ni el
    // documento ni el correo vuelven a salir de la base: son datos de otros.
    const [{ r }] = await como<{ r: Record<string, unknown> }>("anon", postular());
    expect(Object.keys(r).sort()).toEqual(["code", "created_at"]);
  });

  it("el correo se guarda en minúsculas y sin espacios", async () => {
    await como("anon", `
      select public.postular_a_la_empresa(
        '  Perez ','Ruiz','  Ana ','DNI',' 44556677 ','  ANA@Correo.COM ',
        '  ','tecnico','Cajera','Experiencia');
    `);
    const [fila] = await q<{ email: string; nombres: string; phone: string | null }>(
      "select email, nombres, phone from public.careers",
    );
    expect(fila.email).toBe("ana@correo.com");
    expect(fila.nombres).toBe("Ana");
    // Un teléfono en blanco es no haberlo dejado, no una cadena vacía.
    expect(fila.phone).toBeNull();
  });

  it("no acepta una postulación sin datos", async () => {
    // La función es ahora la puerta de entrada, y un espacio en blanco cuenta
    // como texto para un `not null`.
    await expect(como("anon", `
      select public.postular_a_la_empresa('  ','Ruiz','Ana','DNI','44556677',
        'ana@correo.com',null,'tecnico','Cajera','Experiencia');
    `)).rejects.toThrow(/faltan datos obligatorios/i);
  });
});

describe("lo que NO puede cambiar", () => {
  it("el freno de la 0135 sigue mandando", async () => {
    // Tres por día y por correo. La función no lo esquiva: el trigger corre
    // igual, y su mensaje sube tal cual para que la pantalla diga "Ya tenemos tu
    // postulación" en vez de "error inesperado".
    for (let i = 0; i < 3; i++) await como("anon", postular());
    await expect(como("anon", postular()))
      .rejects.toThrow(/Ya registramos tu postulación/i);
  });

  it("y la tabla SIGUE cerrada a quien no es personal", async () => {
    // Esto es lo que costó la 0137 y no se puede perder por arreglar el envío:
    // son documento, correo y teléfono de terceros.
    await como("anon", postular());
    await expect(como("anon", "select * from public.careers"))
      .rejects.toThrow(/permission denied/i);
    // `authenticated` tiene el privilegio, pero la policy le devuelve cero filas.
    const filas = await como("authenticated", "select * from public.careers");
    expect(filas).toHaveLength(0);
  });

  it("nadie puede borrar postulaciones", async () => {
    await como("anon", postular());
    for (const rol of ["anon", "authenticated"] as const) {
      await expect(como(rol, "delete from public.careers")).rejects.toThrow(/permission denied/i);
    }
  });
});

describe("quién puede llamarla", () => {
  it("anon y authenticated sí; nadie más por defecto", async () => {
    // El formulario es público: exigir cuenta para dejar un currículum pierde a
    // la mitad de los candidatos. Y por la 0104 una función nace SIN execute,
    // así que sin el grant explícito esto daría 42501 en producción.
    for (const rol of ["anon", "authenticated"]) {
      const [{ ok }] = await q<{ ok: boolean }>(
        `select has_function_privilege('${rol}',
           'public.postular_a_la_empresa(text,text,text,text,text,text,text,text,text,text)',
           'execute') as ok`,
      );
      expect(ok).toBe(true);
    }
  });
});
