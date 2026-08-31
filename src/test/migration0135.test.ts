// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0135 — «Trabaje con nosotros» (punto B-18).
 *
 * Lo que se comprueba aquí no es que la tabla exista: es lo que pasa cuando se
 * abre un formulario público contra la base.
 *
 *  · Que Admin y Superadmin se enteren, y por trigger, para que el aviso salga
 *    entre por donde entre la postulación.
 *  · Que un fallo avisando NO tumbe la postulación. La persona que postula no
 *    tiene por qué perder su solicitud porque nuestra campana falle.
 *  · Que no se pueda llenar la tabla. Cualquiera tiene la anon key: va escrita
 *    en el bundle.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0135_trabaje_con_nosotros.sql"),
  "utf8",
);

const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SUPER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MODER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);

interface Aviso { user_id: string; type: string; payload: Record<string, unknown> }
const avisos = () =>
  q<Aviso>("select user_id, type, payload from public.notifications order by id");

const postular = (extra: Record<string, string> = {}) => {
  const d = {
    apellido_paterno: "Ramírez", apellido_materno: "Soto", nombres: "Ana",
    doc_type: "DNI", doc_number: "45678912", email: "ana@correo.com",
    grado: "tecnico", puesto: "Asesora comercial", descripcion: "Cinco años en ventas.",
    ...extra,
  };
  const cols = Object.keys(d).join(", ");
  const vals = Object.values(d).map((v) => `'${v}'`).join(", ");
  return db.exec(`insert into public.careers (${cols}) values (${vals});`);
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated;");
  await db.exec(`
    create table public.profiles (id uuid primary key, full_name text);
    create table public.user_roles (user_id uuid, role text);
    create table public.role_permissions (
      role text, module text, can_view boolean, can_edit boolean,
      can_approve boolean, can_delete boolean,
      primary key (role, module)
    );
    create table public.notifications (
      id serial primary key, user_id uuid, type text, title text, payload jsonb
    );
  `);
  await db.exec(
    "create function public.notify_user(p_user uuid, p_type text, p_title text, p_payload jsonb) " +
    "returns void language sql as 'insert into public.notifications (user_id, type, title, payload) " +
    "values (p_user, p_type, p_title, p_payload)';",
  );
  // Doble de la matriz de permisos: aquí solo interesa que las policies la usen.
  await db.exec(
    "create function public.has_perm(p_module text, p_action text) returns boolean " +
    "language sql stable as 'select true';",
  );
  await db.exec(`
    insert into public.user_roles (user_id, role) values
      ('${ADMIN}', 'admin'), ('${SUPER}', 'superadmin'), ('${MODER}', 'moderador');
  `);
  await db.exec(MIG);
});

beforeEach(async () => {
  await db.exec("delete from public.notifications; delete from public.careers;");
});

describe("la postulación se guarda con lo que se pidió", () => {
  it("los datos y la fecha y hora del servidor", async () => {
    await postular();
    const [c] = await q<Record<string, unknown>>("select * from public.careers");
    expect(c.apellido_paterno).toBe("Ramírez");
    expect(c.grado).toBe("tecnico");
    expect(c.puesto).toBe("Asesora comercial");
    // "Que se grabe en un registro con la fecha y hora que se registró".
    expect(c.created_at).toBeTruthy();
    // Nace sin revisar: si naciera "revisada" nadie la miraría.
    expect(c.status).toBe("nueva");
  });

  it("lleva correlativo, para poder nombrarla por teléfono", async () => {
    await postular();
    await postular({ email: "otra@correo.com", doc_number: "11112222" });
    const codes = await q<{ code: number }>("select code from public.careers order by code");
    // Consecutivos, no "1 y 2": la secuencia no se reinicia al borrar filas, y
    // exigir que empiece en 1 sería atar la prueba al orden en que se ejecuta.
    expect(codes).toHaveLength(2);
    expect(Number(codes[1].code)).toBe(Number(codes[0].code) + 1);
  });

  it("un grado que no es de los cinco no entra", async () => {
    // "secundaria, técnico, bachiller, maestría, doctorado" — la lista es del
    // cliente y el desplegable la respeta, pero la base no se fía del front.
    await expect(postular({ grado: "posgrado-inventado" })).rejects.toThrow();
  });

  it("ni un estado inventado", async () => {
    await postular();
    await expect(db.exec("update public.careers set status = 'en-proceso'")).rejects.toThrow();
  });
});

describe("el aviso a Admin y Superadmin", () => {
  it("les llega a los dos", async () => {
    await postular();
    const n = await avisos();
    expect(n).toHaveLength(2);
    expect(n.map((x) => x.user_id).sort()).toEqual([ADMIN, SUPER].sort());
    expect(n.every((x) => x.type === "career_new")).toBe(true);
  });

  it("al moderador no: aquí hay documentos de identidad de terceros", async () => {
    await postular();
    expect((await avisos()).some((n) => n.user_id === MODER)).toBe(false);
  });

  it("el aviso trae el nombre y el puesto, que es lo que decide si se mira ya", async () => {
    await postular();
    const [n] = await avisos();
    expect(n.payload.nombre).toBe("Ana Ramírez");
    expect(n.payload.puesto).toBe("Asesora comercial");
    expect(n.payload.career_id).toBeTruthy();
  });

  it("si el aviso revienta, la postulación se guarda igual", async () => {
    // Es la parte que importa: la solicitud de una persona vale más que nuestra
    // campana. Se rompe `notify_user` a propósito.
    await db.exec(
      "create or replace function public.notify_user(p_user uuid, p_type text, p_title text, p_payload jsonb) " +
      "returns void language plpgsql as $$ begin raise exception 'boom'; end $$;",
    );
    await postular();
    const filas = await q<{ n: number }>("select count(*)::int as n from public.careers");
    expect(filas[0].n).toBe(1);
    expect(await avisos()).toHaveLength(0);

    // Se deja como estaba para no contaminar las pruebas siguientes.
    await db.exec(
      "create or replace function public.notify_user(p_user uuid, p_type text, p_title text, p_payload jsonb) " +
      "returns void language sql as 'insert into public.notifications (user_id, type, title, payload) " +
      "values (p_user, p_type, p_title, p_payload)';",
    );
  });
});

