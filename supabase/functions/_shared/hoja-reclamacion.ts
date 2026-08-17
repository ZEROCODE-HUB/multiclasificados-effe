// La Hoja de Reclamación: el documento, no el formulario.
//
// El Reglamento del Libro de Reclamaciones (D.S. 011-2011-PCM y sus
// modificatorias) obliga a que, cuando el consumidor deja su correo, el
// proveedor le remita de inmediato una copia de la hoja que acaba de ingresar,
// con constancia de la fecha y hora en que quedó registrada. Hasta ahora el
// reclamo solo se le avisaba a la empresa; al consumidor no le llegaba nada.
//
// Aquí vive todo lo que se puede comprobar sin red: el PDF de la copia, el
// cuerpo de los correos y a quién va cada uno. La Edge Function se queda con la
// fontanería (guardar en la tabla, hablar con Resend).

import { A4_W, Lienzo, envolver, serializarPaginas } from "./pdf-basico.ts";

export interface DatosHoja {
  /** Correlativo de la hoja ("Hoja de Reclamación N.º ..."). */
  code: string | number;
  kind: "reclamo" | "queja";
  fullName: string;
  docType: string;
  docNumber: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  goodType: "producto" | "servicio";
  amount?: string | null;
  description: string;
  request: string;
  /** Momento exacto en que quedó registrada (lo pone la base de datos). */
  createdAt: Date;
}

/** Datos del proveedor, los mismos de los Términos y Condiciones. */
export const PROVEEDOR = {
  razonSocial: "CORP LOZANOCHEFFER SAC",
  nombreComercial: "eFFe Multiclasificados",
  ruc: "20616009061",
  domicilio: "Ramal Sun S/N – Huaca del Sol – Campiña de Moche, Trujillo, Perú",
} as const;

export const KIND_LABEL: Record<string, string> = { reclamo: "Reclamo", queja: "Queja" };
export const GOOD_LABEL: Record<string, string> = { producto: "Producto", servicio: "Servicio" };

/**
 * Aviso que el Reglamento manda incluir en la hoja. Va tal cual, sin adornos:
 * es una advertencia de derechos, no un texto de marketing.
 */
export const AVISO_LEGAL =
  "La formulación del reclamo no impide acudir a otras vías de solución de " +
  "controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.";

/** Plazo de respuesta del Libro de Reclamaciones. */
export const PLAZO_RESPUESTA = "15 días hábiles";

/**
 * Fecha y hora en Perú.
 *
 * Siempre `America/Lima`: la función corre en un servidor que puede estar en
 * cualquier zona, y la constancia de la hora es justamente lo que se exige.
 */
export function fechaHoraLima(d: Date): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).format(d).replace(", ", " ");
}

/** Los campos de la hoja, en el orden del formulario oficial. */
export function camposDeLaHoja(d: DatosHoja): Array<[string, string]> {
  return [
    ["Tipo de solicitud", KIND_LABEL[d.kind] ?? d.kind],
    ["Nombre completo", d.fullName],
    ["Documento", `${d.docType} ${d.docNumber}`],
    ["Correo electrónico", d.email],
    ["Teléfono", d.phone || "—"],
    ["Domicilio", d.address || "—"],
    ["Tipo de bien contratado", GOOD_LABEL[d.goodType] ?? d.goodType],
    ["Monto reclamado", d.amount || "—"],
    ["Detalle del reclamo", d.description],
    ["Pedido del consumidor", d.request],
  ];
}

const MARGIN = 48;
const ANCHO = A4_W - MARGIN * 2;
const PIE = 796; // A partir de aquí se cambia de página.

/**
 * El PDF que se adjunta al correo: la copia de la hoja tal como quedó
 * registrada. Es el documento que el consumidor puede presentar ante INDECOPI,
 * así que lleva los datos del proveedor, el correlativo y la hora exacta.
 */
