// =====================================================================
// emit-invoice — envía al comprador su comprobante de compra de saldo.
//
// La llama la propia base de datos (pg_net) en cuanto se liquida un pago, y
// también el barrido periódico y el botón de reintento del panel.
//
// Principio: esto NUNCA puede costarle créditos al usuario. Cuando llega aquí,
// el pago ya está liquidado y los créditos acreditados; si algo falla, se
// registra, se reintenta luego y se devuelve 200 igual — el estado lo gobierna
// la base de datos, no el código HTTP.
//
// Secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — acceso a la base
//   INVOICE_WORKER_SECRET  — debe coincidir con system_settings.invoice_worker_secret
//   RESEND_API_KEY         — sin ella no se envía correo (queda 'omitido')
//   INVOICE_EMAIL_FROM     — remitente; por defecto el de pruebas de Resend
//   EMISOR_NOMBRE, EMISOR_RUC — datos que salen impresos en el comprobante
//   PUBLIC_SITE_URL        — para el enlace a "Mis comprobantes"
//
// Deploy: supabase functions deploy emit-invoice --no-verify-jwt
//   (la llama la base de datos, sin sesión; se identifica con el secreto)
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderComprobantePDF, toBase64 } from "../_shared/comprobante-pdf.ts";
import {
  construirComprobante, construirNotaDeCredito, leerRespuesta, consultaDeComprobante,
  ComprobanteInvalido, TIPO_DOC_NOTA_CREDITO, type ClienteDocTipo,
} from "../_shared/factiliza.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const WORKER_SECRET = Deno.env.get("INVOICE_WORKER_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("INVOICE_EMAIL_FROM")
  ?? "eFFe Clasificados <onboarding@resend.dev>";
const EMISOR_NOMBRE = Deno.env.get("EMISOR_NOMBRE") ?? "eFFe Multiclasificados";
const EMISOR_RUC = Deno.env.get("EMISOR_RUC") ?? "";
const SITE_URL = Deno.env.get("PUBLIC_SITE_URL") ?? "https://www.coleffe.com";
/** Dirección de respuesta del correo. Que el cliente pueda contestar ayuda a la
 *  reputación del remitente: los proveedores penalizan los envíos "mudos".
 *
 *  El default era `soporte@coleffe.com`, que NO es un buzón real en cPanel: quien
 *  contestara al comprobante escribía al vacío. Se usa el mismo que recibe el
 *  Libro de Reclamaciones (`RECLAMOS_TO`), que sí está en pie y verificado. */
const SOPORTE_EMAIL = Deno.env.get("SOPORTE_EMAIL") ?? "avisos@coleffe.com";

// ─── Factiliza ────────────────────────────────────────────────────────────────
// OJO: Factiliza vende DOS productos con DOS tokens distintos, y no son
// intercambiables. Medido el 2026-08-15: el token de facturación devuelve 401
// contra la API de consultas, y el de consultas devuelve 401 contra la de
// facturación.
//
// Por eso esta función tiene su propia variable. Antes leía `FACTILIZA_TOKEN`,
// la misma que usa verify-doc para validar DNI/RUC al registrarse: poner ahí el
// token de facturación habría roto la verificación de documentos de toda la app.
//
// El fallback a `FACTILIZA_TOKEN` se mantiene para no romper lo que ya está
// desplegado mientras no se configure la variable nueva.
const FACTILIZA_TOKEN = Deno.env.get("FACTILIZA_INVOICE_TOKEN")
  || Deno.env.get("FACTILIZA_TOKEN")
  || "";
// Por defecto el entorno de PRUEBAS que publica su documentación. Emitir de
// verdad tiene que ser una decisión explícita, no lo que pasa por olvidarse de
// configurar una variable.
//
// ⚠️ Comprobado el 2026-08-11: ese host de QA responde 404 —también en su raíz—,
// o sea que no está en pie. El endpoint que SÍ existe es el de producción,
// `https://apife.factiliza.com/api/v1/invoice/send`, que contesta 401 sin token.
//
// Se deja el de pruebas como valor por defecto A PROPÓSITO: si nadie configura
// nada, la emisión FALLA en vez de mandar un documento fiscal de verdad sin
// querer. Fallar cerrado. Antes de apuntar a producción hay que preguntarle a su
// soporte si la cuenta está en modo demo (sus respuestas de ejemplo empiezan por
// "DEMO - …", así que parece haber un interruptor por cuenta) o cuál es la URL
// de pruebas vigente.
const FACTILIZA_URL = Deno.env.get("FACTILIZA_INVOICE_URL")
  ?? "https://apife-qa.factiliza.com/api/v1/invoice/send";

/**
 * Días que puede pasar un comprobante en cola antes de dejar de intentarlo.
 *
 * SUNAT rechaza los comprobantes fuera de plazo, y la fecha de emisión se
 * congela en el primer intento (la fija la BD, ver 0083). Un comprobante que se
 * quedó atascado porque faltaba configuración NO puede enviarse un mes después
 * con la fecha vieja: pasa a revisión y lo resuelve contabilidad. Sin esto, el
 * día que se enciendan los secrets se dispararía una avalancha de rechazos.
 *
 * TIENE QUE COINCIDIR con el plazo de `claim_invoice_emission` (migración 0083).
 * Estuvo en 5 mientras la base de datos usaba 3, y el efecto era feo: pasados
 * los 3 días la reserva ya devolvía 0 filas, así que esta comprobación no llegaba
 * a ejecutarse nunca y el comprobante se quedaba MUDO en 'pendiente', sin
 * marcarse vencido y sin `needs_review`. Nadie se enteraba.
 */
const DIAS_DE_PLAZO = 3;

