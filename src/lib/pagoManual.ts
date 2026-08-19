// Pagos por Yape y Plin: el comprador transfiere desde su app, nos manda el
// voucher por WhatsApp y una persona del equipo lo aprueba.
//
// La diferencia con la tarjeta es SOLO quién confirma: Izipay en segundos, o
// una persona en unos minutos. El resto del camino es el mismo — la orden se
// arma igual, el saldo se acredita igual, la boleta se emite igual y el aviso
// se publica solo, sin que el comprador vuelva a tocar nada. Ver la migración
// 0117 y `admin_aprobar_pago_manual`.
import { supabase } from "@/lib/supabase";
import { abrirWhatsAppAparte, enlaceWhatsApp } from "@/lib/share";
import { formatSoles } from "@/lib/pricing";

export type MedioManual = "yape" | "plin";

export const MEDIOS_MANUALES: MedioManual[] = ["yape", "plin"];

export const NOMBRE_MEDIO: Record<MedioManual, string> = {
  yape: "Yape",
  plin: "Plin",
};

/** Una cuenta a la que transferir, tal como la escribe el administrador. */
export interface CuentaManual {
  metodo: MedioManual;
  numero: string;
  banco: string;
  titular: string;
}

export interface ConfigYapePlin {
  activo: boolean;
  cuentas: CuentaManual[];
  whatsapp: string;
  mensaje: string;
}

export const CONFIG_VACIA: ConfigYapePlin = {
  activo: false,
  cuentas: [],
  whatsapp: "",
  mensaje: "",
};

/** Normaliza lo que venga de la base: el ajuste lo escribe una persona a mano. */
export function normalizarConfig(raw: unknown): ConfigYapePlin {
  const o = (raw ?? {}) as Record<string, unknown>;
  const cuentas = Array.isArray(o.cuentas) ? o.cuentas : [];
  return {
    activo: o.activo === true,
    cuentas: cuentas
      .map((c) => {
        const x = (c ?? {}) as Record<string, unknown>;
        const metodo = String(x.metodo ?? "").toLowerCase();
        return {
          metodo: (metodo === "plin" ? "plin" : "yape") as MedioManual,
          numero: String(x.numero ?? "").trim(),
          banco: String(x.banco ?? "").trim(),
          titular: String(x.titular ?? "").trim(),
        };
      })
      .filter((c) => c.numero !== ""),
    whatsapp: String(o.whatsapp ?? "").trim(),
    mensaje: String(o.mensaje ?? "").trim(),
  };
}

/**
 * Configuración visible para quien va a pagar.
 *
 * Si algo falla se devuelve la configuración vacía en vez de propagar el error:
 * el medio simplemente no se ofrece, y quien compra sigue teniendo la tarjeta.
 */
export async function configYapePlin(): Promise<ConfigYapePlin> {
  try {
    const { data, error } = await supabase.rpc("yape_plin_config");
    if (error) throw error;
    return normalizarConfig(data);
  } catch {
    return CONFIG_VACIA;
  }
}

/** ¿Se puede ofrecer este medio? Sin cuentas ni WhatsApp no hay a dónde pagar. */
export function medioDisponible(cfg: ConfigYapePlin, medio: MedioManual): boolean {
  return (
    cfg.activo &&
    cfg.whatsapp.trim() !== "" &&
    cfg.cuentas.some((c) => c.metodo === medio)
  );
}

export function mediosDisponibles(cfg: ConfigYapePlin): MedioManual[] {
  return MEDIOS_MANUALES.filter((m) => medioDisponible(cfg, m));
}

/**
 * El mensaje que llega por WhatsApp.
 *
 * Al texto que escribe el administrador se le añaden los datos que hacen falta
 * para encontrar el pago sin preguntar nada: importe, medio y el código corto
 * de la orden (los 8 primeros caracteres bastan para buscarla y no obligan a
 * copiar un uuid entero desde el móvil).
 */
export function mensajeDeVoucher(opts: {
  plantilla: string;
  medio: MedioManual;
  monto: number;
  orderId: string;
  nombre?: string;
}): string {
  const base = opts.plantilla.trim() || "Hola, acabo de pagar mi recarga en eFFe.";
  const lineas = [
    base,
    "",
    `Medio: ${NOMBRE_MEDIO[opts.medio]}`,
    // Mismo formato que ve en pantalla y que saldrá en su boleta.
    `Monto: ${formatSoles(opts.monto)}`,
    `Código de pago: ${codigoDePago(opts.orderId)}`,
  ];
  if (opts.nombre?.trim()) lineas.push(`A nombre de: ${opts.nombre.trim()}`);
  return lineas.join("\n");
}