describe("el freno contra el llenado de la tabla", () => {
  it("tres al día por correo, y la cuarta no pasa", async () => {
    for (let i = 0; i < 3; i++) await postular({ doc_number: `1111000${i}` });
    await expect(postular({ doc_number: "99998888" })).rejects.toThrow(/postulación/i);
  });

  it("y tres por documento, aunque cambie el correo", async () => {
    // Sin esta segunda comprobación bastaba con inventarse un correo distinto
    // en cada envío.
    for (let i = 0; i < 3; i++) await postular({ email: `uno${i}@correo.com` });
    await expect(postular({ email: "otro@correo.com" })).rejects.toThrow(/postulación/i);
  });

  it("el tope no distingue mayúsculas en el correo", async () => {
    for (let i = 0; i < 3; i++) await postular({ email: "ANA@correo.com", doc_number: `2222000${i}` });
    await expect(postular({ email: "ana@CORREO.com", doc_number: "33334444" })).rejects.toThrow();
  });

  it("lo de ayer no cuenta contra lo de hoy", async () => {
    // La ventana es de un día. Si contara todo el histórico, quien postuló tres
    // veces el año pasado no podría volver a postular nunca.
    for (let i = 0; i < 3; i++) await postular({ doc_number: `4444000${i}` });
    await db.exec("update public.careers set created_at = now() - interval '2 days'");
    await expect(postular({ doc_number: "55556666" })).resolves.toBeDefined();
  });

  it("otra persona no queda bloqueada por la anterior", async () => {
    for (let i = 0; i < 3; i++) await postular({ doc_number: `6666000${i}` });
    await expect(
      postular({ email: "luis@correo.com", doc_number: "70000001" }),
    ).resolves.toBeDefined();
  });
});

describe("quién puede hacer qué", () => {
  it("cualquiera puede postular, con cuenta o sin ella", async () => {
    // Exigir registrarse para dejar un currículum pierde a la mitad de los
    // candidatos en la puerta.
    const p = await q<{ anon: boolean; auth: boolean }>(`
      select has_table_privilege('anon', 'public.careers', 'insert') as anon,
             has_table_privilege('authenticated', 'public.careers', 'insert') as auth
    `);
    expect(p[0].anon).toBe(true);
    expect(p[0].auth).toBe(true);
  });

  it("pero anon NO puede leerlas: son datos personales de terceros", async () => {
    const p = await q<{ ok: boolean }>(
      "select has_table_privilege('anon', 'public.careers', 'select') as ok",
    );
    expect(p[0].ok).toBe(false);
  });

  it("nadie borra desde la aplicación", async () => {
    // Una postulación descartada se marca, no se destruye: quien descarta hoy
    // puede tener que explicar mañana por qué.
    const p = await q<{ anon: boolean; auth: boolean }>(`
      select has_table_privilege('anon', 'public.careers', 'delete') as anon,
             has_table_privilege('authenticated', 'public.careers', 'delete') as auth
    `);
    expect(p[0].anon).toBe(false);
    expect(p[0].auth).toBe(false);
  });

  it("la RLS está encendida y con sus tres policies", async () => {
    const r = await q<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where oid = 'public.careers'::regclass",
    );
    expect(r[0].relrowsecurity).toBe(true);

    const pol = await q<{ policyname: string }>(
      "select policyname from pg_policies where tablename = 'careers' order by policyname",
    );
    expect(pol.map((p) => p.policyname)).toEqual([
      "careers_public_insert", "careers_staff_select", "careers_staff_update",
    ]);
  });
});

describe("el módulo en la matriz de permisos", () => {
  it("admin y superadmin gestionan; soporte mira; moderador no entra", async () => {
    const r = await q<{ role: string; can_view: boolean; can_edit: boolean }>(
      "select role, can_view, can_edit from public.role_permissions " +
      "where module = 'Trabaje con nosotros' order by role",
    );
    expect(r).toEqual([
      { role: "admin", can_view: true, can_edit: true },
      { role: "moderador", can_view: false, can_edit: false },
      { role: "soporte", can_view: true, can_edit: false },
      { role: "superadmin", can_view: true, can_edit: true },
    ]);
  });

  it("volver a aplicarla no pisa permisos ya ajustados a mano", async () => {
    await db.exec(
      "update public.role_permissions set can_edit = true " +
      "where module = 'Trabaje con nosotros' and role = 'soporte'",
    );
    await db.exec(MIG);
    const r = await q<{ can_edit: boolean }>(
      "select can_edit from public.role_permissions " +
      "where module = 'Trabaje con nosotros' and role = 'soporte'",
    );
    expect(r[0].can_edit).toBe(true);
  });
});

describe("no se confunde con las postulaciones a avisos de empleo", () => {
  it("la tabla se llama `careers`, no `applications`", async () => {
    // `applications` son las postulaciones a los avisos de los anunciantes: van
    // dirigidas a un cliente. Confundirlas significaría enseñarle a un
    // anunciante currículums que la gente nos manda a nosotros.
    expect(MIG).toContain("public.careers");
    expect(MIG).not.toMatch(/create table[^;]*public\.applications/);
  });
});