export function renderHojaReclamacionPDF(d: DatosHoja): Uint8Array {
  const c = new Lienzo();
  const derecha = A4_W - MARGIN;
  let y = MARGIN + 10;

  /** Reserva `alto` puntos; si no caben, abre otra página. */
  const sitio = (alto: number) => {
    if (y + alto <= PIE) return;
    c.nuevaPagina();
    y = MARGIN + 10;
    c.texto(MARGIN, y, `Hoja de Reclamación N.º ${d.code} (continuación)`, 9, false, 0.45);
    y += 24;
  };

  // Encabezado: quién recibe el reclamo y con qué número quedó.
  c.texto(MARGIN, y, "HOJA DE RECLAMACIÓN", 17, true);
  y += 17;
  c.texto(MARGIN, y, "Libro de Reclamaciones · Código de Protección y Defensa del Consumidor", 9, false, 0.4);
  y += 12;

  c.caja(derecha - 190, MARGIN, 190, 46);
  c.texto(derecha - 180, MARGIN + 18, "N.º de hoja", 9, true, 0.35);
  c.texto(derecha - 180, MARGIN + 37, String(d.code), 15, true);

  y = Math.max(y, MARGIN + 56) + 14;
  c.linea(MARGIN, y, derecha);
  y += 18;

  // Proveedor
  c.texto(MARGIN, y, "Datos del proveedor", 9, true, 0.4);
  y += 14;
  c.texto(MARGIN, y, `${PROVEEDOR.razonSocial} (${PROVEEDOR.nombreComercial})`, 11);
  y += 13;
  c.texto(MARGIN, y, `RUC ${PROVEEDOR.ruc}`, 9, false, 0.35);
  y += 12;
  for (const linea of envolver(PROVEEDOR.domicilio, ANCHO, 9)) {
    c.texto(MARGIN, y, linea, 9, false, 0.35);
    y += 12;
  }
  y += 6;

  // La constancia de fecha y hora, destacada: es lo que da certeza de cuándo se
  // presentó y desde cuándo corre el plazo de respuesta.
  c.caja(MARGIN, y - 11, ANCHO, 30, 0.93);
  c.texto(MARGIN + 10, y + 3, "Registrada el", 9, true, 0.3);
  c.texto(MARGIN + 90, y + 3, `${fechaHoraLima(d.createdAt)} (hora de Perú)`, 10, true);
  y += 34;

  // Los campos de la hoja.
  for (const [etiqueta, valor] of camposDeLaHoja(d)) {
    const lineas = envolver(valor, ANCHO - 8, 10);
    sitio(13 + lineas.length * 12 + 12);
    c.texto(MARGIN, y, etiqueta, 9, true, 0.4);
    y += 13;
    for (const linea of lineas) {
      c.texto(MARGIN + 8, y, linea, 10);
      y += 12;
      // Un relato largo puede desbordar la página a media respuesta.
      if (y > PIE) { c.nuevaPagina(); y = MARGIN + 10; }
    }
    y += 6;
    c.linea(MARGIN, y - 3, derecha, 0.88);
    y += 6;
  }

  // Pie legal.
  const avisoLineas = envolver(AVISO_LEGAL, ANCHO, 9);
  sitio(20 + avisoLineas.length * 12 + 30);
  y += 6;
  for (const linea of avisoLineas) {
    c.texto(MARGIN, y, linea, 9, false, 0.3);
    y += 12;
  }
  y += 6;
  c.texto(
    MARGIN, y,
    `El proveedor responderá este reclamo en un plazo máximo de ${PLAZO_RESPUESTA}.`,
    9, false, 0.35,
  );
  y += 14;
  c.texto(MARGIN, y, "Copia entregada al consumidor por correo electrónico.", 8, false, 0.5);

  return serializarPaginas(c.paginas());
}

export const nombreDelArchivo = (code: string | number) =>
  `Hoja-de-Reclamacion-${code}.pdf`;

// ————————————————————————————————————————————————————————————
// Correos
// ————————————————————————————————————————————————————————————

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function fila(label: string, value: unknown): string {
  return `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:bold;width:200px;vertical-align:top">${esc(label)}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;white-space:pre-wrap">${esc(value)}</td>
  </tr>`;
}

