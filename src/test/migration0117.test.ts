// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0117 — pagos por Yape/Plin aprobados a mano.
 *
 * Lo que se comprueba es justo lo que puede salir caro:
 *   · aprobar acredita el saldo, emite el comprobante y PUBLICA el aviso, por
 *     la misma `settle_paid_order` que usa la pasarela;
 *   · un pago manual NO queda registrado como cobrado por Izipay (los reportes
 *     de ingresos separan ambas cosas por `payment_provider`);
 *   · el barrido de órdenes colgadas no los toca — si los tocara, un pago
 *     esperando revisión moriría solo antes de que nadie lo mirara;
 *   · aprobar dos veces no acredita dos veces;
 *   · corregir el importe recalcula saldo e IGV;
 *   · y quién puede hacer qué.
 */
const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG_0046 = read("0046_roles_permissions_enforced.sql");
const MIG_0117 = read("0117_pagos_con_yape_y_plin.sql");

const U = {
  superadmin: "00000000-0000-0000-0000-0000000000a1",
  admin: "00000000-0000-0000-0000-0000000000a2",
  soporte: "00000000-0000-0000-0000-0000000000a4",
};
const CLIENTE = "00000000-0000-0000-0000-0000000000d9";
const AVISO = "00000000-0000-0000-0000-0000000000f1";
const ORDEN = "00000000-0000-0000-0000-000000000001";

let db: PGlite;
const como = (uid: string) => db.exec(`set test.uid = '${uid}';`);
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);

const saldo = () =>
  q<{ b: string }>(`select coalesce(balance,0)::text as b from public.user_credits where user_id = '${CLIENTE}'`)
    .then((r) => Number(r[0]?.b ?? 0));

const orden = () =>
  q<{ status: string; provider: string; total: string; paid_at: string | null }>(
    `select status::text, payment_provider as provider, total::text, paid_at::text
       from public.orders where id = '${ORDEN}'`,
  ).then((r) => r[0]);

