// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0133 — LA ALERTA DE VENCIMIENTO SE MIDE CONTRA EL TIEMPO CONTRATADO.
 *
 * Lo reportó el cliente:
 *
 *   "El mismo aviso, a los 20 segundos de colocarlo, emitió una alerta que ya
 *    está por vencer. Me parece que debemos manejar el tiempo contratado en
 *    horas de duración del aviso. Luego al verificar, emitir alertas solo cuando
 *    haya pasado el 85% de tiempo contratado, y en las alertas y correos
 *    colocamos el tiempo transcurrido y lo que le queda."
 *
 * No falló nada: la 0113 avisaba con `expires_at <= now() + interval '3 days'`,
 * un umbral ABSOLUTO. Su aviso era de un plan de 3 días, así que la condición se
 * cumplía en el mismo segundo de publicarlo.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0133_avisar_al_85_del_plan.sql"),
  "utf8",
);

const DUENO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);

interface Aviso { user_id: string; type: string; payload: Record<string, unknown> }

const notificados = () =>
  q<Aviso>("select user_id, type, payload from public.notifications order by id");

/** Publica un aviso con `dias` contratados y `consumidas` horas ya gastadas. */
const publicar = (id: number, dias: number, consumidas: number) => db.exec(`
  insert into public.listings (id, owner_id, title, status, plan_duration_days, published_at, expires_at)
  values (
    ${id}, '${DUENO}', 'Postres en Huanchaco', 'active', ${dias},
    now() - interval '${consumidas} hours',
    now() - interval '${consumidas} hours' + interval '${dias * 24} hours'
  );
`);

const correr = () =>
  q<{ notify_expiring_listings: number }>("select public.notify_expiring_listings()");

const seguiaCayendoConElCriterioViejo = () =>
  q<{ caia: boolean }>(
    "select (expires_at <= now() + interval '3 days') as caia from public.listings",
  ).then((r) => r[0].caia);

beforeAll(async () => {
  db = new PGlite();
  // El cron corre con `service_role`, que en Supabase existe de fábrica.
  await db.exec("create role service_role;");
  await db.exec(`
    create table public.notifications (
      id serial primary key, user_id uuid, type text, title text, payload jsonb
    );
  `);
  // Doble de notify_user: aquí solo interesa QUÉ se manda y CUÁNDO.
  await db.exec(
    "create function public.notify_user(p_user uuid, p_type text, p_title text, p_payload jsonb) " +
    "returns void language sql as 'insert into public.notifications (user_id, type, title, payload) " +
    "values (p_user, p_type, p_title, p_payload)';",
  );
  await db.exec(`
    create table public.listings (
      id int primary key,
      owner_id uuid,
      title text,
      status text,
      plan_duration_days int,
      published_at timestamptz,
      created_at timestamptz default now(),
      expires_at timestamptz,
      expiry_notified_at timestamptz,
      expiry_notified_3d_at timestamptz
    );
  `);
  await db.exec(MIG);
});

beforeEach(async () => {
  await db.exec("delete from public.notifications; delete from public.listings;");
});

describe("un plan corto ya no avisa al publicarse", () => {
  it("el aviso de 3 días recién colocado NO genera nada (era el fallo)", async () => {
    await publicar(1, 3, 0);
    expect((await correr())[0].notify_expiring_listings).toBe(0);
    expect(await notificados()).toHaveLength(0);
  });

  it("sigue callado a mitad del plan", async () => {
    await publicar(1, 3, 36); // 50 % consumido
    await correr();
    expect(await notificados()).toHaveLength(0);
  });

  it("y avisa una vez pasado el 85 %, que en 3 días son ~61 horas", async () => {
    await publicar(1, 3, 62); // 86 % consumido
    expect((await correr())[0].notify_expiring_listings).toBe(1);
    const [n] = await notificados();
    expect(n.type).toBe("listing_expiring");
    expect(n.user_id).toBe(DUENO);
  });

  it("con el criterio viejo habría avisado desde el primer segundo", async () => {
    // La 0113 usaba `expires_at <= now() + interval '3 days'`. Aquí se comprueba
    // que ese umbral SÍ se cumplía nada más publicar: es el fallo, por escrito.
    await publicar(1, 3, 0);
    expect(await seguiaCayendoConElCriterioViejo()).toBe(true);
  });
});