/** La hoja en HTML, para que se lea en el propio correo sin abrir el adjunto. */
export function tablaDeLaHoja(d: DatosHoja): string {
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">
    ${camposDeLaHoja(d).map(([k, v]) => fila(k, v)).join("\n")}
  </table>`;
}

export interface CorreoResend {
  from: string;
  to: string[];
  reply_to?: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: string }>;
}

/**
 * Acuse de recibo para el consumidor.
 *
 * Esto es lo obligatorio: confirma la recepción, adjunta la copia de la hoja y
 * deja dicha la fecha y hora exactas. El `reply_to` apunta a un buzón que
 * existe de verdad —si contesta este correo, alguien tiene que leerlo—, no al
 * remitente `reclamos@`, que no es un buzón real.
 */
export function correoAcuseAlConsumidor(
  d: DatosHoja,
  opts: { from: string; replyTo: string; adjuntoBase64?: string },
): CorreoResend {
  const tipo = KIND_LABEL[d.kind] ?? "Reclamo";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:640px">
      <h2 style="margin:0 0 4px">Recibimos tu ${esc(tipo.toLowerCase())} — Hoja N.º ${esc(d.code)}</h2>
      <p style="color:#6b7280;margin:0 0 16px">Libro de Reclamaciones · ${esc(PROVEEDOR.nombreComercial)}</p>

      <p style="margin:0 0 12px">Hola ${esc(d.fullName)}:</p>
      <p style="margin:0 0 12px">
        Dejamos constancia de que tu ${esc(tipo.toLowerCase())} quedó registrado en nuestro Libro de
        Reclamaciones el <strong>${esc(fechaHoraLima(d.createdAt))}</strong> (hora de Perú) con el
        número <strong>${esc(d.code)}</strong>.
      </p>
      <p style="margin:0 0 12px">
        Adjuntamos la copia de tu Hoja de Reclamación en PDF. Te responderemos a este mismo correo
        dentro del plazo de ley (${esc(PLAZO_RESPUESTA)}).
      </p>

      <h3 style="margin:24px 0 8px;font-size:15px">Copia de la Hoja de Reclamación</h3>
      ${tablaDeLaHoja(d)}

      <h3 style="margin:24px 0 8px;font-size:15px">Datos del proveedor</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${fila("Razón social", PROVEEDOR.razonSocial)}
        ${fila("RUC", PROVEEDOR.ruc)}
        ${fila("Domicilio", PROVEEDOR.domicilio)}
      </table>

      <p style="color:#6b7280;font-size:12px;margin:20px 0 0;line-height:1.6">${esc(AVISO_LEGAL)}</p>
    </div>`;

  return {
    from: opts.from,
    to: [d.email],
    reply_to: opts.replyTo,
    subject: `Copia de tu Hoja de Reclamación N.º ${d.code} — ${PROVEEDOR.nombreComercial}`,
    html,
    ...(opts.adjuntoBase64
      ? { attachments: [{ filename: nombreDelArchivo(d.code), content: opts.adjuntoBase64 }] }
      : {}),
  };
}

/** Aviso interno, para el buzón que atiende los reclamos. */
export function correoAvisoInterno(
  d: DatosHoja,
  opts: { from: string; to: string[]; adjuntoBase64?: string },
): CorreoResend {
  const tipo = KIND_LABEL[d.kind] ?? "Reclamo";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:640px">
      <h2 style="margin:0 0 4px">Nueva ${esc(tipo)} — Hoja N.º ${esc(d.code)}</h2>
      <p style="color:#6b7280;margin:0 0 16px">
        Libro de Reclamaciones · ${esc(PROVEEDOR.nombreComercial)} ·
        registrada el ${esc(fechaHoraLima(d.createdAt))}
      </p>
      ${tablaDeLaHoja(d)}
      <p style="color:#6b7280;font-size:12px;margin:20px 0 0">
        Plazo de respuesta: ${esc(PLAZO_RESPUESTA)} desde la fecha de registro.
        Al consumidor ya se le envió su copia. Responde a este correo para escribirle.
      </p>
    </div>`;

  return {
    from: opts.from,
    to: opts.to,
    reply_to: d.email,
    subject: `[Libro de Reclamaciones] ${tipo} N.º ${d.code} — ${d.fullName}`,
    html,
    ...(opts.adjuntoBase64
      ? { attachments: [{ filename: nombreDelArchivo(d.code), content: opts.adjuntoBase64 }] }
      : {}),
  };
}
