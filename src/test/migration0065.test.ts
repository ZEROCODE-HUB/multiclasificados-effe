// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre 0065 encima de 0046. Prueba que los módulos de "acceso" pasen a
 * respetar la matriz:
 *  - RLS de categorías/tarifas: se ejecuta como el rol `authenticated` (para que
 *    el RLS realmente aplique; el superusuario lo saltaría). Un rol con 'view'
 *    pero sin 'edit' no puede escribir; al encender 'edit', sí.
 *  - RPCs de Comunicaciones: admin_send_message/admin_broadcast exigen
 *    has_perm('Comunicaciones','edit') en vez de is_staff.
 */

const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG_0046 = read("0046_roles_permissions_enforced.sql");
const MIG_0065 = read("0065_access_modules_matrix.sql");

const U = {
  superadmin: "00000000-0000-0000-0000-0000000000a1",
  admin:      "00000000-0000-0000-0000-0000000000a2",
  soporte:    "00000000-0000-0000-0000-0000000000a4",
};
const DEST = "00000000-0000-0000-0000-0000000000d1";
const CAT_NUEVA = "00000000-0000-0000-0000-0000000000e1";
const PRICING = "00000000-0000-0000-0000-0000000000f1";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);

// Ejecuta como el rol `authenticated` (RLS activo) con una sesión "logueada".
const comoAuth = (uid: string) => db.exec(`set role authenticated; set test.uid = '${uid}';`);
const comoSuper = () => db.exec(`reset role; set test.uid = '';`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.uid', true), '')::uuid $$;

    create type public.app_role as enum ('anunciante','buscador','admin','superadmin','moderador','soporte');
    create type public.listing_status as enum ('draft','pending','active','paused','rejected','expired','sold');

    create table public.profiles (id uuid primary key, full_name text, email text, status text default 'active',
                                  verified boolean default false, ban_reason text, suspended_until timestamptz);
    create table public.user_roles (user_id uuid, role public.app_role, primary key (user_id, role));
    create table public.role_permissions (
      role text not null, module text not null,
      can_view boolean not null default false, can_edit boolean not null default false,
      can_approve boolean not null default false, can_delete boolean not null default false,
      primary key (role, module)
    );
    create table public.listings (
      id uuid primary key, owner_id uuid, title text, description text, price numeric,
      currency text, condition text, category_id text, subcategory_id text, location text,
      status public.listing_status, featured boolean default false, urgent boolean default false,
      views int default 0, rejection_reason text, published_at timestamptz, created_at timestamptz default now()
    );
    create table public.listing_images (listing_id uuid, url text, sort_order int);
    create table public.reports (
      id uuid primary key, target_user_id uuid, listing_id uuid, reason text,
      status text default 'open', action_taken text, resolution_note text,
      resolved_by uuid, resolved_at timestamptz
    );
    create table public.audit_logs (id serial primary key, action text);
    create table public.notifications (
      id serial primary key, user_id uuid, type text, channel text, title text,
      payload jsonb, created_at timestamptz default now()
    );

    create function public.has_role(_uid uuid, _role text) returns boolean
      language sql stable as $$
        select exists (select 1 from public.user_roles r where r.user_id = _uid and r.role::text = _role) $$;
    create function public.is_staff(_uid uuid) returns boolean language sql stable as $$ select false $$;
    create function public.log_audit(a text, b text, c text, d jsonb) returns void
      language sql as $$ insert into public.audit_logs (action) values (a) $$;
    create function public.notify_user(a uuid, b text, c text, d jsonb) returns void
      language sql as $$ select $$;
    -- Helper que 0039 crea y 0065 (admin_broadcast) reutiliza.
    create function public.comm_audience(p_audience text) returns setof uuid
      language sql stable security definer set search_path = public as $$
        select p.id from public.profiles p
        where p_audience = 'all'
           or exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role::text = p_audience) $$;

    -- Tablas de los módulos de acceso (mínimas), con RLS y lectura pública.
    create table public.categories (id uuid primary key, name text, sort_order int);
    create table public.subcategories (id uuid primary key, category_id uuid, name text);
    create table public.pricing_settings (id uuid primary key, base numeric, is_active boolean default true);
    create table public.promotions (id uuid primary key, name text, is_active boolean default true);
    create table public.credit_packages (id uuid primary key, name text, is_active boolean default true);
    alter table public.categories       enable row level security;
    alter table public.subcategories    enable row level security;
    alter table public.pricing_settings enable row level security;
    alter table public.promotions       enable row level security;
    alter table public.credit_packages  enable row level security;
    create policy "categories_select_all"   on public.categories       for select using (true);
    create policy "pricing_select_all"       on public.pricing_settings for select using (true);
    -- Policies de escritura legacy que 0065 debe reemplazar.
    create policy "categories_manage_staff"  on public.categories       for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
    create policy "pricing_manage_staff"      on public.pricing_settings for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
    grant select, insert, update, delete on public.categories, public.pricing_settings to authenticated;
  `);

  await db.exec(`
    insert into public.profiles (id, full_name, email) values
      ('${U.superadmin}', 'Super', 's@x.com'), ('${U.admin}', 'Admin', 'a@x.com'),
      ('${U.soporte}', 'Soporte', 'sop@x.com'), ('${DEST}', 'Cliente Uno', 'cliente@x.com');
    insert into public.user_roles values
      ('${U.superadmin}', 'superadmin'), ('${U.admin}', 'admin'), ('${U.soporte}', 'soporte');
    insert into public.pricing_settings (id, base) values ('${PRICING}', 100);
  `);

  await db.exec(MIG_0046); // has_perm + siembra (admin edita todo; soporte solo ve)
  await db.exec(MIG_0065); // cablea escritura de acceso → has_perm(módulo,'edit')
});

beforeEach(async () => {
  await db.exec(`
    reset role; set test.uid = '';
    -- Solo soporte vuelve a "sin editar" (admin conserva su edit=true del seed).
    update public.role_permissions set can_edit = false
      where module in ('Configuración comercial', 'Pagos y planes', 'Comunicaciones') and role = 'soporte';
    update public.pricing_settings set base = 100 where id = '${PRICING}';
    delete from public.categories where id = '${CAT_NUEVA}';
    delete from public.notifications;
  `);
});

describe("RLS de módulos de acceso honra la matriz (0065)", () => {
  it("soporte (sin 'editar' en Comercial) NO puede crear una categoría", async () => {
    await comoAuth(U.soporte);
    await expect(
      q(`insert into public.categories (id, name, sort_order) values ('${CAT_NUEVA}', 'Nueva', 9)`),
    ).rejects.toThrow(/row-level security/);
    await comoSuper();
    const [c] = await q<{ n: string }>(`select count(*)::text as n from public.categories where id = '${CAT_NUEVA}'`);
    expect(c.n).toBe("0");
  });

  it("con 'editar' de Comercial encendido, soporte sí crea la categoría", async () => {
    await db.exec(`update public.role_permissions set can_edit = true where role = 'soporte' and module = 'Configuración comercial'`);
    await comoAuth(U.soporte);
    await q(`insert into public.categories (id, name, sort_order) values ('${CAT_NUEVA}', 'Nueva', 9)`);
    await comoSuper();
    const [c] = await q<{ n: string }>(`select count(*)::text as n from public.categories where id = '${CAT_NUEVA}'`);
    expect(c.n).toBe("1");
  });

  it("admin (seed edit=true) sí puede editar tarifas; soporte no (update silencioso a 0 filas)", async () => {
    // soporte: sin permiso, el UPDATE no toca ninguna fila (RLS lo excluye del USING).
    await comoAuth(U.soporte);
    await q(`update public.pricing_settings set base = 999 where id = '${PRICING}'`);
    await comoSuper();
    let [p] = await q<{ base: string }>(`select base::text as base from public.pricing_settings where id = '${PRICING}'`);
    expect(p.base).toBe("100"); // intacto

    // admin: con edit=true en la matriz, el UPDATE aplica.
    await comoAuth(U.admin);
    await q(`update public.pricing_settings set base = 250 where id = '${PRICING}'`);
    await comoSuper();
    [p] = await q<{ base: string }>(`select base::text as base from public.pricing_settings where id = '${PRICING}'`);
    expect(p.base).toBe("250");
  });
});

describe("RPCs de Comunicaciones honran la matriz (0065)", () => {
  it("soporte NO puede enviar un mensaje: no tiene 'Comunicaciones' · edit", async () => {
    await db.exec(`set test.uid = '${U.soporte}'`);
    await expect(
      q(`select public.admin_send_message('cliente@x.com', 'Hola', 'Cuerpo', false)`),
    ).rejects.toThrow(/no autorizado/);
  });

  it("admin sí envía (crea la notificación in-app)", async () => {
    await db.exec(`set test.uid = '${U.admin}'`);
    const [r] = await q<{ res: { sent: number } }>(`select public.admin_send_message('cliente@x.com', 'Hola', 'Cuerpo', false) as res`);
    expect(r.res.sent).toBe(1);
    const [n] = await q<{ n: string }>(`select count(*)::text as n from public.notifications where user_id = '${DEST}'`);
    expect(n.n).toBe("1");
  });

  it("soporte NO puede difundir; admin sí y devuelve el conteo", async () => {
    await db.exec(`set test.uid = '${U.soporte}'`);
    await expect(
      q(`select public.admin_broadcast('all', 'T', 'B', false, false)`),
    ).rejects.toThrow(/no autorizado/);

    await db.exec(`set test.uid = '${U.admin}'`);
    const [r] = await q<{ n: number }>(`select public.admin_broadcast('all', 'T', 'B', false, false) as n`);
    expect(r.n).toBeGreaterThan(0);
  });
});