describe("la misma regla vale para los planes largos", () => {
  it("un plan de 30 días calla a los 6 días de vida", async () => {
    await publicar(1, 30, 24 * 6);
    await correr();
    expect(await notificados()).toHaveLength(0);
  });

  it("y avisa a los 26 días, cuando quedan unos 4", async () => {
    await publicar(1, 30, 24 * 26);
    await correr();
    expect(await notificados()).toHaveLength(1);
  });

  it("antes, con 3 días fijos, se enteraba con el plan casi agotado", async () => {
    // Cuatro días de margen sobre treinta no era avisar pronto: era tarde.
    await publicar(1, 30, 24 * 26);
    expect(await seguiaCayendoConElCriterioViejo()).toBe(false);
  });
});

describe("no se repite el aviso", () => {
  it("dos pasadas seguidas notifican una sola vez", async () => {
    await publicar(1, 3, 62);
    await correr();
    await correr();
    expect(await notificados()).toHaveLength(1);
  });

  it("los avisos que ya recibieron la alerta prematura reciben la buena", async () => {
    // Por eso la marca es una columna NUEVA y no se reutiliza
    // `expiry_notified_3d_at`: reutilizándola, justo los avisos afectados por el
    // fallo se habrían quedado sin recibir nunca el aviso correcto.
    await publicar(1, 3, 62);
    await db.exec("update public.listings set expiry_notified_3d_at = now()");
    await correr();
    expect(await notificados()).toHaveLength(1);
  });
});

describe("el aviso lleva el tiempo transcurrido y el que queda", () => {
  it("las dos cifras, en horas", async () => {
    await publicar(1, 3, 62);
    await correr();
    const [n] = await notificados();
    expect(n.payload.horas_totales).toBe(72);
    expect(n.payload.horas_transcurridas).toBe(62);
    expect(n.payload.horas_restantes).toBe(10);
  });

  it("en horas y no en días: a un plan de 3 días le quedan '0 días' casi un día entero", async () => {
    await publicar(1, 3, 62);
    await correr();
    const [n] = await notificados();
    expect(Number(n.payload.horas_restantes)).toBeGreaterThan(0);
  });

  it("y se mantiene `dias`, que es lo que leen los avisos ya guardados", async () => {
    await publicar(1, 30, 24 * 26);
    await correr();
    const [n] = await notificados();
    expect(Number(n.payload.dias)).toBeGreaterThanOrEqual(1);
  });
});

describe("avisos sin plan guardado", () => {
  const antiguo = (publicadoHace: string, venceEn: string) => db.exec(`
    insert into public.listings (id, owner_id, title, status, plan_duration_days, published_at, expires_at)
    values (1, '${DUENO}', 'Antiguo', 'active', null,
            now() - interval '${publicadoHace}', now() + interval '${venceEn}');
  `);

  it("la duración se deduce de la publicación y el vencimiento", async () => {
    // Los anteriores a la 0041 no tienen `plan_duration_days`. Quedarse callado
    // con ellos sería dejar de avisar de un vencimiento real.
    await antiguo("62 hours", "10 hours");
    await correr();
    expect(await notificados()).toHaveLength(1);
  });

  it("pero uno recién publicado tampoco dispara", async () => {
    await antiguo("0 hours", "72 hours");
    await correr();
    expect(await notificados()).toHaveLength(0);
  });
});

describe("el recordatorio de la última hora sigue en pie", () => {
  it("salta cuando queda menos de una hora, y también lleva las horas", async () => {
    await publicar(1, 3, 71.5);
    await correr();
    const avisos = await notificados();
    // El del 85 % y el de la última hora: dos marcas independientes.
    expect(avisos).toHaveLength(2);
    expect(avisos.every((a) => a.type === "listing_expiring")).toBe(true);
    expect(avisos[1].payload.horas_totales).toBe(72);
  });
});

describe("a quién no se le avisa", () => {
  it("un aviso pausado no genera nada", async () => {
    await publicar(1, 3, 62);
    await db.exec("update public.listings set status = 'paused'");
    await correr();
    expect(await notificados()).toHaveLength(0);
  });

  it("uno ya vencido tampoco: no hay nada que anticipar", async () => {
    await publicar(1, 3, 80);
    await correr();
    expect(await notificados()).toHaveLength(0);
  });

  it("uno sin fecha de vencimiento, tampoco", async () => {
    await publicar(1, 3, 62);
    await db.exec("update public.listings set expires_at = null");
    await correr();
    expect(await notificados()).toHaveLength(0);
  });
});