/** Los 8 primeros caracteres del id: suficiente para localizar el pago. */
export function codigoDePago(orderId: string): string {
  return orderId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export interface DatosDelVoucher {
  orderId: string;
  medio: MedioManual;
  monto: number;
  whatsapp: string;
  plantilla: string;
  nombre?: string;
}

/**
 * Abre WhatsApp con el voucher escrito, EN OTRA PESTAÑA.
 *
 * Se llama de forma síncrona dentro del clic y antes de tocar la base: después
 * de un `await`, el navegador móvil ya no considera que la apertura venga de un
 * gesto del usuario y la bloquea. Devuelve false si aun así no se pudo abrir
 * (bloqueador de ventanas emergentes), para poder ofrecer el enlace a mano.
 */
export function abrirVoucherEnWhatsApp(opts: DatosDelVoucher): boolean {
  return abrirWhatsAppAparte(mensajeDeVoucher(opts), opts.whatsapp);
}

/** El enlace del voucher, para ofrecerlo cuando la pestaña no se pudo abrir. */
export function enlaceDelVoucher(opts: DatosDelVoucher): string {
  return enlaceWhatsApp(mensajeDeVoucher(opts), opts.whatsapp);
}

/**
 * Marca que el comprador dice haber pagado.
 *
 * Va después de abrir WhatsApp, no antes: si esto falla, el pago sigue en la
 * bandeja del administrador —la orden existe desde que se eligió Yape— y lo
 * único que se pierde es el orden de la lista. Bloquear el envío del voucher
 * por eso sería peor.
 */
export async function confirmarPagoManual(opts: { orderId: string }): Promise<void> {
  const { error } = await supabase.rpc("confirmar_pago_manual", { p_order: opts.orderId });
  if (error) throw error;
}

/** Un pago propio que sigue esperando confirmación del equipo. */
export interface PagoEnEspera {
  orderId: string;
  listingId: string | null;
  metodo: MedioManual;
  total: number;
  proposito: string | null;
  confirmado: boolean;
  createdAt: string;
}

/**
 * Los pagos por Yape/Plin del usuario que aún no se han confirmado.
 *
 * Sirve para marcar sus avisos: un borrador que ya está pagado y esperando no
 * puede verse igual que uno a medio escribir, o volvería a pagarlo.
 */
export async function misPagosEnEspera(): Promise<PagoEnEspera[]> {
  try {
    const { data, error } = await supabase.rpc("mis_pagos_manuales_pendientes");
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      orderId: String(r.order_id),
      listingId: (r.listing_id as string | null) ?? null,
      metodo: (r.metodo === "plin" ? "plin" : "yape") as MedioManual,
      total: Number(r.total ?? 0),
      proposito: (r.proposito as string | null) ?? null,
      confirmado: r.confirmado === true,
      createdAt: String(r.created_at),
    }));
  } catch {
    // Si la consulta falla, la lista se muestra como siempre: es una marca de
    // ayuda, no un dato sin el cual la pantalla no funcione.
    return [];
  }
}

// ------------------------------------------------------------------ Administración

export interface PagoManual {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  metodo: MedioManual;
  total: number;
  detalle: string;
  proposito: string | null;
  listingId: string | null;
  listingTitle: string | null;
  status: "pending" | "paid" | "failed" | "refunded";
  confirmadoAt: string | null;
  revisadoAt: string | null;
  nota: string | null;
  createdAt: string;
}

export const PAGOS_MANUALES_PAGE_SIZE = 20;

interface FilaPagoManual {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  metodo: string;
  total: number | string;
  detalle: string | null;
  proposito: string | null;
  listing_id: string | null;
  listing_title: string | null;
  status: string;
  manual_confirmed_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  total_count: number | string;
}

export async function fetchPagosManuales(opts: {
  estado?: string;
  search?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<{ data: PagoManual[]; total: number }> {
  const pageSize = opts.pageSize ?? PAGOS_MANUALES_PAGE_SIZE;
  const page = Math.max(1, opts.page ?? 1);
  const { data, error } = await supabase.rpc("admin_pagos_manuales", {
    p_estado: opts.estado ?? "pending",
    p_search: opts.search?.trim() || null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw error;

  const filas = (data as FilaPagoManual[]) ?? [];
  return {
    total: Number(filas[0]?.total_count ?? 0),
    data: filas.map((r) => ({
      id: r.id,
      userId: r.user_id,
      fullName: r.full_name ?? "Usuario eliminado",
      email: r.email ?? "",
      metodo: (r.metodo === "plin" ? "plin" : "yape") as MedioManual,
      total: Number(r.total ?? 0),
      detalle: r.detalle ?? "Compra de saldo",
      proposito: r.proposito,
      listingId: r.listing_id,
      listingTitle: r.listing_title,
      status: r.status as PagoManual["status"],
      confirmadoAt: r.manual_confirmed_at,
      revisadoAt: r.reviewed_at,
      nota: r.review_note,
      createdAt: r.created_at,
    })),
  };
}

/** Cuántos pagos esperan revisión. Alimenta el aviso del menú del panel. */
export async function contarPagosManualesPendientes(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc("admin_pagos_manuales_pendientes");
    if (error) throw error;
    return Number(data ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Aprueba el pago. `monto` solo se manda si el administrador lo corrigió
 * porque el voucher no coincide con lo calculado.
 */
export async function aprobarPagoManual(
  orderId: string,
  monto?: number,
  nota?: string,
): Promise<{ published?: boolean | null }> {
  const { data, error } = await supabase.rpc("admin_aprobar_pago_manual", {
    p_order: orderId,
    p_monto: monto ?? null,
    p_nota: nota?.trim() || null,
  });
  if (error) throw error;
  const res = (data ?? {}) as Record<string, unknown>;
  return { published: (res.published as boolean | null) ?? null };
}

export async function rechazarPagoManual(orderId: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc("admin_rechazar_pago_manual", {
    p_order: orderId,
    p_motivo: motivo,
  });
  if (error) throw error;
}

/** Guarda la configuración (cuentas, WhatsApp y mensaje). Solo superadmin. */
export async function guardarConfigYapePlin(cfg: ConfigYapePlin): Promise<void> {
  const { error } = await supabase.rpc("set_setting", {
    p_key: "yape_plin",
    p_value: {
      activo: cfg.activo,
      cuentas: cfg.cuentas,
      whatsapp: cfg.whatsapp.trim(),
      mensaje: cfg.mensaje.trim(),
    },
    p_label: "Yape/Plin: cuentas, WhatsApp de comprobantes y mensaje predeterminado",
  });
  if (error) throw error;
}