/** Crea la orden manual de partida: pagar y publicar un aviso de 16.14. */
const nuevaOrden = (extras = `'{"credits":16.14,"detail":"Publicación","purpose":"publish","listing_id":"${AVISO}","duration_days":7}'::jsonb`) =>
  db.exec(`
    delete from public.orders;
    delete from public.invoices;
    delete from public.user_credits;
    delete from public.credit_transactions;
    delete from public.notificaciones_enviadas;
    update public.listings set status = 'draft', published_at = null where id = '${AVISO}';
    insert into public.orders (id, user_id, subtotal, igv, total, status, payment_provider, extras, created_at)
    values ('${ORDEN}', '${CLIENTE}', 13.68, 2.46, 16.14, 'pending', 'yape', ${extras}, now() - interval '10 minutes');
  `);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.uid', true), '')::uuid $$;

    create type public.app_role as enum ('anunciante','buscador','admin','superadmin','moderador','soporte');
    create type public.listing_status as enum ('draft','pending','active','paused','rejected','expired','sold');
    create type public.order_status as enum ('pending','paid','failed','refunded');
    create type public.invoice_type as enum ('boleta','factura');
    create type public.invoice_sunat_status as enum ('pendiente','aceptado','rechazado','omitido');
    create type public.doc_type as enum ('dni','ruc','ce','pasaporte');

    create table public.profiles (id uuid primary key, full_name text, email text, status text default 'active');
    create table public.user_roles (user_id uuid, role public.app_role, primary key (user_id, role));
    create table public.role_permissions (
      role text not null, module text not null,
      can_view boolean not null default false, can_edit boolean not null default false,
      can_approve boolean not null default false, can_delete boolean not null default false,
      primary key (role, module)
    );
    create table public.system_settings (
      key text primary key, value jsonb, label text, updated_at timestamptz default now()
    );
    -- Las columnas de más las pide la 0046 (admin_get_listing), no la 0117.
    create table public.listings (
      id uuid primary key, owner_id uuid, title text, description text, price numeric,
      currency text, condition text, category_id text, subcategory_id text, location text,
      status public.listing_status, featured boolean default false, urgent boolean default false,
      views int default 0, rejection_reason text,
      published_at timestamptz, expires_at timestamptz, created_at timestamptz default now()
    );
    create table public.listing_images (listing_id uuid, url text, sort_order int);
    create table public.reports (
      id uuid primary key, target_user_id uuid, listing_id uuid, reason text,
      status text default 'open', action_taken text, resolution_note text,
      resolved_by uuid, resolved_at timestamptz
    );
    create table public.orders (
      id uuid primary key, user_id uuid, listing_qty int, duration_days int,
      subtotal numeric, igv numeric, total numeric,
      status public.order_status default 'pending', payment_provider text,
      payment_ref text, extras jsonb, created_at timestamptz default now(),
      paid_at timestamptz, verify_attempts int default 0, verified_at timestamptz,
      verify_next_try_at timestamptz, verify_last_error text
    );
    create table public.invoices (
      id serial primary key, order_id uuid, number text, type public.invoice_type,
      email text, advertiser_name text, doc_type public.doc_type, doc_number text, pais text,
      factiliza_data jsonb, amount numeric, subtotal numeric, igv numeric, detail text,
      sunat_status public.invoice_sunat_status, sunat_next_try_at timestamptz,
      sunat_last_error text, email_next_try_at timestamptz
    );
    create table public.user_credits (
      user_id uuid primary key, balance numeric(12,2) not null default 0 check (balance >= 0),
      updated_at timestamptz
    );
    create table public.credit_transactions (
      id serial primary key, user_id uuid, type text, credits numeric,
      description text, order_id uuid, created_at timestamptz default now()
    );
    create table public.audit_logs (
      id serial primary key, actor_id uuid, action text, entity_type text,
      entity_id text, metadata jsonb, created_at timestamptz default now()
    );
    create table public.notificaciones_enviadas (user_id uuid, evento text, payload jsonb);

    create function public.has_role(_uid uuid, _role text) returns boolean
      language sql stable as $$
        select exists (select 1 from public.user_roles r where r.user_id = _uid and r.role::text = _role) $$;
    create function public.is_staff(_uid uuid) returns boolean language sql stable as $$ select false $$;
    create function public.log_audit(a text, b text, c text, d jsonb) returns void
      language sql as $$ insert into public.audit_logs (action, entity_id, metadata) values (a, c, d) $$;
    create function public.notify_user(a uuid, b text, c text, d jsonb) returns void
      language sql as $$ insert into public.notificaciones_enviadas values (a, b, d) $$;
    create function public.invoice_emission_enabled() returns boolean language sql stable as $$ select true $$;
    create function public.add_credits(p_user uuid, p_credits numeric, p_detail text, p_order uuid)
      returns void language plpgsql as $$
      begin
        insert into public.user_credits (user_id, balance, updated_at)
          values (p_user, p_credits, now())
        on conflict (user_id) do update set balance = public.user_credits.balance + p_credits;
        insert into public.credit_transactions (user_id, type, credits, description, order_id)
          values (p_user, 'purchase', p_credits, p_detail, p_order);
      end $$;
    -- Publicar cobra el costo del aviso del saldo, igual que en producción.
    create function public.effe_publish_listing(p_listing uuid, p_dias int, p_actor uuid)
      returns void language plpgsql as $$
      declare v_saldo numeric;
      begin
        select balance into v_saldo from public.user_credits where user_id = p_actor;
        if coalesce(v_saldo, 0) < 16.14 then
          raise exception 'Saldo insuficiente: se necesitan 16.14 créditos y hay %', coalesce(v_saldo, 0);
        end if;
        update public.user_credits set balance = balance - 16.14 where user_id = p_actor;
        update public.listings set status = 'active', published_at = now(),
               expires_at = now() + (p_dias || ' days')::interval
         where id = p_listing;
      end $$;
    create function public.effe_renovar_aviso(p_listing uuid, p_dias int, p_actor uuid)
      returns void language sql as $$ select $$;
    create function public.next_invoice_number(t public.invoice_type) returns text
      language sql as $$ select 'B001-000001'::text $$;

    -- La 0109 en pequeño: lo que la 0117 recrea con el filtro por proveedor.
    create function public.dispatch_payment_verification(p_order uuid) returns void
      language sql as $$ select $$;
  `);

  await db.exec(`
    insert into auth.users values ('${U.superadmin}'), ('${U.admin}'), ('${U.soporte}'), ('${CLIENTE}');
    insert into public.profiles (id, full_name, email) values
      ('${U.superadmin}', 'Super', 's@e.com'), ('${U.admin}', 'Admin', 'a@e.com'),
      ('${U.soporte}', 'Soporte', 'so@e.com'), ('${CLIENTE}', 'Cliente', 'c@e.com');
    insert into public.user_roles values
      ('${U.superadmin}', 'superadmin'), ('${U.admin}', 'admin'), ('${U.soporte}', 'soporte');
    insert into public.listings (id, owner_id, title, status) values ('${AVISO}', '${CLIENTE}', 'Vendo torno', 'draft');
  `);

  await db.exec(MIG_0046);
  await db.exec(MIG_0117);

  // El número de comprobante lo pone un trigger en producción; aquí basta con
  // que la columna tenga algo, que es lo que devuelve settle_paid_order.
  await db.exec(`alter table public.invoices alter column number set default 'B001-000001';`);
});

beforeEach(() => nuevaOrden());

describe("0117 — pagos por Yape y Plin", () => {
  it("aprobar acredita el saldo, emite el comprobante y publica el aviso", async () => {
    await como(U.superadmin);
    await q(`select public.admin_aprobar_pago_manual('${ORDEN}', null, 'voucher ok')`);

    const o = await orden();
    expect(o.status).toBe("paid");
    expect(o.paid_at).not.toBeNull();

    // Se acreditaron 16.14 y publicar los gastó: el saldo vuelve a 0 y el
    // aviso queda activo. Eso demuestra que pasó por la misma vía que la
    // pasarela, no por un atajo.
    expect(await saldo()).toBe(0);
    const [aviso] = await q<{ status: string }>(`select status::text from public.listings where id = '${AVISO}'`);
    expect(aviso.status).toBe("active");

    const [inv] = await q<{ n: string }>(`select count(*)::text as n from public.invoices where order_id = '${ORDEN}'`);
    expect(Number(inv.n)).toBe(1);
  });

  it("un pago manual NO se registra como cobrado por la pasarela", async () => {
    // Si settle_paid_order siguiera escribiendo 'izipay' a fuego, los reportes
    // de ingresos contarían este pago como cobrado con tarjeta.
    await como(U.superadmin);
    await q(`select public.admin_aprobar_pago_manual('${ORDEN}')`);
    expect((await orden()).provider).toBe("yape");
  });

  it("aprobar dos veces no acredita dos veces", async () => {
    await como(U.superadmin);
    await q(`select public.admin_aprobar_pago_manual('${ORDEN}')`);
    await expect(q(`select public.admin_aprobar_pago_manual('${ORDEN}')`)).rejects.toThrow(/EF032/);

    const [tx] = await q<{ n: string }>(
      `select count(*)::text as n from public.credit_transactions where order_id = '${ORDEN}'`,
    );
    expect(Number(tx.n)).toBe(1);
  });

  it("corregir el importe recalcula el saldo y el IGV", async () => {
    // Compra de saldo suelta (sin aviso) para ver el saldo sin que publicar lo gaste.
    await nuevaOrden(`'{"credits":16.14,"detail":"Compra de saldo"}'::jsonb`);
    await como(U.superadmin);
    await q(`select public.admin_aprobar_pago_manual('${ORDEN}', 50, 'pagó de más')`);

    const [o] = await q<{ total: string; subtotal: string; igv: string }>(
      `select total::text, subtotal::text, igv::text from public.orders where id = '${ORDEN}'`,
    );
    expect(Number(o.total)).toBe(50);
    expect(Number(o.subtotal)).toBeCloseTo(42.37, 2);
    expect(Number(o.igv)).toBeCloseTo(7.63, 2);
    // Y el saldo sigue al importe corregido, no al calculado al comprar.
    expect(await saldo()).toBe(50);

    const [inv] = await q<{ amount: string }>(`select amount::text from public.invoices where order_id = '${ORDEN}'`);
    expect(Number(inv.amount)).toBe(50);
  });

  it("rechazar cierra el pago, no acredita nada y exige un motivo", async () => {
    await como(U.superadmin);
    await expect(q(`select public.admin_rechazar_pago_manual('${ORDEN}', '  ')`)).rejects.toThrow(/EF034/);

    await q(`select public.admin_rechazar_pago_manual('${ORDEN}', 'No encontramos la transferencia')`);
    expect((await orden()).status).toBe("failed");
    expect(await saldo()).toBe(0);

    const [n] = await q<{ evento: string }>(
      `select evento from public.notificaciones_enviadas where user_id = '${CLIENTE}' order by evento limit 1`,
    );
    expect(n.evento).toBe("manual_payment_rejected");
  });

  it("el barrido de órdenes colgadas no toca los pagos manuales", async () => {
    // Sin el filtro por proveedor, este pago se cerraría solo antes de que
    // nadie lo mirara: verify-payment le pregunta a Izipay por una orden que
    // Izipay no conoce.
    await db.exec(`update public.orders set created_at = now() - interval '9 days' where id = '${ORDEN}'`);
    const [r] = await q<{ n: number }>(`select public.sweep_pending_orders(10) as n`);
    expect(Number(r.n)).toBe(0);
    expect((await orden()).status).toBe("pending");
  });

  it("el comprador confirma su propio pago, y solo el suyo", async () => {
    await como(CLIENTE);
    await q(`select public.confirmar_pago_manual('${ORDEN}')`);
    const [c] = await q<{ n: string | null }>(
      `select manual_confirmed_at::text as n from public.orders where id = '${ORDEN}'`,
    );
    expect(c.n).not.toBeNull();

    await como(U.admin); // otro usuario cualquiera: no es su orden
    await expect(q(`select public.confirmar_pago_manual('${ORDEN}')`)).rejects.toThrow(/EF030/);
  });

  it("soporte no puede aprobar pagos", async () => {
    await como(U.soporte);
    await expect(q(`select public.admin_aprobar_pago_manual('${ORDEN}')`)).rejects.toThrow(/EF001/);
    expect((await orden()).status).toBe("pending");
  });

  it("la configuración pública no filtra nada más del ajuste", async () => {
    await db.exec(`
      update public.system_settings
         set value = '{"activo":true,"cuentas":[{"metodo":"yape","numero":"999","banco":"BCP","titular":"eFFe"}],
                       "whatsapp":"51999888777","mensaje":"Hola","secreto_interno":"no debería salir"}'::jsonb
       where key = 'yape_plin';
    `);
    const [c] = await q<{ v: string }>(`select public.yape_plin_config()::text as v`);
    const cfg = JSON.parse(c.v);
    expect(cfg.activo).toBe(true);
    expect(cfg.whatsapp).toBe("51999888777");
    expect(cfg.cuentas).toHaveLength(1);
    expect(Object.keys(cfg).sort()).toEqual(["activo", "cuentas", "mensaje", "whatsapp"]);
  });

  it("las funciones nuevas quedan con permiso explícito, no por defecto", async () => {
    // La 0104 hace que una función nueva nazca cerrada: sin el grant, esto da
    // 42501 en producción y se ve como una pantalla vacía.
    const [r] = await q<{ ok: boolean }>(`
      select bool_and(has_function_privilege('authenticated', p.oid, 'execute')) as ok
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('yape_plin_config','confirmar_pago_manual','admin_pagos_manuales',
                           'admin_pagos_manuales_pendientes','admin_aprobar_pago_manual',
                           'admin_rechazar_pago_manual')
    `);
    expect(r.ok).toBe(true);

    // Y las que mueven dinero sin preguntar por el permiso, cerradas.
    const [s] = await q<{ ok: boolean }>(`
      select bool_or(has_function_privilege('authenticated', p.oid, 'execute')) as ok
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('settle_paid_order','sweep_pending_orders')
    `);
    expect(s.ok).toBe(false);
  });
});