/**
 * RUC del emisor cuando el comprobante es de prueba.
 *
 * En el entorno de pruebas de Factiliza el emisor dado de alta es el SUYO
 * (10749283781), no el nuestro: mandar el de Coleffe devuelve «Su usuario no se
 * encuentra configurado para el RUC». Por eso van en variables separadas — y
 * `EMISOR_RUC` se queda intacto, que es el que sale en los comprobantes de los
 * clientes reales.
 */
const EMISOR_RUC_PRUEBAS = Deno.env.get("EMISOR_RUC_PRUEBAS") ?? "";

/** El RUC que toca según de qué comprobante se trate. */
const rucDelEmisor = (esPrueba: boolean) =>
  (esPrueba && EMISOR_RUC_PRUEBAS) ? EMISOR_RUC_PRUEBAS : EMISOR_RUC;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** Comparación en tiempo constante: un `===` filtra el secreto por su duración. */
function secretoValido(recibido: string): boolean {
  if (!WORKER_SECRET || recibido.length !== WORKER_SECRET.length) return false;
  let dif = 0;
  for (let i = 0; i < WORKER_SECRET.length; i++) {
    dif |= WORKER_SECRET.charCodeAt(i) ^ recibido.charCodeAt(i);
  }
  return dif === 0;
}

/** Staff con permiso de edición en el módulo de pagos (reintento manual). */
async function esStaffAutorizado(auth: string | null): Promise<boolean> {
  const token = auth?.replace(/^Bearer\s+/i, "") ?? "";
  // La anon key no identifica a nadie: mismo criterio que verify-doc.
  if (!token || token === ANON_KEY) return false;
  const user = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await user.rpc("has_perm", {
    p_module: "Pagos y planes",
    p_action: "edit",
  });
  return !error && data === true;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const money = (n: number, moneda: string) =>
  `${moneda === "USD" ? "US$" : "S/"} ${Number(n ?? 0).toFixed(2)}`;

/**
 * Descarga de Factiliza la representación OFICIAL del comprobante.
 *
 * Es lo que hay que mandarle al cliente cuando el documento está declarado, y
 * no el PDF que dibujamos nosotros: la representación impresa de un comprobante
 * electrónico tiene requisitos de SUNAT —código QR, hash, leyendas— que un PDF
 * hecho en casa no cumple. El nuestro sirve como comprobante interno mientras no
 * hay emisión; en cuanto la hay, el bueno es el suyo.
 *
 * El XML importa aún más: **legalmente, el comprobante ES el XML firmado**. El
 * PDF es solo su representación.
 *
 * Devuelve null si no se puede: nunca deja al comprador sin correo por esto.
 */
async function descargarDeFactiliza(
  recurso: "pdf" | "xml",
  datos: { tipoDoc: string; serie: string; correlativo: string; emisorRuc: string },
  // Las notas de crédito se descargan de `/note/pdf` y `/note/xml`. El cuerpo es
  // idéntico —lo único que cambia es la familia de rutas y el tipo de documento.
  familia: "invoice" | "note" = "invoice",
): Promise<Uint8Array | null> {
  if (!FACTILIZA_TOKEN || !datos.emisorRuc) return null;
  try {
    const res = await fetch(familia === "note" ? urlDeNota(recurso) : urlDeFactiliza(recurso), {
      method: "POST",
      headers: { Authorization: `Bearer ${FACTILIZA_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo_Doc: datos.tipoDoc,
        serie: datos.serie,
        correlativo: datos.correlativo,
        empresa_Ruc: datos.emisorRuc,
      }),
    });
    if (!res.ok) return null;
    const tipo = res.headers.get("content-type") ?? "";
    // Si contesta JSON es un error suyo, no el fichero.
    if (tipo.includes("application/json")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength > 0 ? buf : null;
  } catch {
    return null;
  }
}

/**
 * La misma información, en texto plano.
 *
 * No es un adorno: un correo que solo lleva HTML y un PDF adjunto tiene la
 * forma exacta de un phishing, y los filtros lo tratan como tal. Mandar las dos
 * versiones es de las cosas que más peso tienen para acabar en la bandeja de
 * entrada en vez de en spam.
 */
function textoCorreo(inv: Record<string, unknown>, declarado: boolean, esPrueba: boolean): string {
  const total = money(Number(inv.o_amount), "PEN");
  const lineas = [
    `Comprobante ${inv.o_number}`,
    "",
    `Hola ${String(inv.o_advertiser_name ?? "")}, gracias por tu compra.`,
    "Adjuntamos el comprobante en PDF.",
    "",
    `Detalle: ${String(inv.o_detail ?? "")}`,
    `Total: ${total}`,
    "",
  ];
  if (esPrueba) {
    lineas.push(
      "AVISO: documento de prueba, sin valor fiscal. Se generó contra el entorno",
      "de pruebas y no es un comprobante válido ante SUNAT.",
      "",
    );
  } else if (!declarado) {
    lineas.push("Este documento es un comprobante interno y no constituye documento tributario.", "");
  }
  lineas.push(
    `Puedes ver todos tus comprobantes en ${SITE_URL}/dashboard/anunciante/boletas`,
    "",
    "eFFe Multiclasificados",
  );
  return lineas.join("\n");
}

function htmlCorreo(inv: Record<string, unknown>, declarado: boolean, esPrueba: boolean): string {
  const numero = esc(inv.o_number);
  const total = money(Number(inv.o_amount), "PEN");
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;padding:24px;
    font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#22262e">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e8ec;border-radius:12px;overflow:hidden">
      <div style="background:#132a4a;color:#fff;padding:20px 24px">
        <div style="font-size:18px;font-weight:800">eFFe Multiclasificados</div>
      </div>
      ${esPrueba
        ? `<div style="background:#fff4e5;border-bottom:1px solid #f5c78a;color:#8a4b00;
                       padding:14px 24px;font-size:13px;line-height:1.5">
             <strong>Documento de prueba — sin valor fiscal.</strong> Se generó contra el
             entorno de pruebas: no es un comprobante válido ante SUNAT.
           </div>`
        : ""}
      <div style="padding:24px">
        <h1 style="margin:0 0 8px;font-size:18px">Tu comprobante ${numero}</h1>
        <p style="margin:0 0 16px;color:#5b6270;font-size:14px;line-height:1.6">
          Hola ${esc(inv.o_advertiser_name) || "y gracias por tu compra"}, adjuntamos el
          comprobante de tu compra de saldo.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:8px 0;color:#5b6270">Detalle</td>
              <td style="padding:8px 0;text-align:right">${esc(inv.o_detail)}</td></tr>
          <tr><td style="padding:8px 0;color:#5b6270">Total</td>
              <td style="padding:8px 0;text-align:right;font-weight:700">${total}</td></tr>
        </table>
        ${declarado
          ? ""
          : `<p style="margin:16px 0 0;color:#8a919e;font-size:12px;line-height:1.5">
               Este documento es un comprobante interno de tu compra y no constituye
               documento tributario.</p>`}
        <p style="margin:24px 0 0">
          <a href="${SITE_URL}/dashboard/anunciante/boletas"
             style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;
                    padding:12px 20px;border-radius:8px;font-weight:700;font-size:14px">
            Ver mis comprobantes
          </a>
        </p>
      </div>
    </div></body></html>`;
}

/** Los créditos no son soles: se muestran a secas y sin decimales de adorno. */
const creditos = (n: unknown) =>
  Number(n ?? 0).toFixed(2).replace(/\.00$/, "");

/**
 * El correo de la ANULACIÓN.
 *
 * Va aparte del anterior a propósito: no es "tu comprobante" con otro texto, es
 * otra noticia. Quien lo recibe ya tiene en su bandeja la boleta original, y lo
 * que necesita saber es que aquella quedó sin efecto, por qué, y cuánto saldo se
 * le retiró. Adjunta la nota de crédito, que es el documento que ante SUNAT
 * anula al primero.
 *
 * Sobre la devolución del dinero no se promete nada: el reintegro del cobro se
 * hace a mano en el panel de Izipay y no todas las anulaciones lo llevan. Se
 * remite a soporte, que es lo honesto.
 */
function textoAnulacion(n: Record<string, unknown>, esPrueba: boolean, conAdjunto: boolean): string {
  const lineas = [
    `Anulación del comprobante ${n.o_number}`,
    "",
    `Hola ${String(n.o_advertiser_name ?? "")}, anulamos tu compra y con ella el`,
    `comprobante ${n.o_number}.`,
    "",
    `Motivo: ${String(n.o_motivo ?? "—")}`,
    `Nota de crédito: ${n.o_nota_number}`,
    `Importe del comprobante: ${money(Number(n.o_amount), "PEN")}`,
    `Créditos retirados de tu saldo: ${creditos(n.o_credits_devueltos)}`,
    "",
  ];
  lineas.push(
    conAdjunto
      ? "Adjuntamos la nota de crédito en PDF y XML: es el documento que deja sin\nefecto el comprobante anterior."
      : "La nota de crédito ya está emitida. Si necesitas el PDF o el XML,\nescríbenos y te los enviamos.",
    "",
  );
  if (esPrueba) {
    lineas.push(
      "AVISO: documento de prueba, sin valor fiscal. Se generó contra el entorno",
      "de pruebas y no es un comprobante válido ante SUNAT.",
      "",
    );
  }
  lineas.push(
    `Si tienes dudas sobre la devolución del importe, escríbenos a ${SOPORTE_EMAIL}.`,
    "",
    `Puedes ver todos tus comprobantes en ${SITE_URL}/dashboard/anunciante/boletas`,
    "",
    "eFFe Multiclasificados",
  );
  return lineas.join("\n");
}

function htmlAnulacion(n: Record<string, unknown>, esPrueba: boolean, conAdjunto: boolean): string {
  const fila = (etiqueta: string, valor: string) =>
    `<tr><td style="padding:8px 0;color:#5b6270">${etiqueta}</td>
         <td style="padding:8px 0;text-align:right">${valor}</td></tr>`;
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;padding:24px;
    font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#22262e">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e8ec;border-radius:12px;overflow:hidden">
      <div style="background:#132a4a;color:#fff;padding:20px 24px">
        <div style="font-size:18px;font-weight:800">eFFe Multiclasificados</div>
      </div>
      ${esPrueba
        ? `<div style="background:#fff4e5;border-bottom:1px solid #f5c78a;color:#8a4b00;
                       padding:14px 24px;font-size:13px;line-height:1.5">
             <strong>Documento de prueba — sin valor fiscal.</strong> Se generó contra el
             entorno de pruebas: no es un comprobante válido ante SUNAT.
           </div>`
        : ""}
      <div style="padding:24px">
        <h1 style="margin:0 0 8px;font-size:18px">Se anuló tu compra</h1>
        <p style="margin:0 0 16px;color:#5b6270;font-size:14px;line-height:1.6">
          Hola ${esc(n.o_advertiser_name) || "de nuevo"}, el comprobante
          <strong>${esc(n.o_number)}</strong> quedó sin efecto y los créditos de esa
          compra se retiraron de tu saldo.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${fila("Motivo", esc(n.o_motivo) || "—")}
          ${fila("Nota de crédito", esc(n.o_nota_number))}
          ${fila("Importe del comprobante", money(Number(n.o_amount), "PEN"))}
          ${fila("Créditos retirados", creditos(n.o_credits_devueltos))}
        </table>
        <p style="margin:16px 0 0;color:#5b6270;font-size:13px;line-height:1.6">
          ${conAdjunto
            ? "Adjuntamos la nota de crédito en PDF y XML: es el documento que deja sin efecto el comprobante anterior."
            : "La nota de crédito ya está emitida. Si necesitas el PDF o el XML, escríbenos y te los enviamos."}
        </p>
        <p style="margin:12px 0 0;color:#8a919e;font-size:12px;line-height:1.5">
          ¿Dudas sobre la devolución del importe? Escríbenos a
          <a href="mailto:${esc(SOPORTE_EMAIL)}" style="color:#5b6270">${esc(SOPORTE_EMAIL)}</a>.
        </p>
        <p style="margin:24px 0 0">
          <a href="${SITE_URL}/dashboard/anunciante/boletas"
             style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;
                    padding:12px 20px;border-radius:8px;font-weight:700;font-size:14px">
            Ver mis comprobantes
          </a>
        </p>
      </div>
    </div></body></html>`;
}

/** La misma base que el envío, cambiando el último tramo. */
const urlDeFactiliza = (recurso: "send" | "resend" | "cdr" | "pdf" | "xml") =>
  FACTILIZA_URL.replace(/\/send$/, `/${recurso}`);

/**
 * Las notas de crédito viven en otra familia de rutas: `/api/v1/note/*`, no
 * `/api/v1/invoice/*`. Por eso no vale `urlDeFactiliza`, que solo cambia el
 * último tramo.
 */
const urlDeNota = (recurso: "send" | "pdf" | "xml") =>
  FACTILIZA_URL.replace(/\/invoice\/send$/, `/note/${recurso}`);

/**
 * Pregunta a Factiliza si un comprobante ya existe. Es una LECTURA: no emite
 * nada, no consume correlativo y se puede lanzar sin miedo.
 *
 * Se usa para dos cosas: comprobar credenciales sin poner en circulación ningún
 * documento, y —antes de reenviar— saber si el anterior llegó de verdad. Un
 * envío que se cortó después de llegar a Factiliza pero antes de que
 * guardáramos su respuesta deja un documento emitido que nosotros creemos
 * pendiente; reenviarlo lo emitiría dos veces.
 */
async function consultarEnFactiliza(
  tipo: "boleta" | "factura", serie: string, correlativo: number | string,
): Promise<{ http: number; cuerpo: unknown }> {
  const res = await fetch(urlDeFactiliza("cdr"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FACTILIZA_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(consultaDeComprobante(EMISOR_RUC, tipo, serie, correlativo)),
  });
  const texto = await res.text();
  let cuerpo: unknown = texto;
  try { cuerpo = JSON.parse(texto); } catch { /* puede devolver el fichero en crudo */ }
  return { http: res.status, cuerpo };
}

/**
 * Emite el comprobante ante SUNAT a través de Factiliza.
 *
 * Nunca lanza y nunca bloquea nada: si no se puede emitir, el comprobante queda
 * marcado y el correo sale igual, como documento interno. El usuario ya pagó.
 *
 * Devuelve el desenlace, o null si no había nada que emitir (que es el caso
 * normal mientras la emisión esté apagada).
 */
async function emitirEnSunat(invoiceId: string): Promise<string | null> {
  const { data: claim, error } = await admin.rpc("claim_invoice_emission", {
    p_invoice_id: invoiceId,
    p_lease_seconds: 300,
  });
  if (error) {
    console.error("[emit-invoice] no se pudo reclamar la emisión:", error.message);
    return null;
  }
  const inv = (Array.isArray(claim) ? claim[0] : claim) as Record<string, unknown> | null;
  if (!inv) return null; // no toca: ya emitido, omitido, o reclamado por otro

  const id = String(inv.o_id);
  const claimId = String(inv.o_claim_id);
  const intento = Number(inv.o_attempts ?? 1);
  // En pruebas el emisor dado de alta es el de Factiliza, no el nuestro.
  const emisorRuc = rucDelEmisor(inv.o_es_prueba === true);

  const rendirse = async (motivo: string) => {
    await admin.rpc("mark_invoice_skipped", { p_invoice_id: id, p_reason: motivo });
    return "omitido";
  };

  if (!FACTILIZA_TOKEN) return await rendirse("Falta el token de facturación (FACTILIZA_INVOICE_TOKEN)");
  if (!emisorRuc) {
    return await rendirse(inv.o_es_prueba === true
      ? "Falta el RUC del emisor de pruebas (EMISOR_RUC_PRUEBAS)"
      : "Falta el RUC del emisor (EMISOR_RUC)");
  }

  // Plazo: la fecha se congeló en el primer intento y no se recalcula.
  const emitida = new Date(String(inv.o_fecha_emision ?? Date.now()));
  const dias = (Date.now() - emitida.getTime()) / 86_400_000;
  if (dias > DIAS_DE_PLAZO) {
    await admin.rpc("finish_invoice_emission", {
      p_invoice_id: id, p_claim_id: claimId, p_status: "vencido",
      p_error_message: `Fuera de plazo: la fecha de emisión es de hace ${Math.floor(dias)} días`,
      p_needs_review: true,
    });
    return "vencido";
  }

  // La dirección fiscal, si Factiliza la devolvió al verificar el documento.
  const ficha = (inv.o_factiliza_data ?? {}) as Record<string, unknown>;
  const direccion = [ficha.direccion, ficha.direccion_completa, ficha.domicilio_fiscal]
    .find((v) => typeof v === "string" && v.trim()) as string | undefined;

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = construirComprobante({
      tipo: inv.o_type === "factura" ? "factura" : "boleta",
      serie: String(inv.o_serie),
      correlativo: Number(inv.o_correlativo),
      fechaEmision: emitida,
      emisorRuc,
      clienteDocTipo: (inv.o_doc_type as ClienteDocTipo | null) ?? null,
      clienteDocNumero: (inv.o_doc_number as string) ?? null,
      clienteNombre: String(inv.o_advertiser_name ?? ""),
      clienteDireccion: direccion ?? null,
      descripcion: String(inv.o_detail ?? "Compra de saldo"),
      total: Number(inv.o_amount ?? 0),
      subtotal: Number(inv.o_subtotal ?? 0),
      igv: Number(inv.o_igv ?? 0),
      idBaseDato: id,
    });
  } catch (e) {
    // Los datos no dan un documento válido. No se gasta un envío: esto no se
    // arregla reintentando, lo tiene que mirar alguien.
    const motivo = e instanceof ComprobanteInvalido ? e.message : "No se pudo construir el comprobante";
    await admin.rpc("finish_invoice_emission", {
      p_invoice_id: id, p_claim_id: claimId, p_status: "rechazado",
      p_error_code: "LOCAL", p_error_message: motivo, p_needs_review: true,
    });
    return "rechazado";
  }

  // ── ¿enviar o REPROCESAR? ──
  // Si un intento anterior llegó a Factiliza, guardó su hash: el documento está
  // en su sistema y `/invoice/send` contestaría «ya existe» para siempre. Para
  // eso tienen `/invoice/resend`, que vuelve a empujarlo hacia SUNAT sin
  // duplicarlo. Sin esto, un fallo pasajero entre ellos y SUNAT dejaba el
  // comprobante muerto y había que pedirles el reproceso a mano.
  const { data: previo } = await admin
    .from("invoices").select("sunat_hash").eq("id", id).maybeSingle();
  const yaRegistrado = Boolean(previo?.sunat_hash);
  const url = yaRegistrado ? urlDeFactiliza("resend") : FACTILIZA_URL;

  let httpStatus = 0;
  let respuesta: unknown = null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FACTILIZA_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cuerpo),
    });
    httpStatus = res.status;
    respuesta = await res.json().catch(() => null);
  } catch (e) {
    respuesta = { message: e instanceof Error ? e.message : "fallo de red" };
  }

  const r = leerRespuesta(httpStatus, respuesta);

  await admin.rpc("log_invoice_attempt", {
    p_invoice_id: id, p_step: "sunat", p_attempt: intento,
    p_http_status: httpStatus, p_ok: r.desenlace === "aceptado" || r.desenlace === "observado",
    // El cuerpo enviado queda guardado: sin él, reconstruir por qué SUNAT
    // rechazó un comprobante de hace tres semanas es adivinar.
    p_request: cuerpo,
    p_response: (respuesta ?? { message: r.mensaje }) as Record<string, unknown>,
  });

  await admin.rpc("finish_invoice_emission", {
    p_invoice_id: id,
    p_claim_id: claimId,
    p_status: r.desenlace,
    p_hash: r.hash,
    p_cdr: r.cdr,
    p_cdr_zip: r.cdrZip,
    p_error_code: r.codigo,
    p_error_message: r.desenlace === "aceptado" ? null : r.mensaje,
    p_needs_review: r.desenlace === "rechazado" || r.desenlace === "observado",
    // Esperar en su cola no es fallar: no gasta intento ni manda nada a revisión.
    p_espera: r.esperando === true,
  });

  return r.desenlace;
}

/** Envía el comprobante por correo. Devuelve el resultado, nunca lanza. */
/**
 * Manda a SUNAT la nota de crédito que anula un comprobante.
 *
 * Se llama en el mismo aviso que la emisión normal: si el comprobante no tiene
 * ninguna nota pendiente, la reserva devuelve cero filas y esto no hace nada.
 * Así el disparo desde la base de datos y el barrido sirven para las dos cosas
 * sin tener que distinguirlas.
 *
 * Devuelve el desenlace, o null si no había nada que mandar.
 */
async function emitirNotaDeCredito(invoiceId: string): Promise<string | null> {
  const { data: claim, error } = await admin.rpc("claim_invoice_note", {
    p_invoice_id: invoiceId,
    p_lease_seconds: 300,
  });
  if (error) {
    console.error("[emit-invoice] no se pudo reclamar la nota:", error.message);
    return null;
  }
  const n = (Array.isArray(claim) ? claim[0] : claim) as Record<string, unknown> | null;
  if (!n) return null;   // no hay nota pendiente: el caso normal

  const claimId = String(n.o_claim_id);
  const intento = Number(n.o_attempts ?? 1);
  const esPrueba = n.o_es_prueba === true;
  const emisorRuc = rucDelEmisor(esPrueba);

  const rendirse = async (motivo: string) => {
    await admin.rpc("finish_invoice_note", {
      p_invoice_id: invoiceId, p_claim_id: claimId, p_status: "omitido",
      p_error_code: "LOCAL", p_error_message: motivo,
    });
    return "omitido";
  };

  if (!FACTILIZA_TOKEN) return await rendirse("Falta el token de facturación");
  if (!emisorRuc) return await rendirse("Falta el RUC del emisor");

  const ficha = (n.o_factiliza_data ?? {}) as Record<string, unknown>;
  const direccion = [ficha.direccion, ficha.direccion_completa, ficha.domicilio_fiscal]
    .find((v) => typeof v === "string" && v.trim()) as string | undefined;

  // El número del comprobante anulado va SIN los ceros de relleno: B066-24, no
  // B066-000024. Es lo que espera su API y lo que se comprobó contra ella.
  const afectado = String(n.o_afectado_number).replace(/-0*(\d+)$/, "-$1");

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = construirNotaDeCredito({
      serie: String(n.o_nota_serie),
      correlativo: Number(n.o_nota_correlativo),
      fechaEmision: new Date(String(n.o_fecha_emision ?? Date.now())),
      emisorRuc,
      afectado: { tipo: n.o_type === "factura" ? "factura" : "boleta", numero: afectado },
      clienteDocTipo: (n.o_doc_type as ClienteDocTipo | null) ?? null,
      clienteDocNumero: (n.o_doc_number as string) ?? null,
      clienteNombre: String(n.o_advertiser_name ?? ""),
      clienteDireccion: direccion ?? null,
      descripcion: `Anulación: ${String(n.o_motivo ?? "anulación de la operación")}`.slice(0, 240),
      total: Number(n.o_amount ?? 0),
      subtotal: Number(n.o_subtotal ?? 0),
      igv: Number(n.o_igv ?? 0),
    });
  } catch (e) {
    const motivo = e instanceof ComprobanteInvalido ? e.message : "No se pudo construir la nota";
    await admin.rpc("finish_invoice_note", {
      p_invoice_id: invoiceId, p_claim_id: claimId, p_status: "rechazado",
      p_error_code: "LOCAL", p_error_message: motivo,
    });
    return "rechazado";
  }

  let httpStatus = 0;
  let respuesta: unknown = null;
  try {
    const res = await fetch(urlDeNota("send"), {
      method: "POST",
      headers: { Authorization: `Bearer ${FACTILIZA_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    httpStatus = res.status;
    respuesta = await res.json().catch(() => null);
  } catch (e) {
    respuesta = { message: e instanceof Error ? e.message : "fallo de red" };
  }

  const r = leerRespuesta(httpStatus, respuesta);

  await admin.rpc("log_invoice_attempt", {
    p_invoice_id: invoiceId, p_step: "nota", p_attempt: intento,
    p_http_status: httpStatus, p_ok: r.desenlace === "aceptado" || r.desenlace === "observado",
    p_request: cuerpo,
    p_response: (respuesta ?? { message: r.mensaje }) as Record<string, unknown>,
  });

  await admin.rpc("finish_invoice_note", {
    p_invoice_id: invoiceId, p_claim_id: claimId, p_status: r.desenlace,
    p_hash: r.hash, p_cdr: r.cdr,
    p_error_code: r.codigo,
    p_error_message: r.desenlace === "aceptado" ? null : r.mensaje,
    p_espera: r.esperando === true,
  });

  return r.desenlace;
}

async function enviarCorreo(inv: Record<string, unknown>) {
  const claimId = String(inv.o_claim_id);
  const id = String(inv.o_id);

  if (!RESEND_API_KEY) {
    await admin.rpc("finish_invoice_email", {
      p_invoice_id: id, p_claim_id: claimId, p_status: "omitido",
      p_message_id: null, p_error: "Correo no configurado (falta RESEND_API_KEY)",
    });
    return { email: "omitido" as const };
  }

  const declarado = inv.o_sunat_status === "aceptado" || inv.o_sunat_status === "observado";
  // Del COMPROBANTE, no del entorno: mientras se prueba contra QA, las compras
  // reales siguen generando su comprobante interno y a esos clientes no se les
  // puede mandar un correo diciendo que es una prueba.
  const esPrueba = inv.o_es_prueba === true;

  // ── El comprobante que se adjunta ──
  // Si el documento está declarado, el que vale es el de Factiliza: lleva el QR
  // y el hash que exige SUNAT en la representación impresa. El nuestro solo es
  // el sustituto mientras no hay emisión electrónica (o si su descarga falla,
  // que nunca puede dejar al comprador sin su correo).
  const adjuntos: Array<{ filename: string; content: string }> = [];
  let pdfOficial: Uint8Array | null = null;

  if (declarado) {
    const [serie, corr] = String(inv.o_number).split("-");
    const datos = {
      tipoDoc: inv.o_type === "factura" ? "01" : "03",
      serie,
      correlativo: String(Number(corr)),   // sin los ceros a la izquierda
      emisorRuc: rucDelEmisor(esPrueba),
    };
    pdfOficial = await descargarDeFactiliza("pdf", datos);
    if (pdfOficial) {
      adjuntos.push({ filename: `${inv.o_number}.pdf`, content: toBase64(pdfOficial) });
      // El XML firmado es, legalmente, el comprobante. El PDF solo lo
      // representa, así que se manda también.
      const xml = await descargarDeFactiliza("xml", datos);
      if (xml) adjuntos.push({ filename: `${inv.o_number}.xml`, content: toBase64(xml) });
    }
  }

  const pdf = renderComprobantePDF({
    numero: String(inv.o_number),
    tipo: inv.o_type === "factura" ? "factura" : "boleta",
    fecha: new Date(String(inv.o_issued_at)),
    clienteNombre: String(inv.o_advertiser_name ?? ""),
    clienteDocTipo: (inv.o_doc_type as string) ?? null,
    clienteDocNumero: (inv.o_doc_number as string) ?? null,
    detalle: String(inv.o_detail ?? "Compra de saldo"),
    subtotal: Number(inv.o_subtotal ?? 0),
    igv: Number(inv.o_igv ?? 0),
    total: Number(inv.o_amount ?? 0),
    moneda: "PEN",
    emisorNombre: EMISOR_NOMBRE,
    emisorRuc: rucDelEmisor(esPrueba) || null,
    sunat: declarado ? { aceptado: true } : null,
    pruebas: esPrueba,
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [String(inv.o_email)],
        // El asunto va limpio a propósito. Antes empezaba por "[PRUEBA]", y un
        // asunto que arranca con una etiqueta en corchetes y mayúsculas es un
        // patrón clásico de spam: los filtros lo castigan. El aviso de que el
        // documento no tiene valor fiscal está donde importa —bien visible en
        // el cuerpo y en el propio PDF—, no en la línea que deciden los filtros.
        subject: `Comprobante ${inv.o_number} de tu compra en eFFe Multiclasificados`,
        html: htmlCorreo(inv, declarado, esPrueba),
        // Versión en texto plano. Un correo con solo HTML y un adjunto se
        // parece demasiado a un phishing; con su alternativa de texto sube
        // bastante la probabilidad de llegar a la bandeja de entrada.
        text: textoCorreo(inv, declarado, esPrueba),
        reply_to: SOPORTE_EMAIL,
        headers: {
          // Marca el correo como transaccional y no promocional: le dice a
          // Gmail que no lo agrupe en Promociones ni lo trate como campaña.
          "X-Entity-Ref-ID": String(inv.o_number),
        },
        // El oficial si se pudo descargar; si no, el nuestro. Nadie se queda
        // sin comprobante porque su servicio de PDF esté caído.
        attachments: adjuntos.length
          ? adjuntos
          : [{ filename: `${inv.o_number}.pdf`, content: toBase64(pdf) }],
      }),
    });
    const cuerpo = await res.json().catch(() => ({}));

    await admin.rpc("log_invoice_attempt", {
      p_invoice_id: id, p_step: "email", p_attempt: Number(inv.o_attempts ?? 1),
      p_http_status: res.status, p_ok: res.ok,
      // Se anota QUÉ se adjuntó, no solo a quién se mandó: si el PDF fue el
      // oficial de Factiliza o el nuestro de reserva es justo el dato que hace
      // falta cuando alguien pregunta por un comprobante de hace semanas.
      p_request: {
        to: inv.o_email,
        from: EMAIL_FROM,
        pdf: pdfOficial ? "oficial (Factiliza)" : "interno (generado por nosotros)",
        adjuntos: (adjuntos.length ? adjuntos : [{ filename: `${inv.o_number}.pdf` }])
          .map((a) => a.filename),
      },
      p_response: cuerpo,
    });

    await admin.rpc("finish_invoice_email", {
      p_invoice_id: id, p_claim_id: claimId,
      p_status: res.ok ? "enviado" : "error",
      p_message_id: (cuerpo as { id?: string })?.id ?? null,
      p_error: res.ok ? null : `Resend respondió ${res.status}`,
    });
    return { email: res.ok ? ("enviado" as const) : ("error" as const) };
  } catch (e) {
    await admin.rpc("finish_invoice_email", {
      p_invoice_id: id, p_claim_id: claimId, p_status: "error",
      p_message_id: null, p_error: e instanceof Error ? e.message : "fallo de red",
    });
    return { email: "error" as const };
  }
}

/**
 * Manda al comprador la nota de crédito que anula su compra.
 *
 * La reserva solo concede el turno cuando SUNAT ya dio la nota por buena, así
 * que aquí no hay que comprobar nada de eso: si devuelve una fila, hay un
 * documento válido que enviar.
 *
 * El adjunto es siempre el de Factiliza —el PDF de una nota de crédito no lo
 * dibujamos nosotros—, y si su descarga falla se reintenta un par de veces antes
 * de mandar el correo sin él. El orden importa: es preferible que la noticia
 * llegue tarde con el documento a que llegue puntual y vacía, pero nunca es
 * aceptable que no llegue.
 */
async function enviarCorreoDeAnulacion(invoiceId: string): Promise<string | null> {
  const { data: claim, error } = await admin.rpc("claim_invoice_note_email", {
    p_invoice_id: invoiceId,
    p_lease_seconds: 300,
  });
  if (error) {
    console.error("[emit-invoice] no se pudo reclamar el correo de la nota:", error.message);
    return null;
  }
  const n = (Array.isArray(claim) ? claim[0] : claim) as Record<string, unknown> | undefined;
  if (!n) return null;   // no hay ninguna anulación que avisar: el caso normal

  const claimId = String(n.o_claim_id);
  const cerrar = (estado: string, messageId: string | null, error: string | null) =>
    admin.rpc("finish_invoice_note_email", {
      p_invoice_id: invoiceId, p_claim_id: claimId,
      p_status: estado, p_message_id: messageId, p_error: error,
    });

  if (!RESEND_API_KEY) {
    await cerrar("omitido", null, "Correo no configurado (falta RESEND_API_KEY)");
    return "omitido";
  }

  const esPrueba = n.o_es_prueba === true;
  const intento = Number(n.o_attempts ?? 1);

  const datos = {
    tipoDoc: TIPO_DOC_NOTA_CREDITO,
    serie: String(n.o_nota_serie),
    correlativo: String(Number(n.o_nota_correlativo)),   // sin los ceros a la izquierda
    emisorRuc: rucDelEmisor(esPrueba),
  };
  const adjuntos: Array<{ filename: string; content: string }> = [];
  const pdf = await descargarDeFactiliza("pdf", datos, "note");
  if (pdf) {
    adjuntos.push({ filename: `${n.o_nota_number}.pdf`, content: toBase64(pdf) });
    const xml = await descargarDeFactiliza("xml", datos, "note");
    if (xml) adjuntos.push({ filename: `${n.o_nota_number}.xml`, content: toBase64(xml) });
  } else if (intento < 3) {
    // Aún hay margen para volver a intentarlo con el documento puesto.
    await cerrar("error", null, "No se pudo descargar la nota de crédito de Factiliza");
    return "error";
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [String(n.o_email)],
        subject: `Se anuló tu compra ${n.o_number} — nota de crédito ${n.o_nota_number}`,
        html: htmlAnulacion(n, esPrueba, adjuntos.length > 0),
        text: textoAnulacion(n, esPrueba, adjuntos.length > 0),
        reply_to: SOPORTE_EMAIL,
        headers: { "X-Entity-Ref-ID": String(n.o_nota_number) },
        ...(adjuntos.length ? { attachments: adjuntos } : {}),
      }),
    });
    const cuerpo = await res.json().catch(() => ({}));

    await admin.rpc("log_invoice_attempt", {
      p_invoice_id: invoiceId, p_step: "email_nota", p_attempt: intento,
      p_http_status: res.status, p_ok: res.ok,
      p_request: {
        to: n.o_email, from: EMAIL_FROM, nota: n.o_nota_number,
        adjuntos: adjuntos.map((a) => a.filename),
      },
      p_response: cuerpo,
    });

    await cerrar(
      res.ok ? "enviado" : "error",
      (cuerpo as { id?: string })?.id ?? null,
      res.ok ? null : `Resend respondió ${res.status}`,
    );
    return res.ok ? "enviado" : "error";
  } catch (e) {
    await cerrar("error", null, e instanceof Error ? e.message : "fallo de red");
    return "error";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const autorizado =
    secretoValido(req.headers.get("x-worker-secret") ?? "") ||
    (await esStaffAutorizado(req.headers.get("Authorization")));
  if (!autorizado) return json({ error: "No autorizado." }, 401);

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: "Función sin configurar." }, 503);
  }

  let body: {
    invoice_id?: string; sweep?: boolean; limit?: number;
    probe?: boolean; serie?: string; correlativo?: string | number; tipo?: "boleta" | "factura";
    /** Id que devolvió Resend, para preguntarle si el correo llegó de verdad. */
    email_status_id?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }

  // Comprobación de credenciales SIN emitir nada. Consulta un comprobante y
  // devuelve tal cual lo que conteste Factiliza, para poder verificar que el
  // token vale para la API de facturación antes de encender nada.
  // Diagnóstico del CORREO: pregunta a Resend qué pasó de verdad con un envío.
  //
  // Hace falta porque `email_status = 'enviado'` solo significa que Resend
  // ACEPTÓ el correo (nos devolvió un id), no que llegara a su destino. Un
  // rebote, un bloqueo del proveedor o una entrega a spam no se ven desde
  // nuestra base de datos, y sin esto la única respuesta posible a «no me
  // llegó» era encogerse de hombros.
  if (body.email_status_id) {
    if (!RESEND_API_KEY) return json({ ok: false, error: "Falta RESEND_API_KEY." });
    const r = await fetch(`https://api.resend.com/emails/${body.email_status_id}`, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    const cuerpo = await r.json().catch(() => null);
    return json({ ok: r.ok, http: r.status, resend: cuerpo });
  }

  if (body.probe) {
    if (!FACTILIZA_TOKEN) return json({ ok: false, error: "Falta FACTILIZA_TOKEN." });
    if (!EMISOR_RUC) return json({ ok: false, error: "Falta EMISOR_RUC." });
    // Se prueban las DOS APIs con el MISMO token, porque un 401 en facturación
    // significa cosas muy distintas según lo que conteste la de consultas:
    //   · consultas OK  + facturación 401 → el token no cubre facturación
    //   · las dos 401                     → el token no vale (caducado o mal)
    const facturacion = await consultarEnFactiliza(
      body.tipo === "factura" ? "factura" : "boleta",
      body.serie ?? "B001",
      body.correlativo ?? 1,
    ).catch((e) => ({ http: 0, cuerpo: String(e) }));

    // La API de consultas se prueba con SU token (el de verify-doc), no con el
    // de facturación: son productos distintos y mezclarlos daba un diagnóstico
    // engañoso — un 401 aquí no significaba nada.
    const TOKEN_CONSULTAS = Deno.env.get("FACTILIZA_TOKEN") ?? "";
    let consultas: { http: number; ok: boolean } = { http: 0, ok: false };
    try {
      const r = await fetch(`https://api.factiliza.com/v1/ruc/info/${EMISOR_RUC}`, {
        headers: { Authorization: `Bearer ${TOKEN_CONSULTAS}`, Accept: "application/json" },
      });
      consultas = { http: r.status, ok: r.ok };
    } catch { /* se queda en 0 */ }

    return json({
      ok: true,
      emisor: EMISOR_RUC,
      facturacion: { url: urlDeFactiliza("cdr"), ...facturacion },
      consultas: { url: "https://api.factiliza.com/v1/ruc/info/…", ...consultas },
      diagnostico:
        consultas.ok && facturacion.http === 401
          ? "El token vale para consultas pero NO para facturación: son productos distintos."
          : !consultas.ok && facturacion.http === 401
            ? "El token no vale en ninguna de las dos: caducado o incorrecto."
            : facturacion.http === 404
              ? "La ruta de facturación no existe en esa URL."
              : "Ver los códigos de arriba.",
    });
  }

  // Barrido: la base decide qué toca y vuelve a avisar de cada uno.
  if (body.sweep) {
    const { data, error } = await admin.rpc("sweep_invoice_emissions", {
      p_limit: body.limit ?? 20,
    });
    return json({ ok: !error, despachados: data ?? 0 });
  }

  if (!body.invoice_id) return json({ error: "Falta invoice_id." }, 400);

  // Paso 1 — emisión ante SUNAT. Va DELANTE del correo para que, cuando el
  // comprobante sea fiscal, el PDF que se adjunta ya lo diga. Si la emisión está
  // apagada esto no hace nada y el comprobante viaja como interno.
  const sunat = await emitirEnSunat(body.invoice_id);

  // Paso 1-bis — la nota de crédito, si el comprobante se anuló. No hace nada
  // cuando no hay ninguna pendiente, así que el mismo aviso de la base de datos
  // vale para emitir y para anular.
  const nota = await emitirNotaDeCredito(body.invoice_id);

  // Paso 1-ter — el correo con esa nota. Va detrás de emitirla para que, cuando
  // la anulación se despacha entera de una vez, el comprador reciba el aviso en
  // la misma pasada; si la nota se emitió en una llamada anterior, la reserva la
  // encuentra aquí igualmente.
  const notaCorreo = await enviarCorreoDeAnulacion(body.invoice_id);

  // Paso 2 — correo. Sale pase lo que pase con SUNAT: el usuario ya pagó y tiene
  // derecho a su comprobante aunque la emisión fiscal esté atascada.
  const { data: claim, error } = await admin.rpc("claim_invoice_email", {
    p_invoice_id: body.invoice_id,
    p_lease_seconds: 300,
  });
  if (error) {
    console.error("[emit-invoice] no se pudo reclamar:", error.message);
    return json({ ok: false, error: error.message });
  }
  const inv = Array.isArray(claim) ? claim[0] : claim;
  if (!inv) return json({ ok: true, claimed: false, sunat, nota, nota_correo: notaCorreo });

  const resultado = await enviarCorreo(inv as Record<string, unknown>);
  return json({ ok: true, invoice: inv.o_number, sunat, nota, nota_correo: notaCorreo, ...resultado });
});
